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
- `InventoryBalance` representa existencia física en custodia dentro de una ubicación operativa; no representa por sí solo propiedad contable.
- La propiedad de una sucursal se deriva de su CEDIS padre directo y no requiere un segundo balance ni una ubicación virtual.
- Una transferencia `REQUESTED` o `IN_TRANSIT` reserva en su origen sin mover físicamente la mercancía.
- La disponibilidad por dimensión es `quantity - reservedQuantity`; nunca puede ser negativa.
- Las ventas y los ajustes negativos no pueden consumir mercancía reservada.
- Las reservas no representan una ubicación física adicional ni se suman otra vez a la existencia o a la propiedad de red.
- Un CEDIS es una `OperationalLocation` `DISTRIBUTION_CENTER`; sus sucursales
  directas son `BRANCH` con `parentId` igual al CEDIS activo.
- Las consultas de sucursales CEDIS solo devuelven hijas directas activas y
  respetan el alcance de ubicación del usuario.
- Una diferencia física debe quedar como ajuste trazable.
- Una recepción CEDIS conserva la cantidad enviada, incrementa la sucursal por la cantidad recibida y registra faltantes como `SHRINKAGE` o sobrantes como `IN`, con referencia a la recepción.
- Un traspaso puede salir de matriz y llegar a pollería o a `ROUTE_STOCK`.
- Una sucursal solo puede recibir inventario mediante un `InventoryTransfer` cuyo origen sea su CEDIS padre activo; las recepciones externas directas están prohibidas.
- Crear, confirmar y cancelar traspasos debe soportar idempotencia para no duplicar movimientos.
- Los traspasos vinculados a un ciclo CEDIS conservan las mismas reglas de inventario; el ciclo solo deriva dirección, alcance y trazabilidad.
- Un suministro del ciclo se crea `REQUESTED` con dirección CEDIS → sucursal; una devolución se crea `REQUESTED` con dirección sucursal → CEDIS.
- Confirmar o cancelar un traspaso vinculado debe validar que el ciclo no esté `CLOSED` ni `CANCELLED` e invalidar su proyección vigente.
- Los conflictos de disponibilidad, reserva, idempotencia y concurrencia deben exponer códigos estables en el sobre de error HTTP.
- `INSUFFICIENT_STOCK`, `INVENTORY_RESERVATION_INTEGRITY_ERROR` e `INVENTORY_CONCURRENCY_CONFLICT` responden `409 Conflict` y no dejan mutaciones parciales.
- `LOCATION_NOT_AUTHORIZED` responde `403 Forbidden`; `PRODUCT_INACTIVE` y `UNIT_MISMATCH` responden `400 Bad Request`.

## Permisos

- ADMIN y WAREHOUSE.
- `cedis.dispatch` autoriza abastecimientos desde el CEDIS asignado.
- `cedis.receive_supplies` autoriza recepciones de suministros destinados a la sucursal autorizada.
- `cedis.receive_returns` autoriza devoluciones hacia el CEDIS asignado.
- `cedis.reconcile` autoriza reconstruir snapshots y elegibilidad del ciclo.
- `SELLER` solo consulta su sucursal con `cedis.view`; no recibe costos ni
  utilidad sin `cedis.view_costs`.

## API

Las rutas exactas deben definirse en `specs/.specs/03-api/inventory-api.md` y `specs/.specs/03-api/inventory-transfers-api.md`.

Los ciclos CEDIS se definen en `specs/modules/branch-supply-cycles/spec.md` y `specs/.specs/03-api/branch-supply-cycles-api.md`.

## UI

- Catálogo de productos.
- Presentación semántica visible por producto.
- Stock por ubicación.
- Traspasos.
- Los comandos CEDIS deben consultar la disponibilidad de la ubicación origen y mostrar existencia física, comprometido, disponible, cantidad solicitada, faltante y estado operativo.
- El formulario debe deshabilitar productos sin disponibilidad, impedir partidas duplicadas y validar KG y PIECE por separado antes de confirmar.
- Un conflicto de disponibilidad o concurrencia debe conservar el formulario y refrescar los saldos antes del reintento.

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
- No se permite reserva negativa ni reserva mayor que la existencia física.
- Cancelar una transferencia libera su reserva sin crear movimientos físicos.
- Confirmar una transferencia consume su reserva y crea los movimientos físicos de salida y entrada en una sola transacción.
- Varios suministros y devoluciones dentro del mismo ciclo sin vínculos ni movimientos duplicados.
- Confirmación/cancelación de traspaso vinculado invalida la proyección del ciclo.
- El dashboard operativo del CEDIS debe mostrar por fecha: recibido de proveedores, enviado a sucursales, devuelto al CEDIS y restante físico total.
