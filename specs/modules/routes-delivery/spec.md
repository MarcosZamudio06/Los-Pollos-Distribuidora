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

## Entities

- DeliveryRoute.
- DeliveryRoutePlanDraft.
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
- A geospatial route uses one active `DRIVER`, one origin `OperationalLocation`, and one or more eligible sales.
- The route starts and ends at the same operational origin.
- Photon is the self-hosted forward and reverse geocoder.
- VROOM determines the stop order for one vehicle, minimizing driving time.
- OSRM calculates the final road geometry, distance, and duration for the VROOM order.
- Coordinates use WGS84 (`EPSG:4326`) and are represented as `[longitude, latitude]` in GeoJSON and routing-engine payloads.
- The approved route plan is immutable after the route starts. Any stop change while `PENDING` requires a new optimization covering all existing and new stops.
- The first version provides a planned route only. Live GPS tracking, automatic rerouting, turn-by-turn navigation, offline maps, vehicle capacity, time windows, and multi-vehicle optimization are excluded.

## Rules

- Only confirmed sales can be assigned.
- Do not assign cancelled sales.
- Do not optimize or assign a sale already assigned to another route.
- A mapped route must have a geocoded origin and every stop must have validated coordinates.
- A search result, reverse-geocoded label, or moved marker must not overwrite the sale or customer address silently; the delivery order preserves the selected planning address separately.
- Route creation from a geographic plan must revalidate the active driver, origin, sales, receivables, and concurrent assignments before persistence.
- An optimization with unreachable or unassigned stops must not create a route.
- A routing or geocoding provider failure must not create partial route, order, inventory, payment, or settlement records.
- A route plan expires after 30 minutes and may be consumed only once. A retry with the same idempotency key returns the route already created.
- Historical routes without coordinates remain readable through the existing text-only experience.
- Drivers only see their own routes.
- Drivers only update orders assigned to them.
- Delivered orders must store `deliveredAt`.
- Delivery evidence is part of the MVP.
- Evidence may include photo, signature, geolocation, note, or a combination; the exact required combination remains a business decision.
- Driver mobile experience is part of the MVP; offline support remains pending and must not be assumed without a later spec.
- If the order has collectible balance, the driver may register a route collection only when policy allows it.
- In the MVP, every route collection recorded as `Payment` applies to exactly one receivable through required `Payment.accountReceivableId`.
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
- DRIVER: consult and update own routes, capture evidence, register incidents, and allowed collections.
- COLLECTIONS: consult route collections, related balances, and settlements; register or reconcile payments according to permissions.
- SELLER: may consult status when applicable.
- WAREHOUSE: may consult returns or related movements when inventory is affected.

## API

Exact routes must be defined in:

- `specs/.specs/03-api/delivery-api.md`
- `specs/.specs/03-api/route-settlements-api.md`

## UI

- Admin route table.
- Geospatial route planner with eligible-sale selection, address search, map pinning, optimization preview, and confirmation.
- Order assignment.
- Driver route list with the approved static map and ordered stops when geographic data exists.
- Evidence review.
- Settlement view.

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
- Re-optimize all stops when adding an order to a mapped pending route.
- Preserve text-only access to a historical route without geometry.
- Assign confirmed order.
- Reject cancelled sale assignment.
- Driver only sees own routes.
- Mark order as delivered.
- Store delivery timestamp.
- Capture allowed evidence.
- Register route collection associated to one receivable.
- Reject route collection without receivable in MVP.
- Derive collected amounts from `Payment`, not from a duplicated persisted money field.
- Register incident or return.
- Settle route and calculate expected vs collected difference.
- Prepare route load with `ROUTE_STOCK`.
- Reject delivery or return without operational route location.
