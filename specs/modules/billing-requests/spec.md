# Module Spec — Solicitudes Administrativas de Factura

## Objetivo

Gestionar la relación interna entre cliente, venta, documento y cuenta por cobrar cuando administración solicita control de factura futura sin emitir CFDI.

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

- No genera CFDI, SAT, PAC ni timbrado.
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

## Pruebas mínimas

- Crear solicitud administrativa.
- Revisar y aprobar solicitud administrativa.
- Enlazar solicitud a venta.
- Cancelar solicitud.
- Consultar reporte de solicitudes.
