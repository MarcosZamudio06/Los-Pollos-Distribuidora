# Module Spec — Reportes

## Objetivo

Exponer métricas operativas casi en tiempo real de ventas, inventario, cobranza, facturación administrativa, reparto y conciliación.

## Funcionalidades

- Dashboard.
- Ventas diarias.
- Cartera.
- Facturación administrativa.
- Reparto.
- Conciliación de punto de venta.
- Inventario por ubicación.

## Entidades

- Sale.
- SaleDocument.
- BillingRequest.
- InventoryBalance.
- AccountReceivable.
- Payment.
- DeliveryRoute.
- RouteSettlement.

## Reglas

- Los reportes distinguen contado, crédito, abonado y atrasado.
- Los documentos operativos de venta y las solicitudes administrativas deben verse por separado.
- Los kilos enviados desde matriz deben poder compararse con vendidos y ajustados.
- Los pagos deben poder agruparse por método y banco.
- La cartera debe mostrar saldo global y saldo final por cliente.

## Permisos

- ADMIN, SELLER, WAREHOUSE, COLLECTIONS y DRIVER según alcance.

## API

Las rutas exactas deben definirse en `specs/.specs/03-api/reports-api.md`.

## UI

- Dashboard.
- Reporte diario de ventas.
- Cartera.
- Facturación administrativa.
- Reparto.

## Pruebas mínimas

- Ventas diarias.
- Cartera vencida.
- Cobranza por ruta.
- Facturación administrativa.
- Conciliación por ubicación.
