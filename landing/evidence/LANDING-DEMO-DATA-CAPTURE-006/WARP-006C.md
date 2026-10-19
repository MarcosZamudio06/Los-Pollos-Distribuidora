# Task 006C — verify the existing container without mutation

**Do not run create again.** The existing original resource is sufficient for
verification; SQL identity acceptance remains pending this Warp run.

## Exact command — Warp only

```sh
cd /Users/marcoszamudio/Documents/Dev/pollos-distribuidor
python3 scripts/landing_demo_006b.py resume \
  /tmp/landing-demo-006b-06x847f7 \
  --expected-container 5ca2b7a0aa96fffcd24f8c4db0b952cd106401219adcd1e52f556155a9b05363 \
  --expected-port 63865
```

Purpose: read the original `created.json` and verify only its exact container,
local context, name, image, ownership label, restart policy, tmpfs-only storage,
loopback port, and reconstructed DATABASE_URL. Then execute a read-only SELECT
of current database/user/PostGIS inside that same container.

Safety: explicit expected full ID must match the original manifest before Docker
is called. The expected port must match live inspect before SQL is called. Private
manifest/directory must be owned by the current user, not symlinks, with no group
or other permissions. Storage still rejects host/volume mounts, missing/extra
Tmpfs destinations and non-rw configuration. No state.json, connection.env or
isolation.json is created by resume. No container start/create/stop/delete,
migration, seed, extension creation or business-data write occurs. The command
prints only sanitized evidence; never paste original private files or credentials.

Expected successful gate: `ISOLATION_VERIFIED_NO_APP_WRITES`, followed by
`RESUME_READ_ONLY`. Return that stdout. Do not interpret the label as application,
stock or screenshot acceptance. Keep the tmpfs container running.

## Proven cause and correction

The user's selective inspect shows `Mounts: []` and
`HostConfig.Tmpfs: {"/var/lib/postgresql/data":"rw"}`. The previous verifier
required `len(Mounts) == 1`, so it rejected this valid --tmpfs representation.
This is the exact predicate reproduced by the regression. It executes before
state.json is persisted, explaining why only created.json/postgres.env remain.
The generic exception handler concealed the specific predicate.

The correction checks the exact Tmpfs configuration and permits Mounts to be
empty or to contain only its matching tmpfs entry. It does not permit volumes,
binds or additional destinations. A read-only resume operation addresses the
separate partial-manifest recovery gap, without overwriting the original files.
Shared SQL identity logic is reused by verify/resume; existing verify's legacy
isolation.json output behavior is unchanged. Use resume, not verify, here.

## Evidence and checks

- `host-inspect-006c.json`: sanitized user-provided host output, not a Codex Docker run.
- Original private manifest identity compared in memory against every supplied
  nonsecret host field and the proposed URL; corrected validation returns 63865.
- RED: observed Docker shape fails at old Mounts length predicate; recovery tests
  also fail before resume exists. GREEN: 16 offline tests pass after correction.
- Coverage includes the actual storage shape, wrong/missing/additional Tmpfs,
  foreign ID/label/name/image/database/URL, volumes, public binding, stopped
  container, remote context, manifest mismatch before Docker, wrong port before
  SQL, and successful mocked recovery with unchanged original file and no new files.
- Mock success prints neither password nor connection URL. These are offline
  checks, not a live SQL identity result.
- Task 005: 32 preservation hashes match; 20 approved image hashes unchanged.
- No Docker command or database operation was run by Codex. No commit/push/merge
  or cleanup. Landing source, design, assets and seeds are unchanged.

DEMO_ENV_GO: **BLOCKED pending successful live resume output**. Structural host
identity matches the original manifest, but actual database/user/PostGIS must
still be read back in Warp. DATA_INTEGRITY_GO/ASSET_QUALITY_GO remain BLOCKED;
VISUAL_GO NOT VERIFIED.
