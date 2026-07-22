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
- Venta a crédito con abono inicial genera `Payment` por el abono y `AccountReceivable` por el saldo.
- Nota sencilla, nota grande y ticket interno no son CFDI; la solicitud administrativa se maneja aparte como `BillingRequest`.
- Entregar y cobrar pueden ser usuarios distintos.
- No cancelar venta con pagos aplicados, cierre POS cerrado o liquidación cerrada sin reversa o reapertura auditable.

## Permisos

- ADMIN, SELLER, COLLECTIONS y DRIVER según flujo.

## API

Las rutas exactas deben definirse en `specs/.specs/03-api/sales-api.md` y `specs/.specs/03-api/sales-documents-api.md`.

## UI

- POS rápido.
- Libreta documental.
- Ticket interno.
- Solicitud administrativa interna.

## Pruebas mínimas

- Venta de contado.
- Venta a crédito.
- Venta abonada.
- Venta con solicitud administrativa.
- Cancelación con reversa de inventario.
- Bloquear cancelación con pagos hasta registrar reversa o reembolso.
- Requerir idempotencia en creación y cancelación.
