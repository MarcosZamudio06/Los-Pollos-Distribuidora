# Module Spec — Ventas / POS

## Objetivo

Registrar ventas de contado, crédito, abonadas y atrasadas con inventario por ubicación operativa, documentos internos de venta y solicitudes administrativas internas.

## Funcionalidades

- Buscar producto.
- Agregar productos al carrito.
- Capturar kilo, pieza o ambas unidades.
- Seleccionar canal de venta y tipo documental.
- Seleccionar cliente cuando aplique.
- Registrar folio físico y solicitud administrativa.
- Confirmar venta y descontar inventario.
- Generar cuenta por cobrar cuando aplique.
- Cancelar venta y revertir efectos.
- Consultar pedidos confirmados de una sucursal en tiempo real.

## Entidades

- Sale.
- SaleItem.
- SaleDocument.
- BillingRequest.
- AccountReceivable.
- Payment.
- Product.
- Customer.
- OperationalLocation.
- InventoryMovement.

## Reglas

- La venta debe conservar `saleChannel`, `documentType` y ubicación operativa.
- No vender sin stock suficiente.
- Un `SELLER` solo puede crear ventas desde su ubicación operativa asignada; `ADMIN` puede crear ventas desde cualquier ubicación activa compatible.
- La ubicación de descuento debe ser compatible con el canal: `COUNTER` acepta `BRANCH`, `MIXED` o `EXTERNAL_POINT_OF_SALE`; `EXTERNAL_POINT_OF_SALE` solo acepta `EXTERNAL_POINT_OF_SALE`; `ROUTE` solo acepta `ROUTE_STOCK`; `INSTITUTIONAL` y `WHOLESALE` solo aceptan `BRANCH` o `MIXED`.
- Si `saleChannel=ROUTE`, la venta debe descontar inventario exclusivamente desde `ROUTE_STOCK`.
- `Payment` es la única fuente monetaria de dinero recibido.
- Toda venta con saldo pendiente requiere trazabilidad de cuenta por cobrar.
- Venta de contado pagada completamente puede no generar cuenta por cobrar.
- `CASH_SALE` solo puede confirmarse cuando `totalPagado === totalVenta`; no admite saldo pendiente ni cuenta por cobrar.
- Toda venta de punto fijo requiere un turno de caja abierto del cajero y dispositivo actuales. Conserva `terminalId`, `cashShiftId`, `cashierUserId`, `businessDate`, `registeredAt` y `deviceId` desde la confirmación.
- Si un pago inicial de una venta a crédito usa `CASH`, también requiere una sesión abierta y conserva la misma referencia directa en `Sale` y `Payment`.
- Un pago parcial debe cambiar explícitamente el tipo de venta a `CREDIT_SALE` para activar la evaluación de crédito y generar la cuenta por cobrar correspondiente.
- Venta a crédito con abono inicial genera `Payment` por el abono y `AccountReceivable` por el saldo.
- Nota sencilla, nota grande y ticket interno no son CFDI; la solicitud administrativa se maneja aparte como `BillingRequest`.
- Entregar y cobrar pueden ser usuarios distintos.
- No cancelar venta con pagos aplicados, cierre POS cerrado o liquidación cerrada sin reversa o reapertura auditable.
- La operación administrativa `Anular venta` coordina la reversa de pagos, la cancelación de la venta, la restauración de inventario, la actualización de cartera y la invalidación de documentos internos de forma transaccional e idempotente.
- `Anular venta` requiere vista previa del impacto, motivo y autorización de `ADMIN`; no reabre automáticamente cierres POS ni liquidaciones de ruta cerrados.
- Un pedido operativo corresponde exclusivamente a una `Sale` confirmada y a su `locationId`; no existe una bandeja global de pedidos.
- La carga inicial y la recuperación de pedidos usan REST por sucursal; el canal en tiempo real solo publica actualizaciones posteriores al commit.
- Una venta confirmada emite `sale.created` únicamente después de confirmar la transacción. Un rollback o replay idempotente no emite eventos.
- Cada conexión de tiempo real se une a un único room de ubicación operativa. Un `SELLER` solo puede consultar y suscribirse a su ubicación asignada; un `ADMIN` debe elegir una ubicación activa explícita.

## Permisos

- `ADMIN` puede consultar pedidos de una ubicación activa seleccionada.
- `SELLER` puede consultar pedidos de su ubicación operativa asignada.
- COLLECTIONS y DRIVER no reciben pedidos del canal de ventas salvo que un flujo posterior lo autorice explícitamente.

## API

Las rutas exactas deben definirse en `specs/.specs/03-api/sales-api.md` y `specs/.specs/03-api/sales-documents-api.md`.

## UI

- POS rápido.
- Libreta documental.
- Ticket interno.
- Solicitud administrativa interna.
- Bandeja `Pedidos` por sucursal, con estado de conexión y sincronización REST tras reconexión.

## Pruebas mínimas

- Venta de contado.
- Venta a crédito.
- Venta abonada.
- Venta con solicitud administrativa.
- Cancelación con reversa de inventario.
- Bloquear cancelación con pagos hasta registrar reversa o reembolso.
- Requerir idempotencia en creación y cancelación.
- Aislar REST y Socket.IO entre sucursales.
- Recuperar pedidos perdidos tras reconexión sin duplicar `sale.id`.
