# Module Spec — Routes / Delivery

## Canonical status

This is the canonical module spec for route assignment, delivery execution, route collection, incidents, returns, and route settlement.

Deprecated aliases:

- `specs/modules/routes/spec.md`
- `specs/modules/rutas-reparto/spec.md`

## Objective

Control route assignment, delivery, evidence, route collections, incidents, returns, and operational settlement for orders assigned to drivers.

## Capabilities

- Create route.
- Assign driver.
- Associate route with origin operational location when applicable.
- Create or associate `ROUTE_STOCK` per route.
- Assign confirmed orders or sales.
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
- DeliveryOrder.
- DeliveryEvidence.
- RouteSettlement.
- Sale.
- AccountReceivable.
- Payment.
- OperationalLocation.
- InventoryMovement.
- User.

## Rules

- Only confirmed sales can be assigned.
- Do not assign cancelled sales.
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
- Route creation.
- Order assignment.
- Driver route list.
- Evidence review.
- Settlement view.

## Minimum tests

- Create route.
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
