# Module Spec — Inventario

## Objetivo

Controlar productos, existencias por ubicación operativa, ajustes, mermas y traspasos entre matriz, pollerías y rutas, separando el catálogo semántico del producto en kilo, unidad entera o corte.

## Funcionalidades

- Crear y editar productos.
- Clasificar productos por tipo semántico.
- Consultar stock por ubicación.
- Registrar ajustes y mermas.
- Consultar movimientos.
- Crear y confirmar traspasos.

## Entidades

- Product.
- Category.
- InventoryBalance.
- InventoryMovement.
- InventoryTransfer.
- InventoryTransferItem.
- OperationalLocation.

## Reglas

- No existe stock global.
- Toda operación conserva ubicación operativa.
- Una diferencia física debe quedar como ajuste trazable.
- Un traspaso puede salir de matriz y llegar a pollería o a `ROUTE_STOCK`.
- Crear, confirmar y cancelar traspasos debe soportar idempotencia para no duplicar movimientos.

## Permisos

- ADMIN y WAREHOUSE.

## API

Las rutas exactas deben definirse en `specs/.specs/03-api/inventory-api.md` y `specs/.specs/03-api/inventory-transfers-api.md`.

## UI

- Catálogo de productos.
- Presentación semántica visible por producto.
- Stock por ubicación.
- Traspasos.

## Pruebas mínimas

- Ajuste por ubicación.
- Traspaso confirmado.
- Consulta de inventario por ubicación.
- Carga de ruta descuenta origen y aumenta `ROUTE_STOCK`.
- Venta en ruta descuenta `ROUTE_STOCK`.
- Devolución desde ruta aumenta destino y descuenta `ROUTE_STOCK`.
- No existe doble decremento en carga más venta de ruta.
- Reintento idempotente en creación, confirmación y cancelación de traspaso.
- No se permite stock negativo.
