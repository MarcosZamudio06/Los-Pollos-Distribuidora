# API — Inventario, productos y movimientos

Define contratos para productos, categorías, saldos por ubicación y movimientos de inventario. El inventario operativo del MVP se consulta por `OperationalLocation`; no existe stock global de producto como fuente de verdad. `presentationType` clasifica el catálogo semántico del producto y `unit` conserva la captura operativa.

## GET /api/products

Propósito: listar productos para administración, almacén y POS.

Permisos: `ADMIN`, `WAREHOUSE`, `SELLER` en modo lectura.

Query:

- `page`, `limit`, `search`.
- `categoryId`.
- `presentationType`: `KG`, `WHOLE`, `CUT`.
- `unit`: `KG`, `PIECE`, `KG_AND_PIECE`.
- `isActive`.
- `locationId` para incluir disponibilidad de una ubicación operativa.
- `lowStock` para filtrar bajo inventario por ubicación cuando se envíe `locationId`.
- `requireInventoryBalance=true` para flujos de transferencia; requiere
  `locationId` y devuelve solo productos activos con un `InventoryBalance`
  registrado en esa ubicación operativa activa.

Respuesta `data.items[]`:

- `id`, `name`, `sku`, `barcode`, `description`, `categoryId`.
- `presentationType`.
- `salePrice`, `purchaseCost`, `minStock`.
- `unit`, `pieceWeightEquivalent`, `equivalentPolicyStatus`.
- `isActive`.
- `inventoryBalance` opcional: `locationId`, `quantityKg`, `quantityPieces`, `minQuantityKg`, `minQuantityPieces`, `isLowStock`.

La respuesta para `SELLER` omite `purchaseCost`; puede consultar el precio de venta y la disponibilidad operativa necesaria para el POS, pero no el costo de compra.

Validaciones:

- No devolver un campo `stock` global como disponibilidad operativa.
- Si `lowStock=true`, `locationId` es requerido.
- Cuando se envía `search`, buscar primero coincidencia exacta por `barcode`, después coincidencia exacta por `sku` y finalmente coincidencia parcial por `name`.

## GET /api/products/:id

Propósito: obtener detalle de producto, categoría, unidad, equivalencias visibles y saldos por ubicación.

Permisos: `ADMIN`, `WAREHOUSE`, `SELLER` en modo lectura.

Query:

- `includeBalances=true` para incluir saldos por ubicación.
- `locationId` opcional para limitar el saldo a una ubicación.

Respuesta `data`:

- Campos del producto.
- `balances[]`: `locationId`, `locationName`, `quantityKg`, `quantityPieces`, `minQuantityKg`, `minQuantityPieces`, `isLowStock`.
- `activeEquivalences[]`: `id`, `unitFrom`, `unitTo`, `factor`, `roundingMode`, `effectiveFrom`.

Para `SELLER`, `purchaseCost` también debe omitirse en el detalle del producto.

## POST /api/products

Propósito: crear producto sin crear stock operativo global.

Permisos: `ADMIN`, `WAREHOUSE` conforme a política.

Body importante:

```json
{
  "name": "Pechuga de pollo",
  "sku": "PECH-001",
  "description": "Pechuga por kilogramo",
  "categoryId": "string opcional",
  "presentationType": "CUT",
  "salePrice": 120,
  "purchaseCost": 90,
  "minStock": 10,
  "unit": "KG",
  "pieceWeightEquivalent": 1.8,
  "equivalentPolicyStatus": "DRAFT"
}
```

Respuesta `data`:

- Producto creado con `id`, datos comerciales, unidad y estado activo.

Validaciones:

- `name` requerido.
- `salePrice > 0`.
- `purchaseCost >= 0`.
- `minStock >= 0`.
- `presentationType` requerido y limitado a `KG`, `WHOLE`, `CUT`.
- `unit` requerido y limitado a `KG`, `PIECE`, `KG_AND_PIECE`.
- `sku` único si existe.
- No aceptar `stock` como campo de creación.
- Si el producto se venderá por kilo y pieza, la equivalencia debe gestionarse mediante la API de equivalencias o quedar marcada como pendiente hasta aprobación.

## PATCH /api/products/:id

Propósito: actualizar datos comerciales del producto.

Permisos: `ADMIN`, `WAREHOUSE` conforme a política.

Body importante: mismos campos editables de creación, excepto inventario operativo.

Validaciones:

- No modificar saldos de inventario desde este endpoint.
- No cambiar `presentationType` de forma que contradiga el historial comercial o el catálogo visible; si el cambio implica un producto distinto, debe crearse uno nuevo.
- No cambiar unidad de forma que invalide ventas, compras o movimientos históricos.
- No convertir kilo/pieza sin equivalencia oficial aprobada cuando aplique.

## DELETE /api/products/:id

Propósito: desactivar producto.

Permisos: `ADMIN`.

Respuesta `data`: producto con `isActive=false`.

Validaciones:

- No eliminar físicamente.
- Un producto inactivo no debe poder usarse en nuevas ventas, compras o traspasos.

## GET /api/categories

Propósito: listar categorías de producto.

Permisos: `ADMIN`, `WAREHOUSE`, `SELLER` en modo lectura.

Query: `page`, `limit`, `search`, `isActive`.

Respuesta `data.items[]`: `id`, `name`, `description`, `isActive`.

## POST /api/categories

Propósito: crear categoría.

Permisos: `ADMIN`, `WAREHOUSE` conforme a política.

Body: `name`, `description` opcional.

Validaciones: `name` requerido y único.

## PATCH /api/categories/:id

Propósito: actualizar categoría.

Permisos: `ADMIN`, `WAREHOUSE` conforme a política.

Validaciones: no duplicar nombre.

## DELETE /api/categories/:id

Propósito: desactivar categoría.

Permisos: `ADMIN`.

Validaciones: no eliminar físicamente.

## GET /api/inventory/balances

Propósito: consultar existencia física, mercancía reservada y stock disponible por producto y ubicación operativa.

Permisos: `ADMIN`, `WAREHOUSE`, `SELLER` en modo lectura para POS.

Query:

- `page`, `limit`, `search`.
- `productId`.
- `locationId` requerido para consulta operativa por ubicación.
- `lowStock`.

Respuesta `data.items[]`:

- `productId`, `productName`, `sku`, `unit`.
- `locationId`, `locationName`.
- `quantityKg`, `quantityPieces`.
- `reservedQuantityKg`, `reservedQuantityPieces`.
- `availableQuantityKg`, `availableQuantityPieces`.
- `minQuantityKg`, `minQuantityPieces`.
- `isLowStock`.

Validaciones:

- No consolidar como stock global único.
- `quantityKg` y `quantityPieces` no deben ser negativos.
- `reservedQuantityKg` y `reservedQuantityPieces` no deben ser negativos.
- La disponibilidad se calcula como existencia física menos reserva por dimensión.
- `availableQuantityKg` y `availableQuantityPieces` no deben ser negativos.
- La reserva no representa una ubicación física adicional.
- `isLowStock` debe comparar la disponibilidad contra `minQuantityKg` y `minQuantityPieces`, no la existencia física comprometida.

## GET /api/cedis/inventory-summary

Propósito: consultar la conciliación diaria del inventario físico de un CEDIS.

Permisos: `ADMIN`, `WAREHOUSE` autorizado para el CEDIS y `cedis.view` conforme al alcance.

Query:

- `cedisLocationId` requerido.
- `businessDate` requerido en formato `YYYY-MM-DD`.

La respuesta debe incluir por producto y total:

- saldo inicial del día;
- recibido de proveedores externos en el CEDIS;
- enviado a sucursales mediante suministros confirmados;
- devuelto por sucursales mediante devoluciones confirmadas;
- otros movimientos netos trazables;
- restante físico total al momento o cierre consultado.

El restante representa el saldo físico total del CEDIS, incluyendo existencias de días anteriores. KG y PIECE se conservan como dimensiones separadas.

## POST /api/inventory/adjustments

Propósito: registrar ajuste manual, merma, diferencia de peso, devolución o pérdida operativa.

Permisos: `ADMIN`, `WAREHOUSE` autorizado.

Body importante:

```json
{
  "productId": "string",
  "locationId": "string",
  "type": "ADJUSTMENT",
  "quantityKg": 5.5,
  "quantityPieces": 0,
  "unit": "KG",
  "reason": "Ajuste por conteo físico",
  "referenceType": "MANUAL"
}
```

Respuesta `data`:

- Movimiento creado: `id`, `productId`, `locationId`, `type`, cantidades, saldos anteriores/nuevos, `reason`, `createdAt`.

Validaciones:

- `productId`, `locationId`, `type`, `unit` y `reason` requeridos.
- Registrar cantidades por kilo y/o pieza según unidad del producto.
- `quantityPieces` debe ser entero cuando aplique.
- No permitir saldo negativo por ubicación.
- No permitir que un ajuste negativo consuma `reservedQuantityKg` o `reservedQuantityPieces`.
- Usar equivalencia aprobada si el ajuste requiere convertir kilo/pieza.
- Si el ajuste corresponde a diferencia de ruta, debe conservar referencia a `routeId` o `routeSettlementId` mediante `referenceType/referenceId`.

## GET /api/inventory/movements

Propósito: listar movimientos trazables de inventario.

Permisos: `ADMIN`, `WAREHOUSE`; `SELLER` solo si una vista operativa autorizada lo requiere.

Query:

- `page`, `limit`.
- `productId`, `locationId`, `type`.
- `referenceType`, `referenceId`.
- `dateFrom`, `dateTo`.

Respuesta `data.items[]`:

- `id`, `productId`, `productName`, `locationId`, `locationName`.
- `type`, `quantityKg`, `quantityPieces`, `unit`.
- `previousQuantityKg`, `newQuantityKg`, `previousQuantityPieces`, `newQuantityPieces`.
- `reason`, `referenceType`, `referenceId`, `transferId`, `saleId`, `purchaseId`, `routeSettlementId`.
- `userId`, `createdAt`.

Validaciones:

- Todo movimiento debe conservar ubicación operativa.
- Ajustes, mermas, devoluciones y rechazos parciales requieren motivo obligatorio.

## Extensión: conciliación de punto de venta

- `GET /api/inventory/balances` y `GET /api/inventory/movements` deben aceptar ubicaciones de tipo `EXTERNAL_POINT_OF_SALE` y `ROUTE_STOCK` sin consolidarlas como stock global.
- `GET /api/inventory/movements` agrega filtro opcional `pointOfSaleDailyCloseId` y devuelve esa referencia cuando exista.
- Los traspasos desde matriz al punto externo continúan usando el contrato de traspasos; el cierre diario solo los consulta y concilia.
- Una línea de cierre o referencia de báscula no modifica inventario.
- Si una diferencia física requiere corrección, `POST /api/inventory/adjustments` debe usarse con rol autorizado, motivo obligatorio y `referenceType=POINT_OF_SALE_DAILY_CLOSE` más `referenceId` del cierre.
- El ajuste debe conservar `locationId`, producto, kilos/piezas, saldos anterior/nuevo y ejecutarse transaccionalmente.
- La tolerancia aceptable de diferencia permanece como decisión abierta; la API no debe compensar diferencias automáticamente.
