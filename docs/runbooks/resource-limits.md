# Production resource guardrails

The single-host production stack targets 8 vCPU and 24 GiB RAM. These values
are conservative first guardrails, not final capacity sizing. The Compose
contract uses standard `mem_limit` and `cpus` fields so Docker Compose applies
them without Swarm mode.

## Quick path

1. Keep the resource variables in the production environment file separate
   from application secrets.
2. Render the contract before changing a deployment:

   ```bash
   docker compose -f docker-compose.production.yml config >/dev/null
   ```

3. Recreate only the services whose limits changed:

   ```bash
   docker compose -f docker-compose.production.yml up -d --force-recreate \
     postgres backend frontend object-storage photon osrm vroom tileserver
   ```

4. Measure `docker stats`, host memory, health, restart counts, and OOM state
   before and after the change.

## Initial budget

| Service | Memory limit | CPU limit | Rationale |
| --- | ---: | ---: | --- |
| PostgreSQL/PostGIS | 3.5 GiB | 1.25 | Conservative database cap; image defaults remain in use. |
| Backend | 2 GiB | 1.25 | Leaves 512 MiB outside Node old-space. |
| Frontend Nginx | 512 MiB | 0.5 | Static files and proxying need little memory. |
| SeaweedFS | 768 MiB | 0.5 | Private S3 gateway with bounded initial footprint. |
| Photon | 6 GiB | 1.5 | JVM heap plus native/Lucene/mmap margin. |
| OSRM | 5 GiB | 1.5 | Mexico routing dataset runtime guardrail. |
| VROOM | 1 GiB | 0.5 | Limited to one vehicle and two configured threads. |
| TileServer GL | 1.5 GiB | 0.5 | Renderer and Node runtime margin. |
| **Total service cap** | **20.25 GiB** | **7.5 vCPU** | **Initial maximum, not a reservation.** |

The budget leaves **3.75 GiB RAM** and **0.5 nominal CPU** outside service
limits for Ubuntu, the Docker daemon, kernel memory, filesystem/page cache, and
administrative work. Docker CPU limits are quotas, not reservations; idle
capacity remains available to the host and other work. Do not raise several
limits together without re-measuring the total budget.

The defaults are configurable through the matching `*_MEM_LIMIT` and `*_CPUS`
variables in `.env.example`.

## Runtime heaps and PostgreSQL

Photon receives:

```text
JAVA_TOOL_OPTIONS=-Xms1g -Xmx4g
```

The 4 GiB maximum heap is below the 6 GiB container cap, leaving approximately
2 GiB for JVM native memory, threads, Lucene/OpenSearch mappings, and other
process overhead. Change `PHOTON_JAVA_XMS` and `PHOTON_JAVA_XMX` together with
`PHOTON_MEM_LIMIT`; never set Xmx equal to the container limit.

The backend receives `NODE_OPTIONS=--max-old-space-size=1536`. This keeps
approximately 512 MiB below its 2 GiB cap for Node native allocations,
buffers, report generation, and uploads. Increase the heap only after checking
real peak memory and legitimate report/upload behavior.

PostgreSQL does not receive an aggressive `shared_buffers`, `work_mem`, or
`max_connections` override yet. The PostGIS image defaults are intentionally
preserved until production connection counts, query patterns, and memory peaks
are measured. The container cap is the first guardrail; migrations and PostGIS
behavior are not changed by this task.

## GIS preprocessing guardrails

Heavy preparation is separate from runtime services:

- `prepare-osrm.sh` applies the job limits to `osrm-extract`,
  `osrm-partition`, and `osrm-customize`.
- `prepare-rendering.sh` applies them to Planetiler.
- `prepare-photon.sh` decompresses the Photon archive inside a limited Docker
  job using `PHOTON_PREP_IMAGE` (default `alpine:3.21`), rather than unbounded
  host `tar`.

The defaults are:

```text
MAP_PREPROCESS_MEMORY_LIMIT=4g
MAP_PREPROCESS_CPUS=2
PHOTON_PREP_IMAGE=alpine:3.21
```

All preparation scripts share `${MAP_DATA_DIR}/.map-preprocessing.lock`. `prepare-all`
holds the lock across the complete sequence, and `refresh-monthly.sh` holds it
through the maintenance refresh and verification. A second heavy preparation
fails closed. If a process was killed, confirm that no preparation process is
running before removing the stale lock directory manually.

The existing active-consumer guards remain in place: stop backend, VROOM,
Photon, OSRM, and TileServer before replacing their bind-mounted datasets.
Never run a preparation job against active production data, and never run two
heavy GIS jobs concurrently.

The storage/provenance and disk-capacity contract is documented in
[`maps-deployment.md`](./maps-deployment.md). The preprocessing limits only
bound CPU/RAM; the common disk preflight must also pass before a download,
staging copy, extraction, Planetiler run, or monthly refresh.

## Measurement checklist

Run these commands on the VPS during a representative, non-destructive window:

```bash
docker stats --no-stream
free -h
vmstat 1 5
docker events --since 1h --filter event=oom

docker inspect --format \
  '{{.Name}} oom={{.State.OOMKilled}} restarts={{.RestartCount}} memory={{.HostConfig.Memory}} cpus={{.HostConfig.NanoCpus}}' \
  $(docker compose -f docker-compose.production.yml ps -q)
```

Record peak memory during the real Mexico dataset preparation and the normal
route/report workload. Treat an OOM event, repeated restart, swap pressure, or
host memory below the operating reserve as a sizing failure. Adjust one
service/job at a time, rerender Compose, recreate the affected container, and
repeat the measurements.

## Operational boundaries

- Resource changes do not change application logic, database schema, or ports.
- `migrate` and `bootstrap` remain explicit `restart: "no"` one-shot jobs.
- PostgreSQL, GIS, backend, and TileServer remain private on `app_network`.
- The frontend and SeaweedFS loopback bindings remain unchanged.
- Final sizing requires measurements with the real Mexico dataset and real
  concurrent ERP/report traffic; these initial limits must not be treated as a
  performance guarantee.
