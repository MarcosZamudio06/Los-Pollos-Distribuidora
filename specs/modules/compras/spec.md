# Module Spec — Compras

## Objetivo

Registrar entradas de mercancía desde proveedores, actualizar inventario por ubicación operativa y conservar trazabilidad de costos, cantidades y equivalencias.

## Funcionalidades

- Crear proveedor.
- Listar proveedores.
- Actualizar proveedor.
- Desactivar proveedor sin eliminar trazabilidad histórica.
- Registrar compra.
- Agregar productos a compra.
- Capturar cantidades por kilo, pieza o ambas unidades según el producto.
- Seleccionar ubicación operativa receptora.
- Confirmar compra.
- Incrementar inventario en la ubicación receptora.
- Registrar movimientos de inventario por producto comprado.
- Cancelar compra.
- Consultar historial.

## Entidades

- Supplier.
- Purchase.
- PurchaseItem.
- Product.
- ProductUnitEquivalent.
- OperationalLocation.
- InventoryBalance.
- InventoryMovement.
- User.

## Reglas

- Compra requiere proveedor.
- Compra requiere al menos un producto.
- Compra requiere ubicación operativa receptora.
- Cantidad debe ser mayor a cero.
- Costo debe ser mayor o igual a cero.
- Confirmar compra incrementa inventario en la ubicación operativa indicada.
- Confirmar compra debe registrar movimientos de inventario asociados a la ubicación receptora.
- Cancelar compra revierte inventario si es posible.
- No permitir inventario negativo por ubicación al cancelar.
- Para productos por kilo/pieza, debe conservarse unidad capturada, cantidad en kilo y/o pieza y equivalencia aplicada cuando corresponda.
- La actualización de costo de producto al registrar compra requiere permiso o política administrativa.

## Permisos

- ADMIN: acceso completo.
- WAREHOUSE: crear, confirmar, cancelar y consultar compras conforme a permisos.
- SELLER: sin acceso.
- DRIVER: sin acceso.
- COLLECTIONS: sin acceso.

## API

Las rutas exactas deben definirse en `.specs/03-api/purchases-api.md` antes de implementar. Este spec no autoriza crear endpoints adicionales por sí mismo.

Rutas ya referenciadas por el roadmap actual:

- GET /api/purchases
- GET /api/purchases/:id
- POST /api/purchases
- POST /api/purchases/:id/cancel
- GET /api/suppliers
- POST /api/suppliers
- PATCH /api/suppliers/:id
- DELETE /api/suppliers/:id

Pendiente de especificación API antes de implementar:

- Selección de ubicación operativa receptora.
- Validación de equivalencias kilo-pieza en compras.
- Actualización autorizada de costo.

## UI

- Tabla de compras.
- Formulario de nueva compra.
- Selector de proveedor.
- Página de proveedores con búsqueda, filtro por estado, alta, edición y desactivación visible solo para ADMIN.
- Selector de ubicación operativa receptora.
- Tabla de productos con unidad, kilos, piezas y costo.
- Total.
- Ver detalle.
- Cancelar compra.

## Pruebas mínimas

- Crear compra.
- Incrementar inventario por ubicación.
- Registrar movimientos con ubicación receptora.
- Rechazar compra sin proveedor.
- Rechazar compra sin productos.
- Rechazar compra sin ubicación receptora.
- Cancelar compra y revertir inventario si aplica.
- Rechazar cancelación si produciría inventario negativo por ubicación.
- Conservar equivalencia kilo/pieza aplicada cuando corresponda.
