# UI — Solicitudes Administrativas de Factura

## Objetivo

Gestionar la relación interna de solicitudes administrativas sin presentar CFDI ni flujos fiscales.

## Alcance

Pantallas y componentes requeridos:

- `BillingRequestsPage`.
- `BillingRequestDetail`.
- `BillingRequestFormDialog`.
- `BillingRequestStatusBadge`.

## Listado

Debe consumir `GET /api/billing-requests`.

Columnas:

- Cliente.
- Venta.
- Estado.
- Fecha de solicitud.
- Fecha de revisión.
- Responsable de revisión.
- Acciones.

Filtros:

- Cliente.
- Venta.
- Estado.
- Rango de fechas.
- Ubicación operativa.

## Detalle

Debe mostrar:

- Cliente.
- Venta relacionada.
- Cuenta por cobrar asociada cuando exista.
- Motivo.
- Notas.
- Estado de la solicitud.

## Formulario

Debe permitir:

- Crear solicitud desde una venta confirmada.
- Capturar motivo administrativo.
- Revisar y actualizar estado administrativo.
- Asociar cuenta por cobrar cuando exista.
- Agregar notas internas.

## Restricciones

- No mostrar CFDI, SAT, PAC, UUID fiscal ni timbrado.
- No crear ni cancelar inventario.
- No sustituir al ticket, nota o comprobante interno.
