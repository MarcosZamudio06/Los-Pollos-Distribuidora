# UI — Compras

## Objetivo

Registrar compras y entradas de mercancía incrementando inventario en una ubicación operativa receptora, con cantidades por kilo, pieza o ambas unidades y trazabilidad de equivalencias.

## Alcance TASK-062

Pantallas y componentes requeridos:

- `PurchasesPage`.
- `PurchaseFormPage`.
- `SupplierSelector`.
- `PurchaseLocationSelector`.
- `PurchaseItemsTable`.
- `PurchaseDetailPage`.
- `CancelPurchaseDialog`.

## Pantalla principal

Debe consumir `GET /api/purchases`.

Columnas:

- Número.
- Proveedor.
- Ubicación receptora.
- Fecha.
- Total.
- Estado.
- Usuario.
- Acciones.

Filtros:

- Proveedor.
- Ubicación operativa.
- Estado.
- Rango de fechas.

## Nueva compra

Debe consumir `POST /api/purchases`.

Campos:

- Proveedor.
- Ubicación operativa receptora (`locationId`).
- Permitir actualización de costo solo si el rol o política lo autorizan.
- Productos.
- Presentación semántica por producto.
- Unidad operativa por producto.
- Cantidad en kilos cuando aplique.
- Cantidad en piezas cuando aplique.
- Equivalencia kilo-pieza aplicada cuando corresponda.
- Costo unitario.
- Total de vista previa.

El backend es fuente de verdad para confirmación, movimientos y saldos actualizados.

## Tabla de productos de compra

Columnas:

- Producto.
- Presentación.
- Unidad operativa.
- Kilos.
- Piezas.
- Equivalencia aplicada.
- Costo unitario.
- Subtotal.
- Acción quitar.

## Detalle de compra

Debe consumir `GET /api/purchases/:id`.

Debe mostrar:

- Encabezado de compra.
- Proveedor.
- Ubicación receptora.
- Estado.
- Items con unidad operativa, kilos, piezas, costo, equivalencia y subtotal.
- Movimientos de inventario relacionados.

## Cancelación

Debe consumir `POST /api/purchases/:id/cancel`.

Requiere:

- Motivo obligatorio.
- Confirmación explícita.

Debe mostrar errores del backend cuando la reversa produciría inventario negativo por ubicación.

## Permisos

- `ADMIN`: acceso completo.
- `WAREHOUSE`: crear, confirmar, cancelar y consultar conforme a permisos.
- `SELLER`, `DRIVER`, `COLLECTIONS`: sin acceso operativo.

## Estados de pantalla

Toda vista debe contemplar:

- Loading.
- Error.
- Empty.
- Success.
- Unauthorized.

## Validaciones

- Proveedor requerido.
- Ubicación receptora requerida.
- Al menos un producto.
- Cantidad mayor a cero.
- Costo mayor o igual a cero.
- Kilos permiten decimales.
- Piezas deben ser enteras.
- No confirmar productos sin unidad válida.
- Mostrar errores del backend por permisos, ubicación inactiva o conflicto de inventario.
