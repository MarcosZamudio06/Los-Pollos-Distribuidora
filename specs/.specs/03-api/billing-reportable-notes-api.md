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

Retorna venta, documento, partidas, perfil fiscal autorizado, solicitudes, facturas externas, pagos, entrega y auditoría resumida. Los datos sensibles se omiten según rol.

## GET /api/billing/reportable-notes/export

Exporta CSV o XLSX desde el mismo read model. Aplica límite de filas, streaming, nombre determinista y auditoría de exportación.

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

## Errores de negocio

Como mínimo: `MISSING_FISCAL_PROFILE`, `ACTIVE_REQUEST_EXISTS`, `OVER_REQUESTED`, `OVER_INVOICED`, `MIXED_CUSTOMERS`, `MIXED_CURRENCIES`, `MIXED_LEGAL_ENTITIES`, `VERSION_CONFLICT` e `IDEMPOTENCY_CONFLICT`.
