# Module Spec — Routes / Delivery

## Canonical status

This is the canonical module spec for route assignment, delivery execution, route collection, incidents, returns, and route settlement.

Deprecated aliases:

- `specs/modules/routes/spec.md`
- `specs/modules/rutas-reparto/spec.md`

## Objective

Control route planning, geographic optimization, assignment, delivery, evidence, route collections, incidents, returns, and operational settlement for orders assigned to drivers.

## Capabilities

- Create route.
- Assign driver.
- Associate route with origin operational location when applicable.
- Create or associate `ROUTE_STOCK` per route.
- Assign confirmed orders or sales.
- Geocode the origin and delivery stops without replacing the business address silently.
- Optimize one driver's stop sequence by travel time.
- Persist the approved round trip, distance, duration, and ordered stops.
- Update route status.
- Update delivery-order status.
- Register delivery.
- Register non-delivery, return, partial rejection, or incident.
- Capture delivery evidence.
- Register route collections when there is collectible balance and policy allows it.
- Review route operations from the driver experience.
- Settle the route by reconciling delivered orders, returned product, incidents, and money collected.
- Track active route positions from the authenticated driver's browser or device.
- Review live fleet state, persisted route positions, geofence events, and incident heatmaps.
- Manage delivery zones and geofences as persisted operational polygons.

## Entities

- DeliveryRoute.
- DeliveryRoutePlanDraft.
- Vehicle.
- VehiclePosition.
- DeliveryZone.
- GeofenceEvent.
- DeliveryIncident.
- DeliveryOrder.
- DeliveryEvidence.
- RouteSettlement.
- Sale.
- AccountReceivable.
- Payment.
- OperationalLocation.
- InventoryMovement.
- User.

## Geospatial planning

- A planned stop always represents one confirmed sale; free-form operational stops are outside the first version.
- `Vehicle` is a separate operational entity from `User` and the `DRIVER` role. A driver assignment never makes a user a vehicle, and a vehicle never substitutes for the authenticated user.
- A new geospatial route uses one active `DRIVER`, one active `Vehicle`, one origin `OperationalLocation`, and one or more eligible sales.
- `DeliveryRoute.vehicleId` is nullable in persistence for compatibility with historical and legacy non-geospatial routes, but is required for every new geospatial route.
- The route starts and ends at the same operational origin.
- Photon is the self-hosted forward/search and reverse geocoder.
- VROOM determines the stop order for one vehicle, minimizing driving time.
- OSRM calculates the final road geometry, distance, and duration for the VROOM order.
- Coordinates use WGS84 (`EPSG:4326`) and are represented as `[longitude, latitude]` in GeoJSON and routing-engine payloads.
- MapLibre GL JS renders the approved geometry, stops, positions, and zone polygons. It does not geocode, optimize, calculate routes, or provide traffic data.
- The approved route plan is immutable after the route starts. Any stop change while `PENDING` requires a new optimization covering all existing and new stops.
- VROOM remains single-vehicle: fleet views may display many vehicles and routes, but route optimization never becomes multi-vehicle optimization.
- The approved route remains the navigation reference; turn-by-turn navigation, automatic rerouting, offline maps, vehicle capacity, and time windows are excluded.

## Fleet tracking and geofencing

- A `VehiclePosition` is accepted only while its derived route is `IN_PROGRESS`.
- The initial GPS sample is obtained from the authenticated `DRIVER` browser or device and published through the backend. The client must not choose or override `vehicleId`, `driverId`, or `routeId`.
- The backend derives `driverId` from the JWT and derives `routeId` and `vehicleId` from the driver's active route assignment. It rejects arbitrary identifiers, stale assignments, invalid coordinates, and positions outside an active route.
- Accepted positions are historical records persisted in PostGIS with WGS84 point coordinates and a reference to the route, vehicle, driver, and capture time.
- Position collection stops when the route becomes `COMPLETED` or `CANCELLED`; no GPS is collected outside an active route.
- `GET /api/fleet/live` reconstructs the administrative snapshot from persisted database state. Socket.IO is a delta transport only; after reconnect the client reconciles once with the REST snapshot and retains the last cache while disconnected.
- Backend startup must not download OSM, Photon, VROOM, or OSRM datasets. Existing map-data preparation scripts remain an explicit deployment/operations step.
- `GET /api/delivery-routing/technical-status` reports provider, routing-data, and Fleet-persistence health as aggregated operational status; it does not expose internal provider URLs or personal data.
- `DeliveryZone` geometry is a valid GeoJSON `Polygon` persisted and queried through PostGIS. Coordinates use `[longitude, latitude]` and the polygon rings must be closed and valid.
- Geofence detection is backend authority. The backend evaluates persisted route positions against active delivery-zone polygons and creates `GeofenceEvent` records; clients cannot assert, rewrite, or delete geofence events.
- `DeliveryIncident` records preserve route, order when applicable, vehicle, driver, position, zone, reason, timestamps, evidence, and resolution history. Incidents are operationally traceable and are not only map annotations.
- Fleet heatmaps v1 are calculated from persisted delivered-order stop coordinates or delivery incidents, aggregated into bounded PostGIS grid cells. They must not be fabricated from client-only state.
- Socket.IO publishes only `fleet.position.updated`, `fleet.route.updated`, `fleet.incident.created`, `fleet.geofence.entered`, and `fleet.geofence.exited` in namespace `/fleet` using path `/api/socket.io`; global fleet subscriptions require `fleet.view`.
- Live traffic is not provided. A future `TrafficLayer` may be added only after selecting and authorizing an external traffic source; the current map must not claim live traffic.
- The internal `TrafficProvider` contract is replaceable and exposes `getTrafficSnapshot(bounds, observedAt)`, `getCapabilities()`, and `healthCheck()`. `NullTrafficProvider` is the default and returns no segments. The technical-status response reports `traffic: { available, provider }`; it must be `{ available: false, provider: null }` until a provider is contracted and approved.
- Two future strategies are compatible with this contract: (A) an approved commercial traffic provider adapter, or (B) an external-speed pipeline feeding OSRM plus an owned cartographic traffic layer. Neither strategy is implemented or selected in the current scope, and static OSM data must never be labeled as live traffic.

The canonical geospatial contracts are:

- `Vehicle`: `id`, unique `code`, `displayName`, optional unique `plateNumber`, optional `homeLocationId`, `isActive`, `createdAt`, and `updatedAt`.
- `VehiclePosition`: `id`, unique `clientEventId`, `vehicleId`, `routeId`, `driverId`, `latitude`, `longitude`, `positionPoint geometry(Point,4326)`, optional `accuracyMeters`, optional `speedKph`, optional `headingDegrees`, `recordedAt`, and `receivedAt`.
- `DeliveryZone`: `id`, `name`, `originLocationId`, `geometry` GeoJSON `Polygon`, `zoneGeometry geometry(Polygon,4326)`, `isActive`, `createdBy`, `updatedBy`, `createdAt`, and `updatedAt`.
- `GeofenceEvent`: persisted `id`, `zoneId`, `vehicleId`, `routeId`, `positionId`, `type` (`ENTER` or `EXIT`), and `occurredAt`.
- `DeliveryIncident`: associated with `DeliveryOrder` and/or `DeliveryRoute`, `reportedByUserId`, `reason`, `statusSnapshot`, optional `latitude`/`longitude`, `occurredAt`, and the existing `returnedItems` trace when applicable.

## Rules

- Only confirmed sales can be assigned.
- Do not assign cancelled sales.
- Do not optimize or assign a sale already assigned to another route.
- A mapped route must have a geocoded origin and every stop must have validated coordinates.
- A search result, reverse-geocoded label, or moved marker must not overwrite the sale or customer address silently; the delivery order preserves the selected planning address separately.
- Route creation from a geographic plan must revalidate the active driver, origin, sales, receivables, and concurrent assignments before persistence.
- Route creation or assignment must derive the sale's `accountReceivableId` when the request omits it, while rejecting a provided receivable that belongs to another sale.
- Route creation from a geographic plan must revalidate the active vehicle and require its `vehicleId`; the vehicle must be active and available for the scheduled route.
- Starting a route with `IN_PROGRESS` is an atomic exclusivity check: one vehicle cannot have two `IN_PROGRESS` routes. A conflict rejects the transition without changing either route.
- An optimization with unreachable or unassigned stops must not create a route.
- A routing or geocoding provider failure must not create partial route, order, inventory, payment, or settlement records.
- A route plan expires after 30 minutes and may be consumed only once. A retry with the same idempotency key returns the route already created.
- Historical routes without coordinates remain readable through the existing text-only experience.
- Historical routes without a vehicle remain readable; `vehicleId=null` is a supported legacy state and must not be backfilled with an invented vehicle.
- Drivers only see their own routes.
- Drivers only update orders assigned to them.
- `DRIVER` may publish positions only for the active route derived from its JWT and may never access the global fleet view.
- `fleet.view` is required for live fleet, historical position, geofence-event, and heatmap reads; `fleet.manage` is required for vehicle administration; `fleet.zones.manage` is required for delivery-zone administration; `fleet.position.publish` is required for GPS publication.
- `ADMIN` has all four fleet permissions. No role receives global fleet visibility implicitly from being a driver.
- Delivered orders must store `deliveredAt`.
- Delivery evidence is part of the MVP.
- Evidence may include photo, signature, geolocation, note, or a combination; the exact required combination remains a business decision.
- Driver mobile experience is part of the MVP; offline support remains pending and must not be assumed without a later spec.
- If the order has collectible balance, the driver may register a route collection only when policy allows it.
- In the MVP, every route collection recorded as `Payment` applies to exactly one receivable through required `Payment.accountReceivableId`.
- A route collection requires an `Idempotency-Key` and the current `AccountReceivable.version` as `expectedVersion`.
- Route collection payment creation and receivable balance mutation run in a `Serializable` transaction with bounded `P2034` retry; the receivable update is conditional on its version and increments it atomically.
- Reusing an idempotency key with the same canonical payload returns the persisted payment; reusing it with a different payload is rejected without a second payment.
- The driver route detail exposes each order's current outstanding receivable balance and the collected amount derived from `Payment` records for that receivable within the route.
- Route collections may be associated to route and settlement.
- Cash on delivery or pay-on-delivery counts as money received only when a `Payment` exists.
- All physical route load and return operations must go through `InventoryTransfer` to or from `ROUTE_STOCK`.
- Every `ROUTE` channel sale consumes inventory from `ROUTE_STOCK`.
- Double decrement between route load and delivered route sale is forbidden.
- Route completion requires orders closed, cancelled, or with final incident recorded.
- Route settlement compares expected vs collected amounts by payment method and records differences.
- Returns, partial rejections, or product differences must preserve operational traceability and, when they affect stock, create inventory movement with mandatory reason.

## Permissions

- ADMIN: create and manage routes, review evidence, authorize incidents, and close or review settlements.
- DRIVER: consult and update own routes, capture evidence, register incidents, allowed collections, and publish positions only with `fleet.position.publish`; DRIVER never receives global `fleet.view`.
- COLLECTIONS: consult route collections, related balances, and settlements; register or reconcile payments according to permissions.
- SELLER: may consult status when applicable.
- WAREHOUSE: may consult returns or related movements when inventory is affected.

Fleet permissions:

- `fleet.view`: read the authorized fleet map, live state, historical positions, geofence events, and persisted heatmap data.
- `fleet.manage`: create and update vehicles and review fleet operational state.
- `fleet.position.publish`: publish GPS positions for the authenticated driver's active route only.
- `fleet.zones.manage`: create and update delivery zones and geofences.
- ADMIN has all fleet permissions. DRIVER has only `fleet.position.publish` from this set and never `fleet.view` global.

## API

Exact routes must be defined in:

- `specs/.specs/03-api/delivery-api.md`
- `specs/.specs/03-api/route-settlements-api.md`

## UI

- Admin route table.
- Geospatial route planner with eligible-sale selection, address search, map pinning, optimization preview, and confirmation.
- Administrative fleet map with multiple active vehicles and routes, current positions, approved route geometry, delivery-zone polygons, geofence events, and persisted incident heatmaps.
- Vehicle administration and delivery-zone administration according to fleet permissions.
- Order assignment.
- Driver route list with the approved route map, ordered stops, and active-route GPS publishing when geographic data exists and the route is `IN_PROGRESS`.
- Evidence review.
- Settlement view.

The fleet map uses MapLibre GL JS only as a renderer. It does not expose Photon, VROOM, or OSRM to the browser, does not calculate routes, and does not claim live traffic. A `TrafficLayer` remains future scope pending an external traffic source.

## Minimum tests

- Create route.
- Geocode origin and delivery addresses.
- Reject a geographic plan with a missing coordinate.
- Optimize one stop as origin, delivery, origin.
- Optimize multiple stops and preserve every sale exactly once.
- Reject unreachable or unassigned stops.
- Reject an expired or already consumed route plan.
- Revalidate concurrent assignment before consuming a plan.
- Persist the same stop order, geometry, distance, and duration returned by the approved plan.
- Require `vehicleId` for a new geospatial route and preserve `vehicleId=null` for historical routes.
- Reject starting two routes with the same vehicle in `IN_PROGRESS`.
- Re-optimize all stops when adding an order to a mapped pending route.
- Preserve text-only access to a historical route without geometry.
- Accept initial GPS only from the authenticated DRIVER active route and persist positions in PostGIS.
- Reject GPS after route completion/cancellation or outside an active route.
- Create backend-authoritative enter/exit geofence events from persisted positions.
- Restrict global fleet reads to `fleet.view` and position publication to `fleet.position.publish`.
- Build heatmap results from persisted position or incident data.
- Assign confirmed order.
- Reject cancelled sale assignment.
- Driver only sees own routes.
- Mark order as delivered.
- Store delivery timestamp.
- Capture allowed evidence.
- Capture PHOTO evidence from a supported device camera/file input and persist the bounded image value through the existing delivery-evidence contract.
- Register route collection associated to one receivable.
- Reject route collection without receivable in MVP.
- Derive collected amounts from `Payment`, not from a duplicated persisted money field.
- Register incident or return.
- Settle route and calculate expected vs collected difference.
- Prepare route load with `ROUTE_STOCK`.
- Reject delivery or return without operational route location.
