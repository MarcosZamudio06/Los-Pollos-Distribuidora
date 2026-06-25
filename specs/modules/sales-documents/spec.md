# Module Spec — Documentos de venta

## Objetivo

Modelar la libreta documental de menudeo, reparto e institucional sin mezclarla con CFDI ni con la venta base.

## Funcionalidades

- Registrar nota sencilla.
- Registrar nota grande.
- Registrar ticket/comprobante interno.
- Guardar folio físico cuando aplique.
- Marcar entregado por, cobrado por y ruta asociada.
- Consultar documentos por venta.
- Reabrir documentos cancelados desde la venta.

## Entidades

- SaleDocument.
- Sale.
- OperationalLocation.
- DeliveryRoute.
- User.

## Reglas

- `sales` es dueño de la venta, inventario, pagos y cancelación.
- `sales-documents` es dueño del ciclo de vida documental, la consulta y la corrección autorizada de documentos.
- Un documento debe pertenecer a una venta confirmada.
- El folio físico debe ser único por serie o ubicación cuando aplique.
- Nota sencilla, nota grande y comprobante interno no generan CFDI.
- El documento debe conservar snapshots históricos de cliente, producto, precio y cantidades.
- El documento puede registrar segunda vuelta de cobranza sin duplicar la venta.

## Permisos

- ADMIN: crear, consultar y corregir documentos.
- SELLER: capturar y consultar documentos de sus ventas.
- COLLECTIONS: consultar documentos vinculados a cobranza.
- DRIVER: consultar documentos vinculados a su ruta si se autoriza.

## API

Las rutas exactas deben definirse en `specs/.specs/03-api/sales-documents-api.md` antes de implementar.

## UI

- Captura rápida tipo libreta, sin flujo paralelo de venta.
- Consulta y reapertura de documentos por venta.
- Folio físico.
- Estado documental.

## Pruebas mínimas

- Registrar nota sencilla.
- Registrar nota grande con folio.
- Consultar documentos por venta.
- Rechazar documento sin venta confirmada.
