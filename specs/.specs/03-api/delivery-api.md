# API — Rutas y reparto

Define contratos para rutas, pedidos de reparto, evidencia, incidencias, devoluciones y cobros en ruta. La experiencia móvil del chofer forma parte del MVP, pero no se asume operación offline hasta decisión posterior. El flujo debe distinguir quién entregó y quién cobró, incluso cuando exista segunda vuelta de cobranza.

## Representación de `routeSettlementId`

`routeSettlementId` identifica la liquidación de ruta asociada a cobros, movimientos o vistas de reparto cuando dicha liquidación ya existe. Su presencia es condicional:

- No se envía en `POST /api/delivery-routes` ni en actualización de estados, evidencia o incidencias; esos endpoints no crean ni seleccionan la liquidación.
- Es `null` u omitido en respuestas de rutas, pedidos y cobros mientras la ruta no tenga una `RouteSettlement` abierta o cerrada.
- Es requerido en la respuesta de cualquier `Payment` o movimiento relacionado con ruta cuando el registro ya fue asociado a una liquidación existente.
- En el MVP, `Payment.accountReceivableId` sigue siendo requerido para todo cobro en ruta; `routeSettlementId` no sustituye la cuenta por cobrar ni habilita pagos distribuidos.
- La creación, apertura, cálculo o cierre de la liquidación se define en `route-settlements-api.md`; este archivo solo expone la referencia cuando aplica dentro de contratos de reparto.

## GET /api/delivery-routes

Propósito: listar rutas.

Permisos: `ADMIN`; `DRIVER` solo rutas propias; `COLLECTIONS` consulta de rutas con cobros; `WAREHOUSE` consulta si afecta devoluciones.

Query:

- `page`, `limit`.
- `driverId`, `status`, `scheduledDate`.
- `originLocationId`.

Respuesta `data.items[]`:

- `id`, `name`, `driverId`, `driverName`, `status`, `scheduledDate`, `originLocationId`, `routeStockLocationId`.
- `startedAt`, `completedAt`, `ordersCount`, `pendingOrdersCount`, `routeSettlementId`, `createdAt`.
- `routeSettlementId` es condicional: `null` u omitido si la ruta aún no tiene liquidación; presente si ya existe `RouteSettlement` para la ruta.

## GET /api/delivery-routes/:id

Propósito: obtener ruta con pedidos asignados, evidencia y cobros resumidos.

Permisos: `ADMIN`; `DRIVER` solo ruta propia; `COLLECTIONS` para cobros y saldos.

Respuesta `data`:

- Encabezado de ruta.
- `orders[]`: `id`, `saleId`, `saleNumber`, `accountReceivableId`, `status`, `deliveryAddress`, `deliveredAt`, `deliveredByUserId`, `collectedByUserId`, `collectionPass`, `notes`.
- `evidenceSummary[]`: tipos capturados por pedido.
- `collectionsSummary`: montos esperados y cobrados por método, primera vuelta y segunda vuelta.
- `routeSettlementId` si existe liquidación asociada a la ruta; `null` u omitido si la liquidación todavía no ha sido abierta o calculada.

Notas:

- Cualquier monto cobrado visible por pedido debe derivarse de `Payment`, no de un campo persistido en `DeliveryOrder`.

## POST /api/delivery-routes

Propósito: crear ruta y asignar ventas confirmadas.

Permisos: `ADMIN`.

Body importante:

```json
{
  "name": "Ruta Centro",
  "driverId": "string",
  "scheduledDate": "2026-06-19",
  "originLocationId": "string opcional",
  "routeStockLocationId": "string opcional o autogenerado",
  "orders": [
    {
      "saleId": "string",
      "accountReceivableId": "string opcional",
      "deliveryAddress": "Dirección de entrega"
    }
  ]
}
```

Respuesta `data`: ruta creada con pedidos.

Validaciones:

- `driverId` y `scheduledDate` requeridos.
- La ruta debe crear o asociar una `OperationalLocation` de tipo `ROUTE_STOCK`.
- Solo ventas confirmadas pueden asignarse.
- No asignar ventas canceladas.
- Si la venta tiene saldo a crédito, el pedido debe poder relacionarse con `accountReceivableId`.
- `originLocationId` debe conservarse cuando la ruta salga de una ubicación operativa definida.
- `orders[]` puede contener ventas pagadas al entregar, ventas a crédito y ventas con cobranza posterior.
- Las ventas de canal `ROUTE` deben usar `routeStockLocationId` como ubicación operativa de descuento.


## POST /api/delivery-routes/:id/orders

Propósito: asignar ventas confirmadas adicionales a una ruta existente antes de que tenga liquidación asociada.

Permisos: `ADMIN`.

Body importante:

```json
{
  "orders": [
    {
      "saleId": "string",
      "accountReceivableId": "string opcional",
      "deliveryAddress": "Dirección de entrega"
    }
  ]
}
```

Respuesta `data`: ruta actualizada con pedidos.

Validaciones:

- La ruta debe existir.
- La ruta no debe estar `COMPLETED` ni `CANCELLED`.
- La ruta no debe tener `RouteSettlement` abierta o cerrada.
- Solo ventas confirmadas pueden asignarse.
- No asignar ventas canceladas.
- No asignar ventas duplicadas dentro de la misma ruta.
- No asignar ventas que ya pertenezcan a otra ruta.
- Si la venta tiene saldo a crédito, el pedido debe conservar `accountReceivableId`.
- `routeSettlementId` no se acepta en el body; la liquidación se abre/calcula mediante `route-settlements-api.md`.

## PATCH /api/delivery-routes/:id/status

Propósito: actualizar estado de ruta.

Permisos: `ADMIN`; `DRIVER` limitado a ruta propia según transición permitida.

Body importante:

```json
{
  "status": "IN_PROGRESS",
  "notes": "Inicio de ruta"
}
```

Validaciones:

- No completar ruta si existen pedidos pendientes sin estado final.
- Estados esperados: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.

## PATCH /api/delivery-orders/:id/status

Propósito: actualizar estado de pedido dentro de una ruta.

Permisos: `ADMIN`; `DRIVER` limitado a pedido asignado.

Body importante:

```json
{
  "status": "DELIVERED",
  "notes": "Entregado a cliente",
  "deliveredAt": "2026-06-19T12:00:00.000Z"
}
```

Respuesta `data`: pedido actualizado.

Validaciones:

- Repartidor solo actualiza pedidos asignados a su usuario.
- Si `status=DELIVERED`, registrar `deliveredAt`.
- Soportar `PENDING`, `IN_ROUTE`, `DELIVERED`, `NOT_DELIVERED`, `CANCELLED`, `PARTIALLY_REJECTED`, `RETURNED`.
- Rechazo parcial, devolución o incidencia debe conservar nota o motivo.
- El pedido debe conservar `deliveredByUserId` y `collectedByUserId` cuando existan.
- No permitir confirmar una venta o devolución de ruta sin `routeStockLocationId` asociado a la ruta.

## POST /api/delivery-orders/:id/evidence

Propósito: capturar evidencia de entrega o incidencia.

Permisos: `ADMIN`; `DRIVER` limitado a pedido asignado.

Body importante:

```json
{
  "type": "PHOTO",
  "value": "referencia-o-url-interna",
  "capturedAt": "2026-06-19T12:05:00.000Z"
}
```

Respuesta `data`: evidencia registrada.

Validaciones:

- `type` requerido: `PHOTO`, `SIGNATURE`, `GEOLOCATION`, `NOTE`.
- `capturedAt` requerido.
- La combinación obligatoria de evidencia queda pendiente de negocio; no inventar obligatoriedad final.

## POST /api/delivery-orders/:id/collections

Propósito: registrar cobro recibido en ruta para una cuenta por cobrar.

Permisos: `DRIVER` limitado a pedido asignado; `ADMIN`; `COLLECTIONS` conforme a política.

Body importante:

```json
{
  "accountReceivableId": "string",
  "amount": 1200,
  "paymentMethod": "CASH",
  "reference": "Cobro en ruta",
  "paidAt": "2026-06-19T12:10:00.000Z"
}
```

Respuesta `data`:

- `payment`: `id`, `accountReceivableId`, `customerId`, `routeId`, `routeSettlementId`, `amount`, `paymentMethod`, `status`, `paidAt`.
- `deliveryOrder`: `id`, `status`, `derivedCollectedAmount`.
- `routeSettlementId` en `payment` es condicional: `null` u omitido si el cobro se registra antes de abrir la liquidación; presente si ya existe una liquidación de ruta y el pago queda asociado a ella.

Validaciones:

- `accountReceivableId` requerido.
- Solo registrar cobro si el pedido tiene saldo por cobrar y la política lo permite.
- El pago no puede exceder el saldo pendiente.
- Asociar pago a la ruta siempre y a `routeSettlementId` cuando ya exista liquidación para esa ruta.
- No aceptar `routeSettlementId` como sustituto de `accountReceivableId`; cada pago del MVP debe conservar `accountReceivableId` requerido.
- La API debe permitir marcar si el cobro corresponde a primera o segunda vuelta de cobranza.
- Contraentrega o cobro al entregar no se considera dinero recibido hasta persistir `Payment`.

## POST /api/delivery-orders/:id/incidents

Propósito: registrar no entrega, devolución, rechazo parcial o incidencia.

Permisos: `DRIVER` limitado a pedido asignado; `ADMIN`.

Body importante:

```json
{
  "status": "PARTIALLY_REJECTED",
  "reason": "Cliente rechazó parte del pedido",
  "returnedItems": [
    {
      "productId": "string",
      "unit": "KG",
      "quantityKg": 2.5,
      "quantityPieces": 0,
      "reason": "Rechazo parcial"
    }
  ]
}
```

Validaciones:

- `reason` requerido.
- Si afecta inventario, debe generar trazabilidad y movimiento con ubicación `ROUTE_STOCK` y motivo cuando corresponda.
- La tolerancia exacta de devolución o diferencia queda pendiente de negocio.
