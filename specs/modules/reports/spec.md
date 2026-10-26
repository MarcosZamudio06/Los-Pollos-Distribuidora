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

## Fecha operacional

- Las ventas POS se agrupan por `Sale.businessDate`; si falta en un registro
  heredado, se usa la jornada de su turno/cierre explícito. Solo las operaciones
  sin jornada utilizan la fecha civil de `createdAt` en `APP_TIMEZONE`.
- Los pagos pertenecen a su propio turno/cierre de cobranza, no a la fecha de la
  venta original. Los cobros sin turno/cierre se filtran por `paidAt` en
  `APP_TIMEZONE`, con intervalo semiabierto de medianoche local a medianoche.
- Un turno que cruza medianoche conserva su `businessDate`, sin omitir ni
  duplicar ventas/pagos en el día siguiente. La sincronización del cierre POS
  respeta esa misma autoridad y no desprende operaciones por su timestamp UTC.
- No se alteran `createdAt`, `registeredAt` ni `paidAt` para corregir reportes.
  El frontend inicializa filtros con la zona de `VITE_APP_TIMEZONE`, que debe
  coincidir con `APP_TIMEZONE`; ambas usan America/Mexico_City por defecto.

- Los formularios de cobranza inicializan fecha/hora en `VITE_APP_TIMEZONE`, no
  mediante recorte UTC ni con la zona horaria del navegador. Para la fecha
  operacional actual, el cobro conserva el instante real capturado; una fecha
  alternativa explícita y un `datetime-local` se convierten desde la zona
  operacional. Esto no cambia la autoridad de la jornada del turno/cierre.
