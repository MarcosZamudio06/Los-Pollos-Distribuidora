# API — Traspasos de inventario

Define contratos para traspasos entre ubicaciones operativas. Un traspaso es entidad de dominio propia con origen, destino, detalle, estado y movimientos trazables. La matriz, las pollerías externas y las rutas pueden actuar como origen o destino siempre que estén modeladas como `OperationalLocation`, incluyendo `ROUTE_STOCK`.

## Convenciones

- Operaciones críticas de creación, confirmación y cancelación deben ejecutarse en transacción cuando apliquen movimientos.
- Una transferencia pendiente reserva cantidades en el origen; la reserva no crea un movimiento físico.
- Headers recomendados en comandos críticos:
  - `Idempotency-Key`

## GET /api/inventory-transfers

Propósito: listar traspasos.

Permisos: `ADMIN`, `WAREHOUSE`.

Query:

- `page`, `limit`.
- `originLocationId`, `destinationLocationId`.
- `status`: `DRAFT`, `REQUESTED`, `IN_TRANSIT`, `CONFIRMED`, `CANCELLED`.
- `dateFrom`, `dateTo`.

Respuesta `data.items[]`:

- `id`, `transferNumber`, `originLocationId`, `destinationLocationId`.
- `status`, `userId`, `requestedAt`, `confirmedAt`, `cancelledAt`.
- `itemsCount`, `createdAt`, `updatedAt`.

## GET /api/inventory-transfers/:id

Propósito: obtener detalle de traspaso.

Permisos: `ADMIN`, `WAREHOUSE`.

Respuesta `data`:

- Encabezado del traspaso.
- `items[]`: `productId`, `productName`, `unit`, `quantityKg`, `quantityPieces`.
- `movements[]` si ya fue confirmado: movimientos `TRANSFER_OUT` y `TRANSFER_IN`.

## POST /api/inventory-transfers

Propósito: crear o solicitar traspaso entre ubicaciones.

Permisos: `ADMIN`, `WAREHOUSE` autorizado.

Body importante:

```json
{
  "originLocationId": "string",
  "destinationLocationId": "string",
  "notes": "Traspaso a sucursal centro",
  "items": [
    {
      "productId": "string",
      "unit": "KG",
      "quantityKg": 25.5,
      "quantityPieces": 0,
      "unitEquivalentId": null
    }
  ]
}
```

Respuesta `data`: traspaso creado en estado inicial definido por el flujo operativo.

Validaciones:

- `originLocationId` y `destinationLocationId` requeridos.
- Origen y destino no pueden ser iguales.
- Debe tener al menos un item.
- Cada item requiere `productId`, `unit` y cantidad mayor a cero según unidad.
- `quantityPieces` debe ser entero cuando aplique.
- `unitEquivalentId` es opcional; si se envía, el backend valida la equivalencia activa y conserva el factor/modo de redondeo aplicado.
- No aceptar ubicaciones inactivas.
- El destino puede representar una pollería, una ubicación `ROUTE_STOCK` o un punto operativo de salida.
- Si el destino es una `BRANCH`, el origen debe ser su CEDIS padre activo y el traspaso debe crearse desde un ciclo CEDIS-sucursal; no se permiten transferencias genéricas hacia sucursales.
- Reintentos con la misma `Idempotency-Key` y el mismo payload no deben crear un segundo traspaso.
- Cuando el traspaso se crea desde un ciclo CEDIS, origen y destino se derivan del ciclo, se vincula en la misma transacción y el estado inicial es `REQUESTED`.
- Una transferencia `REQUESTED` reserva cada dimensión en el origen dentro de la misma transacción.
- Si la disponibilidad no alcanza, responde `409 Conflict` con `code=INSUFFICIENT_STOCK` y `findings[]`; no persiste transferencia, vínculo ni reserva parcial.

## POST /api/inventory-transfers/:id/confirm

Propósito: confirmar traspaso y generar movimientos de salida y entrada.

Permisos: `ADMIN`, `WAREHOUSE` autorizado.

Respuesta `data`:

- Traspaso confirmado.
- Movimientos generados por producto y ubicación.

Validaciones:

- No confirmar si la ubicación origen no tiene stock suficiente.
- No confirmar si la ubicación origen no tiene disponibilidad suficiente después de reservas existentes.
- Confirmar debe generar movimientos `TRANSFER_OUT` en origen y `TRANSFER_IN` en destino.
- Confirmar debe consumir exactamente la reserva correspondiente antes o junto con la salida física.
- Ejecutar de forma transaccional.
- No confirmar traspasos cancelados o ya confirmados.
- `DRAFT` y `REQUESTED` no generan movimientos.
- `IN_TRANSIT` representa el traslado operativo entre origen y destino.
- La carga a ruta se confirma contra una ubicación destino `ROUTE_STOCK`.
- La devolución de sobrante desde ruta se confirma con origen `ROUTE_STOCK`.
- Reintentos con la misma `Idempotency-Key` no deben duplicar movimientos ni confirmar dos veces el mismo traspaso.
- Si está vinculado a un ciclo CEDIS, el ciclo debe estar mutable, la dirección debe coincidir y ubicaciones y productos deben seguir activos.
- Los suministros vinculados con rol `SUPPLY` no se confirman por este endpoint; deben recibirse mediante `POST /api/cedis/incoming-supplies/:transferId/receive`. Este endpoint confirma devoluciones `RETURN` y los demás traspasos permitidos.
- Una transferencia hacia una sucursal que no esté vinculada a un ciclo CEDIS debe rechazarse.
- Confirmar una transferencia vinculada devuelve el ciclo a `OPEN`, incrementa su versión e invalida una validación vigente del cierre `DRAFT`.

## POST /api/inventory-transfers/:id/cancel

Propósito: cancelar traspaso no confirmado.

Permisos: `ADMIN`, `WAREHOUSE` autorizado.

Body importante:

```json
{
  "reason": "Cancelado por ajuste operativo"
}
```

Validaciones:

- No cancelar un traspaso ya confirmado si los movimientos quedaron aplicados; debe definirse flujo posterior si negocio requiere reversa.
- Registrar actor, fecha y motivo de cancelación.
- Reintentos con la misma `Idempotency-Key` no deben duplicar cancelaciones ni alterar una cancelación ya aplicada.
- `DRAFT`, `REQUESTED` e `IN_TRANSIT` pueden cancelarse con motivo; `CONFIRMED` nunca se cancela.
- Cancelar una transferencia pendiente debe liberar exactamente la reserva del origen sin crear movimientos físicos.
- Cancelar una transferencia vinculada devuelve el ciclo a `OPEN`, incrementa su versión e invalida una validación vigente del cierre `DRAFT`.

## Errores operativos

Los errores de disponibilidad, reserva e idempotencia deben conservar `409 Conflict` y el sobre definido en `api-conventions.md`:

- `INSUFFICIENT_STOCK`: la operación solicita más existencia disponible que la existente. Incluye `findings[]` por producto y dimensión, con cantidades física, reservada, disponible y faltante.
- `INVENTORY_RESERVATION_INTEGRITY_ERROR`: la reserva persistida no coincide con la transferencia pendiente. No reconstruye la reserva ni crea movimientos parciales.
- `INVENTORY_CONCURRENCY_CONFLICT`: la disponibilidad cambió durante la operación o se agotaron los reintentos serializables.
- `IDEMPOTENCY_CONFLICT`: la misma clave fue reutilizada con un payload distinto.
- `LOCATION_NOT_AUTHORIZED`: el actor está fuera del alcance operativo y responde `403 Forbidden`.
- `BRANCH_SUPPLY_CYCLE_DIRECTION_INVALID`: el origen, destino y rol del ciclo no forman una dirección CEDIS ↔ sucursal válida.
- `PRODUCT_INACTIVE`: una partida referencia un producto inactivo y responde `400 Bad Request`.
- `UNIT_MISMATCH`: las cantidades no corresponden con la unidad del producto y responde `400 Bad Request`.
