# API — Solicitudes administrativas de factura

> Este contrato describe el MVP legacy. La migración post-MVP por múltiples documentos e importes se define en `specs/.specs/03-api/billing-reportable-notes-api.md`; el contrato anterior solo puede mantenerse temporalmente durante expand–backfill–contract.


Define contratos para la relación interna entre cliente, venta, documento y cuenta por cobrar cuando administración solicita control de factura futura. No emite CFDI ni habilita SAT.

## GET /api/billing-requests

Propósito: listar solicitudes administrativas.

Permisos: `ADMIN`, `SELLER`, `COLLECTIONS` según alcance.

Query:

- `page`, `limit`.
- `customerId`, `saleId`.
- `status`: `REQUESTED`, `IN_REVIEW`, `APPROVED`, `REJECTED`, `CANCELLED`.
- `dateFrom`, `dateTo`.
- `locationId`.

Respuesta `data.items[]`:

- `id`, `customerId`, `customerName`, `saleId`, `saleNumber`.
- `requestedByUserId`, `reviewedByUserId`, `status`.
- `requestedAt`, `reviewedAt`, `reason`, `notes`, `createdAt`, `updatedAt`.

## GET /api/billing-requests/:id

Propósito: obtener detalle de la solicitud.

Permisos: `ADMIN`, `SELLER`, `COLLECTIONS` según alcance.

Respuesta `data`:

- Campos de la solicitud.
- `customer`, `sale`, `accountReceivable` cuando existan.

## POST /api/billing-requests

Propósito: crear solicitud administrativa interna.

Permisos: `ADMIN`, `SELLER`.

Body importante:

```json
{
  "customerId": "string",
  "saleId": "string",
  "reason": "Customer requested administrative follow-up",
  "notes": "Solicitud interna de control administrativo"
}
```

Validaciones:

- `customerId` requerido.
- `saleId` requerido y debe existir.
- `reason` requerido.
- La solicitud no debe crear CFDI ni campos SAT.
- Debe conservar la trazabilidad interna de la venta.
- La venta no puede estar cancelada, debe tener cliente y no puede tener otra solicitud.
- Una solicitud creada para una venta con saldo pendiente se enlaza a su cuenta por cobrar.

## PATCH /api/billing-requests/:id

Propósito: actualizar revisión administrativa sin alterar la venta base.

Permisos: `ADMIN`, `SELLER` autorizado.

Validaciones:

- No cambiar `saleId`.
- No modificar inventario ni importes de venta.
- No permitir cambios que conviertan la solicitud en CFDI.
- Solo permitir transición controlada entre `REQUESTED`, `IN_REVIEW`, `APPROVED`, `REJECTED` y `CANCELLED`.
- Transiciones permitidas: `REQUESTED → IN_REVIEW|CANCELLED` e `IN_REVIEW → APPROVED|REJECTED|CANCELLED`.
- `APPROVED`, `REJECTED` y `CANCELLED` son terminales.
- Cada transición registra actor, fecha, motivo y notas en historial.

## POST /api/billing-requests/:id/cancel

Propósito: cancelar una solicitud administrativa.

Permisos: `ADMIN`, `COLLECTIONS` si la política lo permite.

Validaciones:

- No eliminar físicamente.
- Mantener historial de venta, pagos y documentos.
- No afectar inventario.
