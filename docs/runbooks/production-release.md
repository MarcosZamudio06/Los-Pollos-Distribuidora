# Production image release

The production VPS consumes release images by digest. It does not build the
application or GIS wrapper images from the checkout. The development Compose
file remains the local build path.

## Quick path

1. Merge to `main` only after the **CI Gate** check is green.
2. The separate **Release Images** workflow runs from that validated commit.
3. Download its `release-digests-<commit>` artifact and copy the five immutable
   image references into the root-only production environment file.
4. Render, pull, migrate, bootstrap, deploy, and smoke-test the stack:

   ```bash
   export COMPOSE_ENV=/etc/pollos-distribuidor/production.env
   docker compose --env-file "$COMPOSE_ENV" \
     -f docker-compose.production.yml config >/dev/null
   docker compose --env-file "$COMPOSE_ENV" \
     -f docker-compose.production.yml pull
   docker compose --env-file "$COMPOSE_ENV" \
     -f docker-compose.production.yml --profile migration run --rm migrate
   docker compose --env-file "$COMPOSE_ENV" \
     -f docker-compose.production.yml --profile migration run --rm bootstrap
   docker compose --env-file "$COMPOSE_ENV" \
     -f docker-compose.production.yml up -d --wait
   docker compose --env-file "$COMPOSE_ENV" \
     -f docker-compose.production.yml ps
   ```

5. Verify `/api/health/live`, `/api/health/ready`,
   `/api/health/dependencies`, `/maps/health`, the controlled route smoke, and
   the Caddy public hostnames.

## Release workflow

`.github/workflows/release-images.yml` is intentionally separate from the
quality gate. It is triggered only after a successful `Quality Gate` run on
`main` and checks out that exact `head_sha`. It uses only the automatic
`GITHUB_TOKEN` with `contents: read` and `packages: write`; no PAT is required.

The workflow publishes these GHCR repositories:

| Image        | Release tags                 | Production reference         |
| ------------ | ---------------------------- | ---------------------------- |
| `backend`    | `sha-<commit>`, `main-<run>` | `backend@sha256:<digest>`    |
| `frontend`   | `sha-<commit>`, `main-<run>` | `frontend@sha256:<digest>`   |
| `photon`     | `sha-<commit>`, `main-<run>` | `photon@sha256:<digest>`     |
| `osrm`       | `sha-<commit>`, `main-<run>` | `osrm@sha256:<digest>`       |
| `tileserver` | `sha-<commit>`, `main-<run>` | `tileserver@sha256:<digest>` |

No `latest` tag is produced. The workflow writes the registry digest for every
image to its step summary and uploads `release-digests.json` as a 90-day
artifact. The artifact is the deployment record; do not copy a mutable tag
into the VPS environment.

The frontend release is built with the example public origin
`https://objects.example.com` and the same-origin map style path. When real
hostnames are approved, create a new release with the approved
`OBJECT_STORAGE_PUBLIC_ORIGIN` build argument and update Caddy and the
production environment together. This is a public configuration value, not a
secret, and changing it after the image is built would leave the CSP stale.

## Image contract

`docker-compose.production.yml` has no `build` sections. These services must
receive immutable references from the environment:

- `BACKEND_IMAGE` is used verbatim by `migrate`, `bootstrap`, and `backend`.
- `FRONTEND_IMAGE` is the frontend runtime image.
- `PHOTON_IMAGE`, `OSRM_IMAGE`, and `TILESERVER_IMAGE` are the GHCR wrapper
  images produced by the same release workflow.

The exact backend digest must be shared by the two one-shot jobs and the
long-lived backend. This prevents a migration from running with a different
Prisma Client or schema contract than the runtime that follows it.

Development keeps `docker-compose.yml` build contexts and local image tags.
CI continues to build backend/frontend for validation, while the release
workflow builds and publishes the deployable images. A production VPS must not
run `docker compose build` or use a checkout-local fallback image.

The remaining production runtime images are pinned in Compose by a readable
version plus digest:

- PostGIS `16-3.5-alpine`;
- SeaweedFS `4.29`;
- VROOM `v1.15.0`.

Dockerfile bases for Node, Nginx, Eclipse Temurin, OSRM, and TileServer are
also digest-pinned. Updating one requires an explicit image/version review and
a new release.

## Environment and secrets

Start from `.env.production.example` and store the actual file outside the
checkout, for example `/etc/pollos-distribuidor/production.env`, readable only
by the deployment operator and the Docker client. It contains no real secret
in Git. Required runtime secrets include:

- `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`;
- SeaweedFS access credentials and the evidence bucket;
- `SEED_ADMIN_PASSWORD`, supplied only to the interactive one-shot bootstrap;
- separate `BACKUP_S3_*` credentials for Backblaze B2.

GitHub Actions receives only its built-in `GITHUB_TOKEN`. Cloudflare tokens,
certificates, private keys, B2 credentials, and application secrets belong to
their respective host/provider secret stores and must never be copied into a
workflow, Dockerfile, image layer, log, or template with a real value.

The production environment preserves the internal/public separation:

```text
OBJECT_STORAGE_ENDPOINT=http://object-storage:8333
OBJECT_STORAGE_PUBLIC_ENDPOINT=https://objects.example.com
OBJECT_STORAGE_PUBLIC_ORIGIN=https://objects.example.com
MAP_DATA_DIR=/srv/pollos-distribuidor/maps
```

The development template instead uses `./.map-data`, localhost CORS, and the
loopback signed-URL origin. Do not use `.env.example` for a production deploy.

## Rollback

Keep the previous release digest pair in the deployment record. To roll back:

1. Replace `BACKEND_IMAGE`, `FRONTEND_IMAGE`, `PHOTON_IMAGE`, `OSRM_IMAGE`, and
   `TILESERVER_IMAGE` with the previous release references as appropriate.
2. Render the Compose file and pull by digest.
3. Recreate the affected services with `docker compose up -d --wait`.
4. Re-run readiness, dependency, map, frontend, and route smokes.

Do not automatically roll back database schema changes. The backend runbook's
expand/contract rule applies: only release code that is compatible with the
current schema may be restored without a separate database recovery decision.

## Go-live checklist

- [ ] `CI Gate` succeeded for the exact commit.
- [ ] `Release Images` produced and retained `release-digests.json`.
- [ ] All five custom images are referenced by `@sha256:` on the VPS.
- [ ] `migrate`, `bootstrap`, and `backend` use the same backend digest.
- [ ] `docker compose pull` completed without a build fallback.
- [ ] Only frontend `127.0.0.1:3000` and Object Storage `127.0.0.1:8333` are
      published.
- [ ] Caddy, health, GIS, Object Storage, and authenticated application smokes
      passed.
