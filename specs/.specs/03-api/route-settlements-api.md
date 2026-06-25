# API — Liquidación de ruta

Define contratos para comparar pedidos entregados, incidencias, devoluciones y dinero cobrado por ruta.

La liquidación no sustituye la carga/devolución física. Cualquier diferencia de producto debe resolverse con movimientos trazables sobre `ROUTE_STOCK` o con `InventoryTransfer` de devolución autorizado.

## Convenciones

- Operaciones críticas de apertura/cálculo, cierre y reapertura deben soportar control de versión e idempotencia.
- Headers recomendados en comandos críticos:
  - `Idempotency-Key`

## GET /api/route-settlements

Propósito: listar liquidaciones de ruta.

Permisos: `ADMIN`, `COLLECTIONS`; `DRIVER` solo liquidaciones propias si se autoriza.

Query:

- `page`, `limit`.
- `routeId`, `driverId`, `status`.
- `dateFrom`, `dateTo`.

Respuesta `data.items[]`:

- `id`, `routeId`, `driverId`, `status`.
- `expectedCashAmount`, `derivedCollectedCashAmount`, `expectedTransferAmount`, `derivedCollectedTransferAmount`, `differenceAmount`.
- `paidAtDeliveryAmount`, `creditAmount`, `overdueAmount`, `secondPassCollectionsAmount`.
- `closedAt`, `createdAt`, `updatedAt`.

## GET /api/route-settlements/:id

Propósito: obtener detalle de liquidación.

Permisos: `ADMIN`, `COLLECTIONS`; `DRIVER` limitado si se autoriza.

Respuesta `data`:

- Encabezado de liquidación.
- `route`: datos principales.
- `orders[]`: estado de cada pedido, monto esperado, monto cobrado, incidencias, entregado por y cobrado por.
- `payments[]`: pagos asociados con `accountReceivableId`, método, monto, estado, ruta y vuelta de cobranza.
- `inventoryMovements[]` por devoluciones o rechazos que afecten stock.
- `routeStockLocationId` asociado a la ruta.

## POST /api/delivery-routes/:routeId/settlement

Propósito: abrir o calcular liquidación de una ruta.

Permisos: `ADMIN`, `COLLECTIONS` conforme a política.

Respuesta `data`:

- Liquidación en estado `OPEN` o `REVIEW_REQUIRED` según diferencias detectadas.
- Totales esperados y cobrados por método de pago.

Validaciones:

- La ruta debe existir.
- Debe comparar pedidos entregados, no entregados, devoluciones, incidencias y cobros recibidos.
- Los cobros en ruta deben estar asociados a pagos con `accountReceivableId`.
- Debe incluir pagos recibidos al entregar, transferencias/depositos confirmados y cobranza posterior.
- Debe detectar diferencias entre producto cargado, vendido, devuelto y remanente en `ROUTE_STOCK`.
- Todo total cobrado debe derivarse de `Payment` asociados a `routeId` o `routeSettlementId`.
- Reintentos con la misma `Idempotency-Key` no deben abrir ni recalcular una segunda liquidación para la misma operación.

## POST /api/route-settlements/:id/close

Propósito: cerrar liquidación de ruta.

Permisos: `ADMIN`, `COLLECTIONS` autorizado.

Body importante:

```json
{
  "notes": "Liquidación revisada y aceptada",
  "expectedVersion": 3
}
```

Respuesta `data`: liquidación cerrada.

Validaciones:

- No cerrar si existen pedidos sin estado final.
- Si hay diferencias, cerrar como `REVIEW_REQUIRED` o requerir autorización según política.
- Registrar `closedAt`.
- La liquidación debe dejar trazabilidad de primera y segunda vuelta de cobranza.
- Toda diferencia física pendiente debe quedar resuelta con movimientos trazables antes del cierre final o marcarse explícitamente en revisión.
- Si existen pagos que requieren reversa antes del cierre o reapertura, deben resolverse auditablemente.
- Reintentos con la misma `Idempotency-Key` no deben producir un doble cierre ni saltarse el control de `expectedVersion`.

## POST /api/route-settlements/:id/reopen

Propósito: reabrir liquidación para revisión operativa.

Permisos: `ADMIN`.

Body importante:

```json
{
  "reason": "Reapertura para revisar diferencias",
  "expectedVersion": 4
}
```

Validaciones:

- No eliminar pagos, evidencias ni movimientos históricos.
- Persistir actor, fecha, motivo, versión e idempotencia de reapertura.
- Rechazar reapertura con `expectedVersion` obsoleta.
