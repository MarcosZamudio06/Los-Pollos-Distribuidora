# API — Compras y proveedores

Define contratos para proveedores y compras que incrementan inventario en una ubicación operativa receptora.

## GET /api/suppliers

Propósito: listar proveedores.

Permisos: `ADMIN`, `WAREHOUSE`.

Query: `page`, `limit`, `search`, `isActive`.

Respuesta `data.items[]`: `id`, `name`, `phone`, `email`, `address`, `isActive`.

## GET /api/suppliers/:id

Propósito: obtener proveedor.

Permisos: `ADMIN`, `WAREHOUSE`.

## POST /api/suppliers

Propósito: crear proveedor.

Permisos: `ADMIN`, `WAREHOUSE` conforme a política.

Body importante: `name`, `phone`, `email`, `address`.

Validaciones:

- `name`, `phone`, `email` y `address` requeridos y no vacíos.
- `email` debe ser un correo válido.
- Los campos se normalizan (trim y lower para `email`).

## PATCH /api/suppliers/:id

Propósito: actualizar proveedor.

Permisos: `ADMIN`, `WAREHOUSE` conforme a política.

Body: parcial (`name`, `phone`, `email`, `address`).

Validaciones:

- El body puede ser parcial.
- Tras fusionar el body con el proveedor existente, el proveedor efectivo debe mantener `name`, `phone`, `email` válido y `address` no vacíos.
- Si la fusión deja un campo requerido en blanco, se rechaza con 400.
- `email` proporcionado debe ser un correo válido.
- No se permite mutar proveedores inactivos.

## DELETE /api/suppliers/:id

Propósito: desactivar proveedor.

Permisos: `ADMIN`.

Validaciones: no eliminar físicamente.

## GET /api/purchases

Propósito: listar compras.

Permisos: `ADMIN`, `WAREHOUSE`.

Query:

- `page`, `limit`.
- `supplierId`, `locationId`, `status`.
- `dateFrom`, `dateTo`.

Respuesta `data.items[]`:

- `id`, `purchaseNumber`, `supplierId`, `supplierName`, `userId`, `locationId`.
- `subtotal`, `total`, `status`, `createdAt`, `updatedAt`.

## GET /api/purchases/:id

Propósito: obtener detalle de compra.

Permisos: `ADMIN`, `WAREHOUSE`.

Respuesta `data`:

- Encabezado de compra.
- `items[]`: `productId`, `productName`, `unit`, `quantityKg`, `quantityPieces`, `unitCost`, `unitEquivalentId`, `appliedEquivalentFactor`, `subtotal`.
- `inventoryMovements[]` relacionados.

## POST /api/purchases

Propósito: registrar compra y confirmar entrada de inventario.

Permisos: `ADMIN`, `WAREHOUSE`.

Body importante:

```json
{
  "supplierId": "string",
  "locationId": "string",
  "allowCostUpdate": false,
  "items": [
    {
      "productId": "string",
      "unit": "KG",
      "quantityKg": 10.5,
      "quantityPieces": 0,
      "unitCost": 80,
      "unitEquivalentId": "string opcional"
    }
  ]
}
```

Respuesta `data`:

- Compra confirmada.
- Movimientos de inventario en ubicación receptora.
- Saldos actualizados por producto y ubicación.

Validaciones:

- `supplierId` requerido.
- `locationId` requerido como ubicación operativa receptora.
- Debe tener al menos un producto.
- Cada item requiere cantidad mayor a cero y costo mayor o igual a cero.
- Registrar cantidades por kilo y/o pieza según producto.
- `quantityPieces` debe ser entero cuando aplique.
- Conservar equivalencia aplicada cuando corresponda.
- Confirmar compra incrementa inventario en la ubicación indicada y registra movimientos.
- Actualizar costo de producto solo con permiso o política administrativa.
- Ejecutar en transacción.

## POST /api/purchases/:id/cancel

Propósito: cancelar compra y revertir inventario si es posible.

Permisos: `ADMIN`.

Body importante:

```json
{
  "reason": "Error en captura de compra"
}
```

Respuesta `data`: compra cancelada y movimientos de reversa.

Validaciones:

- No cancelar una compra ya cancelada.
- Revertir inventario en la ubicación receptora original.
- No permitir inventario negativo por ubicación al revertir.
- Registrar movimiento de cancelación.
- Requerir motivo y ejecutar en transacción.
