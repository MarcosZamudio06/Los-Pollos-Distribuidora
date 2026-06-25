# Deprecated Module Alias — Facturación

Este archivo queda **deprecated**.

Specs canónicos:

- `/Users/marcoszamudio/Documents/Dev/pollos-distribuidor/specs/modules/sales-documents/spec.md`
- `/Users/marcoszamudio/Documents/Dev/pollos-distribuidor/specs/modules/billing-requests/spec.md`

Motivo:

- El dominio antes llamado `facturacion` mezclaba comprobantes operativos de venta con solicitudes administrativas.
- El canon vigente separa `SaleDocument` para ticket, nota sencilla, nota grande y comprobante interno operativo.
- `BillingRequest` queda como relación administrativa independiente y no agrega un valor nuevo al documento de `Sale`.

Regla:

- No planear ni implementar nuevas tareas usando este alias.
- Toda referencia futura a ticket, comprobante interno o libreta documental debe apuntar a `modules/sales-documents/spec.md`.
- Toda referencia futura a solicitud administrativa de factura debe apuntar a `modules/billing-requests/spec.md`.
