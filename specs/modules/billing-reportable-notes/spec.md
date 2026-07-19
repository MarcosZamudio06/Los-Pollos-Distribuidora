# Módulo — Notas facturables y conciliación de facturas externas

## Decisión canónica

El ERP incorporará, como fase posterior al MVP, un módulo operativo para identificar notas facturables, crear solicitudes totales, parciales o agrupadas y conciliar facturas emitidas por un sistema externo.

Esta capacidad **no emite facturas fiscales**. Quedan fuera de alcance la generación de CFDI, XML, timbrado, integración con PAC o SAT, certificados y cancelación ante la autoridad. El UUID, cuando exista, es únicamente un identificador de una factura ya emitida externamente.

Este documento es la fuente canónica del módulo. `docs/spec-factura/spec.md` conserva el detalle funcional de origen y debe interpretarse conforme a estas decisiones y a los specs transversales enlazados.

## Límites del dominio

- `Sale` representa la operación comercial.
- `SaleDocument` representa cada documento comercial originado por la venta y es la unidad facturable.
- `SaleItem` representa la unidad de detalle para aplicaciones exactas por partida.
- `BillingRequest` representa una solicitud, nunca una factura.
- `Invoice` registra y concilia una factura emitida externamente; no la genera ni la timbra.
- `Payment` continúa ligado a `Sale` o `AccountReceivable`.
- `PaymentAllocation` permanece fuera del modelo. La conciliación de cobro se deriva por `Invoice → SaleDocument → Sale`.
- Vincular, cancelar o sustituir una factura no crea ni modifica ventas, pagos o movimientos de inventario.

## Entidad emisora y moneda

`LegalEntity` representa la persona moral o física emisora de la factura externa. Es distinta de `OperationalLocation`: una ubicación describe dónde se vende, almacena o entrega; una entidad legal describe quién factura.

Toda venta incluida en este módulo debe tener:

- `currencyCode` ISO 4217; los datos legacy se migran inicialmente a `MXN`.
- una `LegalEntity` resuelta mediante una relación explícita y auditable con la ubicación u operación.

No se agrupan documentos con distinta moneda o entidad emisora. Los mapeos ambiguos no se infieren: se incluyen en un listado de remediación previo al backfill.

## Perfil fiscal mínimo del cliente

Para solicitar factura se requiere un perfil fiscal completo y vigente con:

- RFC o identificador fiscal aplicable;
- nombre o razón social fiscal;
- código postal fiscal;
- régimen fiscal;
- uso fiscal requerido para la solicitud;
- correo administrativo para entrega o seguimiento.

La dirección de entrega no sustituye el domicilio fiscal. La completitud se deriva de campos estructurados y devuelve códigos estables; no se persiste un booleano como fuente de verdad.

## Documentos facturables y normalización

Los tipos facturables son configurables. La política inicial permite `SIMPLE_NOTE` y `LARGE_NOTE`; `INTERNAL_RECEIPT` solo cuando la política comercial lo habilita. `SCALE_TICKET` no es facturable por sí solo.

`Sale.documentType` expresa el tipo solicitado para la venta. Por cada venta nueva debe persistirse un `SaleDocument` de ese tipo. Un `INTERNAL_RECEIPT` puede coexistir como comprobante adicional, pero no reemplaza el documento solicitado. Los datos históricos deben normalizarse antes de activar el reporte; cualquier caso ambiguo se remedia manualmente.

## Política de facturabilidad y vencimiento

La política configurable define:

- tipos documentales facturables;
- si `INTERNAL_RECEIPT` puede solicitar factura;
- si la entrega confirmada es requisito;
- número de días naturales disponibles desde la fecha de emisión o entrega definida por la política.

La fecha límite se calcula en la zona horaria operativa configurada. Rebasarla produce un bloqueo derivado, salvo excepción autorizada y auditada por `ADMIN`. La política no puede desactivar invariantes como saldo disponible, cliente, moneda o emisor compatibles.

## Estados derivados

El estado de facturación se calcula desde venta, documento, cliente, entrega, política, solicitudes y aplicaciones vigentes:

- `NOT_BILLABLE`
- `BILLABLE`
- `PENDING_INFORMATION`
- `REQUESTED`
- `IN_PROCESS`
- `PARTIALLY_INVOICED`
- `FULLY_INVOICED`
- `BLOCKED`
- `CANCELLED`

No se persiste como fuente de verdad ni se cambia manualmente. Solicitudes rechazadas o canceladas y facturas canceladas o sustituidas sin efecto vigente se excluyen de los acumulados.

## Factura externa

`Invoice` conserva emisor, moneda, serie, folio, UUID opcional, importes, estado, versión, cancelación y sustitución. Estados mínimos:

- `ACTIVE`
- `CANCELLED`
- `SUBSTITUTED`

La sustitución crea una relación explícita entre factura original y sustituta; nunca sobrescribe UUID, serie o folio históricos. Cancelaciones, sustituciones y reversiones requieren motivo, actor, timestamp y evidencia auditable.

## Relaciones e integridad monetaria

- `BillingRequestSaleDocument` relaciona solicitudes y documentos con importes solicitados.
- `InvoiceSaleDocument` relaciona facturas externas y documentos con importes aplicados y reversión lógica.
- `InvoiceSaleItemApplication` conserva la aplicación exacta por partida.

Los importes usan `Decimal(14,2)`. La suma solicitada o aplicada no puede exceder el saldo disponible. Las operaciones bloquean documentos en orden estable, usan transacción serializable, `expectedVersion`, idempotencia y una protección PostgreSQL de respaldo.

## Solicitudes

Una solicitud contiene uno o más documentos e importes. Solo pueden agruparse documentos del mismo cliente, perfil fiscal, moneda, entidad emisora y condiciones fiscales compatibles, sin bloqueos vigentes.

Los estados terminales no se reabren. Un reintento crea una solicitud nueva vinculada al historial. La transición y cualquier cambio de composición o importe deben quedar auditados.

## API pública

Lecturas del módulo:

- `GET /api/billing/reportable-notes`
- `GET /api/billing/reportable-notes/summary`
- `GET /api/billing/reportable-notes/:saleDocumentId`
- `GET /api/billing/reportable-notes/export`

Comandos principales:

- `POST /api/billing/requests`
- `GET /api/billing/requests/:id`
- `POST /api/billing/requests/:id/approve`
- `POST /api/billing/requests/:id/reject`
- `POST /api/billing/requests/:id/cancel`
- `POST /api/billing/requests/:id/link-invoice`

Los importes JSON se exponen como cadenas decimales. Los comandos críticos requieren `Idempotency-Key` y `expectedVersion`. Los errores usan códigos estables, entre ellos `OVER_INVOICED`, `ACTIVE_REQUEST_EXISTS`, `MIXED_CURRENCIES` y `MIXED_LEGAL_ENTITIES`.

## Permisos

- `ADMIN`: acceso global, configuración, excepciones y auditoría completa.
- `BILLING`: consulta global, aprobación, rechazo, bloqueo, vinculación y exportación.
- `SELLER`: consulta notas propias, estado y creación de solicitudes permitidas.
- `COLLECTIONS`: consulta pagos y conciliación, sin vincular facturas.
- `WAREHOUSE`: sin acceso fiscal por defecto.
- `DRIVER`: sin acceso al módulo ni a datos fiscales; conserva únicamente información operativa de entrega.

El backend aplica el alcance. Ocultar rutas o controles en frontend es solo defensa adicional.

## UI y exportación

La ruta protegida es `/billing/reportable-notes` y se presenta como “Notas facturables”. Incluye indicadores, filtros persistidos en URL, tabla paginada, selección compatible, detalle de partidas y relaciones, estados de frescura y acciones según permisos.

CSV y XLSX se generan desde el mismo read model y filtros. Los archivos incluyen usuario, zona horaria, fecha, filtros, totales de control e identificadores; importes como valores numéricos y UUID/folios como texto.

## Auditoría

Se registra actor, acción, entidad, antes/después, motivo, timestamp, IP cuando esté disponible, correlación y contexto para solicitudes, excepciones, bloqueos, aplicaciones, reversiones, cancelaciones, sustituciones y exportaciones. No se eliminan físicamente relaciones contables sin conservar evidencia.

## Criterios de aceptación

- La facturación total, parcial y agrupada nunca excede saldos disponibles.
- Tabla, resumen, detalle y exportaciones comparten filtros y totales.
- Operaciones concurrentes no duplican solicitudes ni sobrefacturan.
- Cancelaciones y sustituciones conservan historia y ajustan solo acumulados vigentes.
- La matriz RBAC se valida en backend y frontend.
- Ninguna operación de factura crea o modifica `Sale`, `Payment` o `InventoryMovement`.
- Existen pruebas unitarias, PostgreSQL, contrato, E2E, frontend, conciliación y rollback.

## Fuentes transversales

- `specs/.specs/00-business/PRD.md`
- `specs/.specs/00-business/business-rules.md`
- `specs/.specs/01-architecture/architecture.md`
- `specs/.specs/02-database/entities.md`
- `specs/.specs/02-database/database.md`
- `specs/.specs/03-api/billing-reportable-notes-api.md`
- `specs/.specs/04-ui/billing-reportable-notes.md`
- `specs/.specs/05-testing/acceptance-criteria.md`
- `specs/.specs/05-testing/testing-strategy.md`
