# Production container hardening

The production Compose file uses capability profiles rather than one blanket
policy. The stateless profile is applied to the backend, migration/bootstrap
one-shots, frontend, Photon process, OSRM, VROOM, and TileServer. The stateful
profile is intentionally smaller for PostgreSQL and SeaweedFS because their
official entrypoints initialize writable data and drop to their service users.

## Effective identities and write boundaries

| Service            | Effective runtime identity                                           | Root filesystem | Writable paths                   | Reason for exception                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------- | --------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| backend            | `node:node` (UID/GID 1000)                                           | read-only       | `/tmp` tmpfs                     | NestJS writes application data to PostgreSQL/Object Storage, not the image                                                                                               |
| migrate/bootstrap  | `node:node` (UID/GID 1000)                                           | read-only       | `/tmp` tmpfs                     | Prisma CLI and bootstrap share the backend release image                                                                                                                 |
| frontend           | `nginx:nginx` (UID/GID 101)                                          | read-only       | `/tmp`, `/var/cache/nginx` tmpfs | Nginx needs a PID/cache location while serving on unprivileged port 3000                                                                                                 |
| Photon             | `photon:photon` (UID/GID 1000)                                       | read-only       | `/data` bind mount, `/tmp` tmpfs | Lucene/OpenSearch-compatible Photon data needs locks and index writes                                                                                                    |
| OSRM               | `nobody:nobody` (UID/GID 65534)                                      | read-only       | none; `/tmp` tmpfs               | The MLD dataset is consumed read-only                                                                                                                                    |
| VROOM              | `node:node` (UID/GID 1000)                                           | read-only       | `/tmp/vroom` under `/tmp` tmpfs  | VROOM Express writes request files and rotating logs; the vendor entrypoint also writes `/conf` and is bypassed; the config is mounted read-only at the application path |
| TileServer         | `node:node` (UID/GID 999)                                            | read-only       | `/tmp` tmpfs                     | Existing hardening is preserved; datasets/config are read-only                                                                                                           |
| PostgreSQL/PostGIS | official entrypoint; PostgreSQL runs as `postgres` (UID 70)          | writable        | `/var/lib/postgresql/data`       | The official entrypoint needs root during initialization and owns the data directory                                                                                     |
| SeaweedFS          | entrypoint starts as root, process drops to `seaweed` (UID/GID 1000) | writable        | `/data` volume                   | The vendor entrypoint verifies/fixes volume ownership before dropping privileges                                                                                         |

All stateless services use `no-new-privileges`, `cap_drop: ALL`, read-only
rootfs, and a temporary filesystem. PostgreSQL and SeaweedFS use only
`no-new-privileges`; dropping all capabilities or making their rootfs read-only
would interfere with their documented initialization/ownership behavior.

## Backend runtime image

`docker/backend/Dockerfile` uses dependency, build, and runtime stages. The
runtime stage copies compiled application output and the Prisma schema/migrations
only. It prunes development dependencies and reinstalls only the exact
operational `prisma`, `ts-node`, and `typescript` tools required by the
production migration/bootstrap one-shots. The runtime image declares `USER
node`; the one-shot services use that same identity and image digest.

The runtime does not receive a writable application or upload directory. Uploads
and delivery evidence use the Object Storage contract. `/tmp` is the only
temporary write location.

## GIS ownership and rollout

Do not run a recursive `chown` automatically and do not change active datasets
as part of deployment. Before a planned Photon hardening rollout, verify the
candidate data directory is writable by UID/GID `1000:1000`:

```bash
MAP_DATA_DIR=/srv/pollos-distribuidor/maps
stat -c '%u:%g %a %n' "$MAP_DATA_DIR/photon"
```

If an operator-approved maintenance window requires an ownership change, take
the normal dataset/backup precautions first and run the explicit host operation
manually, not from Compose or a refresh script:

```bash
sudo chown -R 1000:1000 "$MAP_DATA_DIR/photon"
```

OSRM, rendering, styles, fonts, and TileServer mounts remain read-only. A
failed Photon ownership preflight must leave the active dataset untouched.

## Verification

Render the production Compose file with the real private environment file and
inspect the effective settings before a rollout:

```bash
docker compose --env-file /etc/pollos-distribuidor/production.env \
  -f docker-compose.production.yml config --quiet

for service in postgres object-storage photon osrm vroom tileserver backend frontend; do
  docker compose --env-file /etc/pollos-distribuidor/production.env \
    -f docker-compose.production.yml ps "$service"
done

docker inspect <container> --format \
  'user={{.Config.User}} readonly={{.HostConfig.ReadonlyRootfs}} security={{json .HostConfig.SecurityOpt}} capdrop={{json .HostConfig.CapDrop}} mounts={{json .Mounts}}'
```

Do not print the production environment file or secrets. After a controlled
rollout, run the standard readiness/dependency and GIS smokes. In particular,
verify PostgreSQL `SELECT 1`, Photon geocoding, the OSRM route, VROOM
optimization, TileServer style/tile serving, frontend HTTP, and an isolated
Object Storage PUT/HEAD/DELETE test object.
