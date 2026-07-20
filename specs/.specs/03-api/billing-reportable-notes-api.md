# API — Notas facturables y facturas externas

## Alcance

Contratos de la fase post-MVP para consulta, solicitud y conciliación de facturas emitidas externamente. No emiten CFDI, XML, timbrado ni integran PAC o SAT.

## Convenciones comunes

- Permisos de lectura: `ADMIN` y `BILLING` global; `SELLER` solo propios; `COLLECTIONS` únicamente datos de cobro autorizados.
- Los importes JSON son cadenas decimales.
- Tabla, resumen y exportación reutilizan el mismo DTO y predicado de filtros.
- Metadatos: `generatedAt`, `dataAsOf`, `freshnessSeconds`, `isStale`.
- Filtros: fechas, ubicación, cliente, RFC, vendedor, ruta, tipo de documento, estado de facturación, pago y entrega, solicitud, completitud fiscal, vencimiento, bloqueo, folios y UUID.
- Ordenamiento limitado a campos permitidos y paginación obligatoria en listados.

## GET /api/billing/reportable-notes

Retorna `items`, `pagination` y `summary` bajo los filtros activos. Cada fila representa un `SaleDocument`, no una venta ni una factura.

## GET /api/billing/reportable-notes/summary

Retorna conteos e importes de control con exactamente los mismos filtros y alcance RBAC del listado.

## GET /api/billing/reportable-notes/:saleDocumentId

Retorna venta, documento, partidas, perfil fiscal autorizado, solicitudes, facturas, pagos, entrega y auditoría resumida. Las facturas se separan en `activeInvoices` e `invoiceHistory`: el primer grupo contiene únicamente aplicaciones no revertidas de facturas `ACTIVE`; el historial conserva aplicaciones revertidas y facturas `CANCELLED` o `SUBSTITUTED`, con sus datos disponibles de cancelación, sustitución o reversión. Los datos sensibles se omiten según rol.

## GET /api/billing/reportable-notes/export

Exporta CSV o XLSX desde el mismo read model. Incluye ubicación, vendedor, ruta, saldo cobrado, saldo por cobrar, códigos de bloqueo, fecha límite, estado de entrega y los conteos e importes completos de control. Aplica límite de filas, streaming, nombre determinista y auditoría de exportación.

## POST /api/billing/requests

Recibe `documents[]` con `saleDocumentId` e importes solicitados. Requiere `Idempotency-Key` y valida en una transacción serializable cliente, perfil fiscal, moneda, emisor, impuestos, entrega, bloqueos y saldo.

## POST /api/billing/requests/:id/approve

Requiere rol `ADMIN` o `BILLING`, `expectedVersion` y transición válida.

## POST /api/billing/requests/:id/reject

Requiere rol `ADMIN` o `BILLING`, `expectedVersion` y motivo obligatorio. La solicitud queda terminal.

## POST /api/billing/requests/:id/cancel

Requiere permiso, `expectedVersion` y motivo obligatorio. No elimina aplicaciones ni documentos históricos.

## POST /api/billing/requests/:id/link-invoice

Registra o referencia una factura externa y sus aplicaciones por documento y partida. Requiere `Idempotency-Key`, `expectedVersion` y rol `ADMIN` o `BILLING`. Debe rechazar diferencias entre suma de partidas, aplicación por documento, totales de factura y saldo disponible.

Cuando `invoice.substitutesInvoiceId` está presente, `invoice.substitutionReason` es obligatorio. La factura original se bloquea antes de validarla y debe continuar `ACTIVE`, sin sustitución concurrente. La sustituta debe conservar exactamente el mismo emisor, moneda y aplicaciones vigentes por nota y partida —incluidos subtotal, impuesto y total— antes de marcar la original como `SUBSTITUTED`. El motivo y la relación se conservan en auditoría.

## POST /api/billing/invoices/:id/cancel

Cancela operativamente una factura externa con rol `ADMIN` o `BILLING`. Requiere `Idempotency-Key`, `expectedVersion` y motivo obligatorio. En una transacción serializable marca la factura `CANCELLED`, revierte lógicamente sus aplicaciones por documento y partida, registra auditoría y reapertura del saldo facturable derivado. Rechaza facturas no activas, versiones obsoletas, claves idempotentes con payload distinto y cadenas de sustitución incompatibles. No cancela CFDI ante SAT.

## GET /api/billing/remediations

Lista remediaciones con rol `ADMIN` o `BILLING`. Permite filtrar por estado abierto o resuelto, código y texto, con paginación obligatoria. Incluye contexto de venta, entidad legal asignada, detalles originales, resolución y actor sin recalcular estados en frontend.

## POST /api/billing/remediations/:id/resolve

Requiere rol `ADMIN`, motivo obligatorio y `expectedUpdatedAt`. Puede recibir una corrección específica para el código o ejecutar únicamente la validación posterior si los datos fueron corregidos por otro flujo. La operación usa una transacción serializable, bloquea la remediación y la venta, aplica la corrección, reevalúa la inconsistencia y solo entonces registra la resolución y `BillingAuditLog`. Si la inconsistencia persiste, responde `REMEDIATION_STILL_PRESENT` y revierte toda la transacción. Una remediación ya resuelta responde de forma idempotente sin alterar su evidencia histórica.

Correcciones soportadas:

- `MISSING_LEGAL_ENTITY_MAPPING`: `legalEntityId` activo.
- `AMBIGUOUS_SALE_DOCUMENT`: `selectedSaleDocumentId`; los duplicados sin relaciones contables se cancelan lógicamente.
- `UNALLOCATED_ITEM_AMOUNTS`: `items[]` con subtotal, descuento, impuesto y total por partida.
- `INVALID_SALE_TOTAL`: subtotal, descuento, impuesto y total de la venta.

El listado de notas entrega `pendingSubtotal`, `pendingTax`, `pendingTotal` y `requestableItems[]`. Cada partida incluye `saleItemId`, nombre y sus tres importes pendientes. `POST /billing/requests` acepta `documents[].items[]` con los identificadores seleccionados; subtotal, impuesto y total deben coincidir con la suma exacta recalculada por backend. No existe prorrateo implícito.

## Errores de negocio

Como mínimo: `MISSING_FISCAL_PROFILE`, `ACTIVE_REQUEST_EXISTS`, `OVER_REQUESTED`, `OVER_INVOICED`, `MIXED_CUSTOMERS`, `MIXED_CURRENCIES`, `MIXED_LEGAL_ENTITIES`, `VERSION_CONFLICT` e `IDEMPOTENCY_CONFLICT`.
