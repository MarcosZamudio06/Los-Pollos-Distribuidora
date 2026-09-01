# API — CFDI 4.0 nativo

## Alcance

Estos contratos crean y consultan operaciones fiscales nativas sin modificar
las API existentes de Ventas, Pagos, Cuentas por cobrar o Inventario. CFDI de
Ingreso y CFDI tipo Pago son los tipos habilitados en la primera fase; Egreso y
otros complementos permanecen reservados.

Reglas comunes:

- Los importes JSON son strings decimales.
- Todo comando exige permisos autenticados, `Idempotency-Key` y, cuando se
  indique, versión optimista.
- Los DTO usan allowlist estricta y rechazan propiedades desconocidas.
- UUID, TFD, sellos, datos SAT, identificadores PAC, XML, PDF y acuses son
  campos de respuesta propiedad del servidor y se rechazan en requests.
- Los errores de negocio usan el envelope API estándar y códigos estables.

## Catálogos SAT de solo lectura

`GET /api/cfdi/catalogs` devuelve los catálogos soportados, su versión activa,
checksum y si el entorno ya fue configurado. `GET /api/cfdi/catalogs/:key`
devuelve las entradas de la versión activa y acepta `code`, `asOf` y `limit`
(máximo 1000). Ambas rutas requieren `ADMIN` o `BILLING`, responden con
`Cache-Control: private, max-age=300` y usan caché de servidor de cinco minutos.

Si no existe una versión activa, la respuesta es `configured=false` con
`entries=[]`; el backend no consulta al SAT en línea ni inventa descripciones.
Las cargas se ejecutan fuera de la API de ventas mediante el importador de
`SatCatalogImportService`: staging, validación de duplicados/rangos/checksum y
activación atómica. El frontend usa los códigos de esta API en selects
controlados y nunca puede modificar snapshots de `Invoice`.

## Administración del emisor LegalEntity

Estas rutas administran la configuración fiscal del emisor sin emitir CFDI ni
modificar ventas, pagos o inventario. Requieren rol `ADMIN` o `BILLING` y el
permiso `cfdi.provider.manage`.

- `GET /api/legal-entities` — lista perfiles, estado activo y completitud.
- `GET /api/legal-entities/:id` — devuelve un perfil individual.
- `POST /api/legal-entities` — crea una entidad fiscal; permite perfil
  incompleto mientras `cfdiEnabled=false`.
- `PATCH /api/legal-entities/:id` — actualiza datos normalizados y exige
  completitud antes de habilitar CFDI.
- `DELETE /api/legal-entities/:id` — desactiva lógicamente la entidad; no
  reescribe ventas o facturas históricas.

El request acepta únicamente identidad fiscal, lugar de expedición, régimen,
serie y metadata no secreta de certificado. Nunca acepta `.key`, contraseña de
CSD, token PAC, UUID, TFD, sellos ni resultados SAT.

Al crear una venta con solicitud administrativa, el backend debe resolver
exactamente un mapeo vigente `OperationalLocation -> LegalEntity` y validar que
la entidad esté activa, `cfdiEnabled=true`, completa y con certificado vigente.
Los códigos estables incluyen `CFDI_LEGAL_ENTITY_MAPPING_MISSING`,
`CFDI_LEGAL_ENTITY_MAPPING_AMBIGUOUS`, `CFDI_LEGAL_ENTITY_INACTIVE`,
`CFDI_LEGAL_ENTITY_DISABLED`, `CFDI_LEGAL_ENTITY_FISCAL_PROFILE_INCOMPLETE`,
`CFDI_LEGAL_ENTITY_CERTIFICATE_EXPIRED` y
`CFDI_LEGAL_ENTITY_CERTIFICATE_NOT_YET_VALID`.

## POST /api/billing/requests/:id/issue-cfdi

Crea o reproduce la única raíz `Invoice` nativa y su primer intento `STAMP`
para una solicitud aprobada.

Roles: `ADMIN`, `BILLING`. Header requerido: `Idempotency-Key`.

Body:

```json
{
  "expectedVersion": 3,
  "cfdiUse": "G03",
  "paymentMethod": "PUE",
  "paymentForm": "01",
  "exportCode": "01",
  "tipoCambio": "1.000000",
  "globalInformation": {
    "periodicity": "04",
    "months": "08",
    "year": 2026
  },
  "substitutesInvoiceId": "invoice-original-1"
}
```

El request contiene únicamente decisiones fiscales permitidas. `tipoCambio`
se omite para MXN y es obligatorio para moneda extranjera. El backend deriva
emisor, receptor, conceptos, impuestos, totales, serie, folio y proveedor desde
registros canónicos. `substitutesInvoiceId` es una referencia server-owned
opcional al CFDI de Ingreso original; el backend bloquea y resuelve su UUID,
entidad legal y relación fiscal `04`. No se acepta `UUID`, `TipoRelacion` ni
un arreglo `relationships` desde el cliente. UUID, TFD, sellos, certificados,
estado PAC, importes y referencias de proveedor se rechazan como entrada.

`globalInformation` es opcional y su presencia declara explícitamente un CFDI
global; no se infiere desde el RFC del cliente. Sus claves son catálogos
cerrados y el backend las contrasta con las fechas operativas server-owned de
las ventas. Cuando existe, exige receptor `XAXX010101000`, nombre `PUBLICO EN
GENERAL`, régimen `616`, UsoCFDI `S01`, código postal igual a
`ExpeditionPlace`, `MetodoPago=PUE` y `Exportacion=01`. Sin ese bloque, el RFC
genérico nacional se rechaza y una factura nominativa no genera
`GlobalInformation`.

Cuando existe `substitutesInvoiceId`, el snapshot del nuevo CFDI contiene
exactamente `relationships=[{ typeCode: "04", relatedInvoiceId,
relatedUuid }]`. El nuevo CFDI debe quedar `STAMPED` antes de solicitar la
cancelación del original con motivo `01`; una solicitud de cancelación con un
sustituto inexistente, no timbrado, sin UUID o sin esa relación exacta se
rechaza antes de llamar al PAC.

La preparación serializable persiste `Invoice`, snapshot, conceptos,
aplicaciones y un intento `PROCESSING`; después confirma la transacción y llama
al proveedor. La finalización usa otra transacción corta. Un replay idéntico
devuelve la misma raíz sin otro POST al PAC; la misma clave con payload distinto
devuelve `IDEMPOTENCY_CONFLICT`.

Respuesta mínima:

```json
{
  "attemptId": "string",
  "billingRequestId": "string",
  "operationStatus": "SUCCEEDED",
  "fiscalStatus": "STAMPED",
  "invoiceId": "string",
  "uuid": "string | null",
  "replayed": false
}
```

Un timeout, 5xx o respuesta incompleta deja `fiscalStatus=UNKNOWN` y
`operationStatus=UNKNOWN`; conserva las aplicaciones como reserva y jamás
reenvía `STAMP` automáticamente. Un 4xx definitivo deja `FAILED`/
`TERMINAL_FAILURE` y revierte lógicamente las aplicaciones de reserva.

Rechaza solicitudes distintas de `APPROVED`, versiones obsoletas, perfiles
fiscales incompletos, productos sin claves fiscales, documentos incompatibles,
saldos consumidos y cualquier raíz nativa de emisión previa.

## GET /api/cfdi/operations/:attemptId

Permiso: `cfdi.read`.

Devuelve estado normalizado, timestamps, `invoiceId`,
códigos de error seguros, número de intentos y próxima reconciliación. Nunca
expone credenciales, headers de autorización o payloads PAC sin redacción.

## POST /api/cfdi/operations/:attemptId/reconcile

Permiso: `cfdi.reconcile`. Header requerido: `Idempotency-Key`.

Body:

```json
{
  "expectedVersion": 2
}
```

Programa o ejecuta reconciliación de proveedor para operaciones `UNKNOWN` o
`PROCESSING` recuperables. Nunca reenvía emisión salvo que una reconciliación
anterior demuestre de forma definitiva que no se emitió y la operación vuelva a
`RETRYABLE_FAILURE`.

## Ruta de lectura fiscal canónica

La lectura pública no crea una segunda fuente bajo `/api/cfdi/**`; se
canoniza en las rutas `/api/billing/invoices` descritas abajo. Cualquier
referencia histórica a `GET /api/cfdi/invoices/:invoiceId` debe migrarse a
`GET /api/billing/invoices/:invoiceId`.

## Lectura fiscal e historial

Las rutas de lectura canónicas son:

- `GET /api/billing/invoices`
- `GET /api/billing/invoices/:invoiceId`
- `GET /api/billing/invoices/:invoiceId/status`

Requieren rol `ADMIN` o `BILLING`. `SELLER`, `COLLECTIONS`, `WAREHOUSE` y
`DRIVER` no tienen acceso al historial o detalle fiscal; sus alcances
explícitos se limitan a la descarga de artefactos documentada abajo.

La lista acepta paginación `page`/`limit` (máximo 100) y filtros `dateFrom`,
`dateTo`, `customerId`, `taxId`, `uuid`, `series`, `folio`, `fiscalStatus`,
`legalEntityId`, `locationId` y `cfdiType`. Las fechas civiles usan
`APP_TIMEZONE`; para legacy sin `issuedAt` se usa `createdAt` únicamente como
fecha de consulta. El RFC de una factura nativa se filtra por
`receiverSnapshot`; las facturas legacy sin snapshot pueden seleccionarse por
su relación histórica disponible, pero la respuesta nunca reconstruye el
receptor desde `Customer`.

La lista devuelve un resumen paginado con totales como strings decimales,
snapshots de emisor/receptor cuando existen, relaciones `SaleDocument`,
disponibilidad de artefactos y cancelación. El detalle devuelve además
`InvoiceConcept[]`, impuestos por concepto, aplicaciones por documento/partida,
metadatos CFDI server-owned, intentos fiscales y auditoría resumida. Nunca
consulta `Customer` o `Product` para reconstruir una factura histórica, ni
expone `storageKey`.

El endpoint `status` devuelve el estado fiscal/cancelación, UUID, fechas,
último error, último intento y disponibilidad de artefactos sin cargar
conceptos. Una factura legacy con snapshots ausentes se devuelve con
`snapshotAvailable=false`; no se infieren datos fiscales faltantes.

## GET /api/billing/invoices/:invoiceId/xml

Roles: `ADMIN`, `BILLING`, `SELLER` con venta propia o `COLLECTIONS` con cuenta
por cobrar visible.

Devuelve una URL firmada temporal para el XML autoritativo únicamente cuando el
artefacto está `AVAILABLE`, su SHA-256 y tamaño están persistidos y el bucket
privado está configurado. Nunca devuelve `storageKey`.

## GET /api/billing/invoices/:invoiceId/pdf

Usa las mismas reglas de RBAC, ownership/scope, bucket privado, hash y URL
firmada que el endpoint XML.

Si una factura `STAMPED` no tiene XML/PDF disponible, responde
`FISCAL_ARTIFACT_MISSING` como inconsistencia recuperable; no cambia el estado
fiscal ni vuelve a timbrar.

## POST /api/billing/invoices/:invoiceId/cancel

Roles: `ADMIN`, `BILLING`. Header requerido: `Idempotency-Key`.

Body:

```json
{
  "expectedVersion": 4,
  "cancellationMotiveCode": "02",
  "internalReason": "Corrección solicitada por el cliente",
  "replacementInvoiceId": null
}
```

`cancellationMotiveCode` acepta exclusivamente `01`, `02`, `03` o `04`.
`replacementInvoiceId` se permite y exige solo para `01`; debe identificar un
CFDI distinto, activo, previamente `STAMPED`, con UUID, la misma entidad legal
y una relación fiscal persistida exactamente como `TipoRelacion=04` hacia el
CFDI cancelado. El backend resuelve `replacementUuid`. UUID
original/sustituto, relaciones fiscales arbitrarias, referencias PAC, estados
fiscales y acuses no se aceptan en el request.

El comando reserva `CANCEL_REQUESTED` en una transacción serializable y llama
al proveedor fuera de locks PostgreSQL. La respuesta devuelve la factura con
`cancellationStatus`: `PENDING`, `ACCEPTED`, `REJECTED` o `UNKNOWN`. `status`
permanece `ACTIVE` en pending, rechazo o timeout; solo una respuesta fiscal
`CANCELLED` confirmada produce `status=CANCELLED` y revierte las aplicaciones
que liberan saldo facturable. Un replay idéntico no llama de nuevo al proveedor;
payload distinto con la misma clave devuelve `IDEMPOTENCY_CONFLICT`.

## GET /api/billing/invoices/:invoiceId/cancellation

Roles: `ADMIN`, `BILLING`.

Devuelve el estado de reconciliación de la cancelación sin reconstruir datos
desde `Customer` o `Product`:

```json
{
  "invoiceId": "invoice-1",
  "uuid": "215CEC43-7E57-44AC-9D63-B54BBC4745BD",
  "state": "PENDING",
  "cancellationStatus": "PENDING",
  "cancellationMotiveCode": "02",
  "internalReason": "Corrección solicitada por el cliente",
  "replacementInvoiceId": null,
  "replacementUuid": null,
  "nextRetryAt": "2026-08-23T12:03:00.000Z",
  "latestOperation": { "operation": "STATUS", "status": "SUCCEEDED" },
  "acknowledgment": null,
  "audit": []
}
```

`state` es `NOT_REQUESTED`, `PENDING`, `CANCELLED`, `REJECTED` o `ERROR`.
`acknowledgment` solo se informa cuando existe un `CANCELLATION_ACK` en
ObjectStorage con metadata íntegra; nunca se expone `storageKey`. El endpoint
es una lectura manual/operativa: el navegador no mantiene polling agresivo y el
estado autoritativo lo actualiza `CancellationStatusJob` en PostgreSQL.

El job corre cada cinco minutos en lotes de 50 bajo advisory lock PostgreSQL,
consulta `CANCEL_REQUESTED`/`CANCEL_PENDING_ACCEPTANCE` persistidos como
`cancellationStatus=PENDING` y los `UNKNOWN` producidos por timeout antes de
conocer la respuesta, y registra intentos `STATUS`. Timeout o 5xx usa
backoff y `CFDI_MAX_RETRIES`; nunca vuelve a enviar `cancel`. Al confirmar
`CANCELLED`, revierte aplicaciones y libera saldo en la transacción fiscal; un
acuse del proveedor se persiste como `FiscalArtifact`.

## Implementado CFDI-17: REP 2.0 por Payment

La ruta anterior basada en `:invoiceId` queda retirada del diseño porque un
`Payment` puede corresponder a una venta facturada por varios UUID. La entrada
correcta es el pago. La preparación fiscal es transaccional y la llamada al
PAC ocurre fuera de la transacción PostgreSQL.

### GET /api/billing/payments/:paymentId/rep-preview (futuro)

Propósito: mostrar elegibilidad y la distribución fiscal calculada sin reservar
ni emitir.

Permisos: `ADMIN`, `BILLING`; `COLLECTIONS` solo lectura.

Respuesta:

- `payment`: id, estado, fecha, fecha límite REP, monto, moneda, forma fiscal y
  versión;
- `eligible`, `blockingCodes`;
- `relatedInvoices[]`: invoiceId, UUID, serie/folio, moneda,
  `installmentNumber`, `previousBalance`, `amountPaid`, `remainingBalance`,
  objeto de impuesto e impuestos derivados;
- `unallocatedAmount` y hash de preview.

La preview no es una reserva y debe recalcularse durante la emisión. Este
endpoint queda reservado; CFDI-17 recalcula server-side durante `issue-cfdi`.

### POST /api/billing/payments/:paymentId/issue-cfdi

Propósito: reservar y emitir un CFDI de Pago con Complemento de Recepción de
Pagos 2.0.

Permisos: `ADMIN`, `BILLING`.

Headers obligatorios:

- `Idempotency-Key`;
- autenticación JWT.

Body permitido:

```json
{
  "expectedVersion": 4
}
```

El backend vuelve a resolver y bloquear `Payment`, cuenta por cobrar, facturas
PPD y aplicaciones. No acepta factura única, UUID, parcialidad, saldos,
importe aplicado, impuestos, TFD, sellos, certificado, estado PAC ni total.

La respuesta contiene el `Invoice` tipo `P`, `PaymentReceipt`, intento fiscal y
estado (`STAMPING`, `STAMPED`, `UNKNOWN` o `FAILED`). Un replay de la misma
clave devuelve el estado persistido sin otra llamada al PAC. Importes se
serializan como strings decimales.

### GET /api/billing/payments/:paymentId/payment-receipts (futuro)

Propósito futuro: consultar REP vigente/histórico, sustituciones, aplicaciones,
cancelación y artefactos del pago sin reconstruirlos desde datos actuales.

Permisos: `ADMIN`, `BILLING`; `COLLECTIONS` solo lectura fiscal acotada, sin
sellos, XML sensible ni auditoría restringida.

### Reglas API REP

- solo `Payment.status=APPLIED` es elegible;
- una emisión ordinaria abierta por pago; sustitución solo contra el REP
  identificado por backend;
- un pago puede producir varios `DoctoRelacionado` y debe distribuirse por
  completo;
- `UNKNOWN` conserva la reserva, se reconcilia por `FiscalOperationAttempt` y
  nunca provoca otro `stamp`;
- `ObjetoImpDR=02` requiere snapshot fiscal de impuestos y lo envía como
  `Taxes` derivado server-side; el request no puede proporcionar impuestos;
- cancelar REP usa el endpoint de cancelación de `Invoice` existente y solo la
  confirmación fiscal revierte aplicaciones;
- cobranza de ruta, pago parcial, liquidación y segunda vuelta no cambian el
  contrato: todos parten del mismo `Payment`.

## CFDI-18: ajustes comerciales y notas de crédito

### POST /api/billing/credit-adjustments

Crea una operación comercial `DRAFT`; no emite CFDI. Requiere `ADMIN` o
`BILLING` e `Idempotency-Key`.

Body:

```json
{
  "sourceType": "BONUS",
  "sourceReference": "optional-business-reference",
  "internalReason": "Commercial authorization context",
  "paymentFormCode": "03",
  "applications": [
    {
      "invoiceId": "invoice-id",
      "lines": [
        {
          "invoiceConceptId": "concept-id",
          "creditTotal": "116.00"
        }
      ]
    }
  ]
}
```

No acepta UUID, `TipoRelacion`, subtotal, impuestos, TFD, sellos, certificado,
estado PAC ni datos de inventario. `APPROVED_RETURN` exige una referencia de
trazabilidad; no consulta ni modifica `DeliveryIncident` o inventario.

### GET /api/billing/credit-adjustments/:id

Devuelve estado, versión, fuente, autorización, facturas/UUID relacionados,
conceptos acreditados, importes decimales como strings e `Invoice EXPENSE`
cuando existe.

### POST /api/billing/credit-adjustments/:id/approve

Body `{ "expectedVersion": 1 }`. Recalcula y reserva el saldo acreditable bajo
locks ordenados. Registra `authorizedByUserId`, `authorizedAt` y auditoría.

### POST /api/billing/credit-adjustments/:id/issue-cfdi

Requiere `Idempotency-Key` y body `{ "expectedVersion": 2 }`. Solo admite
`APPROVED`. Crea `Invoice(cfdiType=EXPENSE)`, snapshot e intento fiscal antes de
llamar al PAC fuera de la transacción. Replay idéntico no llama otra vez al PAC;
payload distinto responde conflicto. Timeout devuelve `UNKNOWN` y conserva la
reserva para reconciliación.

La relación SAT se deriva: `03` para `APPROVED_RETURN`; `01` para `BONUS`,
`POST_SALE_DISCOUNT` y `COMMERCIAL_ADJUSTMENT`. El CFDI E usa `G02`, `PUE` y
los conceptos fiscales prorrateados desde los snapshots originales.

## Errores estables

- `BILLING_REQUEST_NOT_APPROVED`
- `CFDI_OPERATION_ALREADY_EXISTS`
- `CFDI_OPERATION_OUTCOME_UNKNOWN`
- `CFDI_SOURCE_VERSION_CONFLICT`
- `CFDI_FISCAL_PROFILE_INCOMPLETE`
- `CFDI_LEGAL_ENTITY_FISCAL_PROFILE_INCOMPLETE`
- `REP_TAX_SNAPSHOT_MISSING`
- `REP_TAX_SNAPSHOT_INVALID`
- `CFDI_LEGAL_ENTITY_MAPPING_MISSING`
- `CFDI_LEGAL_ENTITY_MAPPING_AMBIGUOUS`
- `CFDI_LEGAL_ENTITY_INACTIVE`
- `CFDI_LEGAL_ENTITY_DISABLED`
- `CFDI_LEGAL_ENTITY_CERTIFICATE_EXPIRED`
- `CFDI_LEGAL_ENTITY_CERTIFICATE_NOT_YET_VALID`
- `CFDI_PRODUCT_PROFILE_INCOMPLETE`
- `CFDI_PROVIDER_BINDING_MISSING`
- `CFDI_PROVIDER_REJECTED`
- `CFDI_PROVIDER_UNAVAILABLE`
- `CFDI_RECONCILIATION_PROVIDER_REFERENCE_MISSING`
- `CFDI_RECONCILIATION_STATUS_UNAVAILABLE`
- `CFDI_RECONCILIATION_STATUS_INDETERMINATE`
- `CFDI_RECONCILIATION_XML_UNAVAILABLE`
- `CFDI_RECONCILIATION_TFD_INCOMPLETE`
- `CFDI_RECONCILIATION_UUID_MISMATCH`
- `CFDI_RECONCILIATION_PERSISTENCE_FAILED`
- `CFDI_RECONCILIATION_STATE_CONFLICT`
- `CFDI_RECONCILIATION_FAILED`
- `CFDI_ARTIFACT_NOT_AVAILABLE`
- `CFDI_INVOICE_READ_FORBIDDEN`
- `INVOICE_NOT_FOUND`
- `IDEMPOTENCY_CONFLICT`
- `VERSION_CONFLICT`
- `INVALID_CANCELLATION_MOTIVE`
- `CANCELLATION_REPLACEMENT_REQUIRED`
- `REPLACEMENT_ONLY_FOR_MOTIVE_01`
- `INVALID_REPLACEMENT_INVOICE`
- `INVALID_REPLACEMENT_ORDER`
- `CANCELLATION_IN_PROGRESS`
- `CANCELLATION_PROVIDER_REFERENCE_MISSING`
- `CANCELLATION_STATE_CONFLICT`
- `SAT_CATALOG_NOT_SUPPORTED`
- `SAT_CATALOG_VERSION_NOT_FOUND`
- `SAT_CATALOG_SOURCE_VERSION_REQUIRED`
- `SAT_CATALOG_DUPLICATE_CODE`
- `SAT_CATALOG_DATE_RANGE_INVALID`
- `SAT_CATALOG_CHECKSUM_MISMATCH`
- `SAT_CATALOG_VERSION_CONFLICT`
- `SAT_CATALOG_VERSION_NOT_STAGING`
- `SAT_CATALOG_VERSION_NOT_VALIDATED`
- `SAT_CATALOG_NOT_CONFIGURED`
- `SAT_CATALOG_CODE_NOT_FOUND`
- `REP_PAYMENT_NOT_APPLIED`
- `REP_PAYMENT_ALREADY_CANCELLED`
- `REP_PAYMENT_FISCAL_FORM_MISSING`
- `REP_PAYMENT_CURRENCY_MISSING`
- `REP_INVOICE_NOT_ELIGIBLE`
- `REP_UNALLOCATED_PAYMENT_AMOUNT`
- `REP_OUT_OF_ORDER_PAYMENT`
- `REP_ALREADY_RESERVED`
- `REP_APPLICATION_CHAIN_INCONSISTENT`
- `REP_DEPENDENT_APPLICATION_EXISTS`
- `REP_PREVIEW_STALE`
- `CREDIT_ADJUSTMENT_NOT_FOUND`
- `CREDIT_ADJUSTMENT_NOT_APPROVED`
- `CREDIT_ADJUSTMENT_SOURCE_REFERENCE_REQUIRED`
- `CREDIT_NOTE_ORIGINAL_INVOICE_NOT_STAMPED`
- `CREDIT_NOTE_ORIGINAL_INVOICE_CANCELLED`
- `CREDIT_NOTE_MIXED_PARTIES`
- `CREDIT_NOTE_CONCEPT_NOT_FOUND`
- `CREDIT_NOTE_TAX_SNAPSHOT_MISSING`
- `CREDIT_NOTE_OVER_CREDITED`
- `CREDIT_NOTE_ALREADY_ISSUED`

Los mensajes PAC pueden conservarse en auditoría restringida, pero deben
normalizarse antes de responder al cliente.

## Compatibilidad legacy

- `POST /api/billing/requests/:id/link-invoice` permanece temporalmente como
  conciliación externa y nunca crea CFDI nativo.
- `POST /api/billing/invoices/:id/cancel` conserva su URI, idempotencia,
  `expectedVersion`, locking y auditoría, pero para `NATIVE_CFDI` aplica la
  semántica fiscal CFDI-13. Facturas legacy sin identidad PAC no se presentan
  como canceladas fiscalmente.
- Emisión, lectura, artefactos y cancelación usan las rutas canónicas bajo
  `/api/billing/**`; `/api/cfdi/**` queda para operaciones técnicas explícitas.
