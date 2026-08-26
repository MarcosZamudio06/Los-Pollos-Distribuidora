# API — Solicitudes administrativas de factura

> Este contrato describe el MVP legacy. La migración post-MVP por múltiples documentos e importes se define en `specs/.specs/03-api/billing-reportable-notes-api.md`; el contrato anterior solo puede mantenerse temporalmente durante expand–backfill–contract.

Define contratos para la relación interna entre cliente, venta, documento y
cuenta por cobrar cuando administración solicita control de factura futura. No
emite CFDI por sí misma. En la fase nativa aprobada, `APPROVED` es consumido
únicamente por `POST /api/billing/requests/:id/issue-cfdi`.

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
- En detalle, `cfdiReview` contiene emisor, receptor, conceptos con claves SAT,
  impuestos y totales calculados por backend. Es una vista de revisión y no un
  snapshot persistido.
- `nativeInvoice` puede ser nulo antes de reservar emisión. Cuando existe,
  devuelve identidad/estado fiscal, cancelación, último intento y estado de
  artefactos sin `storageKey` ni secretos.

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
- `APPROVED` continúa terminal en esta máquina. Procesamiento PAC, timeout,
  reconciliación y éxito nunca se agregan como `BillingRequestStatus`.
- La emisión nativa usa `POST /api/billing/requests/:id/issue-cfdi`, exige
  `Idempotency-Key` y `expectedVersion`, y solo acepta UsoCFDI, método/forma de
  pago, exportación y tipo de cambio permitido. UUID, TFD, sellos, importes,
  certificado, estado PAC, identificadores PAC, XML y PDF son campos
  prohibidos de entrada.

## POST /api/billing/requests/:id/issue-cfdi

Propósito: reservar y emitir un CFDI de Ingreso desde una solicitud `APPROVED`.

Permisos: `ADMIN`, `BILLING`.

Headers y body mínimo:

```http
Idempotency-Key: <clave estable por intención>
```

```json
{
  "expectedVersion": 4,
  "cfdiUse": "G03",
  "paymentMethod": "PUE",
  "paymentForm": "03",
  "exportCode": "01"
}
```

La respuesta normalizada contiene `invoiceId`, `attemptId`, `fiscalStatus`,
`operationStatus`, `uuid` nullable y `replayed`. `STAMPING`, `UNKNOWN` y
`FAILED` se conservan para que la UI muestre `STAMPING`, `STAMP_UNKNOWN` o
`STAMP_ERROR` sin convertir incertidumbre en un error genérico. Un timeout no
autoriza una segunda emisión; la misma clave o una consulta de estado
reconcilia la operación.

El backend recalcula snapshots, conceptos, impuestos, totales y aplicaciones;
no se aceptan desde el cliente UUID, TFD, sellos, certificados, estado del PAC,
XML/PDF ni importes. La operación no muta `Sale`, `Payment`, `AccountReceivable`
ni inventario.

## POST /api/billing-requests/:id/cancel

Propósito: cancelar una solicitud administrativa.

Permisos: `ADMIN`, `COLLECTIONS` si la política lo permite.

Validaciones:

- No eliminar físicamente.
- Mantener historial de venta, pagos y documentos.
- No afectar inventario.
