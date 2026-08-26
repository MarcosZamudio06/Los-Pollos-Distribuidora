# Module Spec — Solicitudes Administrativas de Factura

## Objetivo

Gestionar la relación interna entre cliente, venta, documento y cuenta por
cobrar. La solicitud nunca es un CFDI; en la fase fiscal post-MVP aprobada su
estado `APPROVED` es la única entrada a un comando nativo separado.

## Funcionalidades

- Crear solicitud administrativa desde una venta.
- Revisar solicitud con flujo administrativo auditable.
- Enlazar solicitud con cuenta por cobrar cuando exista.
- Consultar estatus de solicitud.
- Cancelar solicitud sin afectar inventario.
- Reportar solicitudes creadas, revisadas, aprobadas, rechazadas y canceladas.

## Entidades

- BillingRequest.
- Customer.
- Sale.
- SaleDocument.
- AccountReceivable.

## Reglas

- Crear, editar, revisar o aprobar la solicitud no invoca PAC ni genera CFDI.
- `APPROVED` permite `POST /api/billing/requests/:id/issue-cfdi`; el estado
  fiscal reside en `Invoice`/`FiscalOperationAttempt` y no reabre ni sobrecarga
  el estado de la solicitud.
- UUID, TFD, sellos, datos SAT, identificadores PAC y artefactos no son campos
  de escritura de una solicitud.
- Cada solicitud debe conservar trazabilidad de venta y cliente.
- La cancelación no elimina historial de venta ni pagos.
- Puede existir sin cuenta por cobrar en ventas de contado.
- No es un `SaleDocument` ni agrega nuevos valores al `documentType` de venta.

## Permisos

- ADMIN, SELLER y COLLECTIONS según alcance.

## API

Las rutas exactas deben definirse en `specs/.specs/03-api/billing-requests-api.md`.

## UI

- Listado de solicitudes.
- Detalle de solicitud.
- Creación y enlace desde venta.
- Estado de solicitud.
- Para `APPROVED`, `InvoiceReconciliationPanel` se transforma en revisión y
  emisión CFDI nativa; no se crea un módulo paralelo ni se muestran campos de
  factura externa.
- La revisión muestra emisor, receptor, RFC, régimen, CP, UsoCFDI, conceptos,
  claves SAT, impuestos y totales server-owned. Solo permite escoger las
  decisiones fiscales aceptadas por el endpoint.
- `STAMP_UNKNOWN` es un estado visible y reconciliable, no un error genérico.
- `STAMPED` muestra UUID, fechas, cancelación y descargas XML/PDF mediante URL
  firmada temporal; nunca expone storageKey ni permite editar identidad fiscal.

## Pruebas mínimas

- Crear solicitud administrativa.
- Revisar y aprobar solicitud administrativa.
- Enlazar solicitud a venta.
- Cancelar solicitud.
- Consultar reporte de solicitudes.
- Validar elegibilidad de emisión nativa en `APPROVED` sin efectos fiscales al
  aprobar.
