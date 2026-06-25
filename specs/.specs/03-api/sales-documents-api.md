# API — Documentos de venta

Define contratos para nota sencilla, nota grande, ticket/comprobante interno y otros documentos operativos de venta sin CFDI.

Responsabilidad: este contrato cubre solo el ciclo de vida documental. `sales` conserva la venta, sus items, totales, inventario, pago y cancelación; aquí solo se consulta, relaciona y corrige el documento.

## GET /api/sales/:saleId/documents

Propósito: listar documentos asociados a una venta.

Permisos: `ADMIN`, `SELLER`, `COLLECTIONS` según alcance; `DRIVER` solo si la venta está asignada a su ruta.

Respuesta `data.items[]`:

- `id`, `saleId`, `documentType`, `physicalFolio`, `status`.
- `requiresAdministrativeInvoice`, `operationalLocationId`, `routeId`.
- `deliveredByUserId`, `collectedByUserId`, `createdAt`, `updatedAt`.

## POST /api/sales/:saleId/documents

Propósito: crear o relacionar el documento interno de una venta.

Permisos: `ADMIN`, `SELLER`.

Body importante:

```json
{
  "documentType": "SIMPLE_NOTE",
  "physicalFolio": "A-1024",
  "requiresAdministrativeInvoice": false,
  "operationalLocationId": "string",
  "deliveredByUserId": "string opcional",
  "collectedByUserId": "string opcional",
  "routeId": "string opcional"
}
```

Validaciones:

- `saleId` debe existir y estar confirmada.
- `documentType` requerido.
- `physicalFolio` requerido cuando aplique folio físico.
- No generar CFDI ni campos SAT.
- Debe conservar snapshots y trazabilidad histórica.

## PATCH /api/sale-documents/:id

Propósito: actualizar metadatos y estado documental sin tocar la venta base.

Permisos: `ADMIN`, `SELLER` autorizado.

Lifecycle:

- `DRAFT`: documento visible y editable dentro de los campos permitidos.
- `ISSUED`: documento emitido y visible para consulta.
- `COLLECTED`: documento con cobranza registrada o conciliada.
- `CANCELLED`: documento cerrado; solo admite consulta o reapertura autorizada.
- Reapertura autorizada: `CANCELLED -> DRAFT`.

Validaciones:

- No permitir editar documentos cancelados salvo reapertura autorizada.
- No cambiar `saleId`.
- No convertir un documento interno en CFDI.
- Solo permitir cambios en `physicalFolio`, `status`, `routeId`, `deliveredByUserId`, `collectedByUserId` y `requiresAdministrativeInvoice` cuando la política lo autorice.
- No permitir modificar items, precios, totales, cliente, `locationId`, inventario ni el tipo de documento.
