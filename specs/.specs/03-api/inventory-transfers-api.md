# API — Traspasos de inventario

Define contratos para traspasos entre ubicaciones operativas. Un traspaso es entidad de dominio propia con origen, destino, detalle, estado y movimientos trazables. La matriz, las pollerías externas y las rutas pueden actuar como origen o destino siempre que estén modeladas como `OperationalLocation`, incluyendo `ROUTE_STOCK`.

## Convenciones

- Operaciones críticas de creación, confirmación y cancelación deben ejecutarse en transacción cuando apliquen movimientos.
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
      "quantityPieces": 0
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
- No aceptar ubicaciones inactivas.
- El destino puede representar una pollería, una ubicación `ROUTE_STOCK` o un punto operativo de salida.
- Reintentos con la misma `Idempotency-Key` y el mismo payload no deben crear un segundo traspaso.

## POST /api/inventory-transfers/:id/confirm

Propósito: confirmar traspaso y generar movimientos de salida y entrada.

Permisos: `ADMIN`, `WAREHOUSE` autorizado.

Respuesta `data`:

- Traspaso confirmado.
- Movimientos generados por producto y ubicación.

Validaciones:

- No confirmar si la ubicación origen no tiene stock suficiente.
- Confirmar debe generar movimientos `TRANSFER_OUT` en origen y `TRANSFER_IN` en destino.
- Ejecutar de forma transaccional.
- No confirmar traspasos cancelados o ya confirmados.
- `DRAFT` y `REQUESTED` no generan movimientos.
- `IN_TRANSIT` representa el traslado operativo entre origen y destino.
- La carga a ruta se confirma contra una ubicación destino `ROUTE_STOCK`.
- La devolución de sobrante desde ruta se confirma con origen `ROUTE_STOCK`.
- Reintentos con la misma `Idempotency-Key` no deben duplicar movimientos ni confirmar dos veces el mismo traspaso.

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
