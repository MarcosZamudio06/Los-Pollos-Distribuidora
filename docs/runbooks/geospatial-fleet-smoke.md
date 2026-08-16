# Geospatial Fleet smoke test

This is a controlled staging smoke, not a production data migration. It uses
CEDIS Veracruz and the existing local Photon/OSRM/VROOM/PostGIS services. Do
not download datasets during backend startup; prepare them explicitly with the
maps scripts.

## Preconditions

1. Copy the approved non-secret values from `.env.example` into the deployment
   configuration, including `MAP_DATA_VERSION`, `MAP_DATA_PREPARED_AT`,
   `FLEET_POSITION_STALE_SECONDS`, and `VITE_MAP_STYLE_URL` for production.
2. If `.map-data/photon` or `.map-data/osrm` is absent, run:

   ```bash
   ./scripts/maps/prepare-all.sh
   ```

3. Start the existing stack and verify the four providers:

   ```bash
   docker compose --profile maps up -d postgres photon osrm vroom
   ./scripts/maps/verify-stack.sh
   ./scripts/maps/smoke-route.sh
   ```

If the datasets or Docker services are unavailable, record the smoke as
`NOT_RUN` with the exact missing path or command error. Never convert that
state into a pass.

## Visual vehicle administration

For day-to-day registration, use an authenticated `ADMIN` account with
`fleet.view` and `fleet.manage`:

1. Open **Unidades de entrega** from the operations sidebar (`/fleet/vehicles`).
2. Select **Nueva unidad** and enter the required code and operational name.
3. Optionally assign a plate and active operational base, then select
   **Registrar unidad**. New units start active and become available in the
   route planner catalog.
4. Use **Editar** to update the code, operational name, plate, base, or status.
   Deactivation requires explicit confirmation and is rejected by the backend
   while the unit has an `IN_PROGRESS` route.
5. Use the search and status filters to confirm the saved unit appears in the
   directory. The page preserves the route-planner catalog by invalidating its
   vehicle query after create or update.

## End-to-end flow

Using an authenticated staging ADMIN/DRIVER pair and the CEDIS Veracruz
operational location:

1. Create `UNIDAD-01` through `POST /api/vehicles`.
2. Create a geospatial route plan with `POST /api/delivery-route-plans`.
   Confirm the real Photon results, active vehicle, and `vehicleId`.
3. Confirm the route with `POST /api/delivery-routes`. Confirm that its
   persisted geometry is the OSRM geometry and that
   `routingDataVersion` is retained.
4. Start the route with `PATCH /api/delivery-routes/:id/status` to
   `IN_PROGRESS`.
5. Publish two or more GPS readings through
   `POST /api/fleet/positions`. Verify that `vehicleId` and `driverId`
   are derived server-side, `positionPoint` uses
   `[longitude, latitude]`, and the same `clientEventId` is idempotent.
6. Open `/delivery-routes/live`. Verify the REST snapshot, MapLibre vehicle
   feature, persisted route line, and `fleet.position.updated` delta. Stop the
   socket temporarily and verify the last snapshot remains visible; reconnect
   and verify exactly one REST reconciliation.
7. Create an active Polygon delivery zone for the Veracruz origin. Publish a
   point inside and then outside. Verify one backend `ENTER` and one `EXIT`
   event, with the exact `positionId` in the database and the corresponding
   Fleet timeline event.
8. Register a delivery incident through the existing
   `POST /api/delivery-orders/:id/incidents`. Verify the existing status,
   returned items, and inventory movements remain intact; the GPS location is
   the latest persisted route position or null, never a client-supplied GPS
   coordinate.
9. Complete the route. Verify tracking stops accepting positions after the
   status change and the route, positions, geofence events, and incident
   history remain queryable.

## Retention behavior

The backend runs the Fleet position-retention job daily. It keeps positions
online for `FLEET_POSITION_RETENTION_DAYS` (365 days by default), deletes old
positions in bounded batches, and protects positions referenced by geofence
events or delivery incidents. The mutable geofence-state pointer is cleared
before an eligible position is deleted. No external archive is currently
exposed by the Fleet history endpoint.

## Evidence to attach

- Redacted technical status response (service names, statuses, routing data
  version, Fleet persistence status, and aggregate position age only).
- Provider verification output and the controlled OSRM route result.
- Redacted route/position/geofence/incident identifiers and status transitions.
- Frontend test evidence for stable MapLibre instance, reconnect recovery,
  stale state, and absence of direct Photon/VROOM/OSRM requests.
