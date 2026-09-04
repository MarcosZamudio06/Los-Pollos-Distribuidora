# Especificación de módulo — CFDI 4.0 nativo

## Decisión canónica

El ERP emitirá CFDI 4.0 mediante un contexto fiscal delimitado y neutral al
proveedor. El primer adapter será Facturama. Un adapter futuro para Finkok
implementará el mismo `FiscalProviderPort` sin cambiar entidades de dominio,
API pública, snapshots ni máquinas de estado.

El primer documento fiscal implementado fue CFDI de Ingreso y CFDI-13 habilitó
su cancelación fiscal confirmada. CFDI-16 canonizó la arquitectura del
Complemento para Recepción de Pagos 2.0 y CFDI-17 habilita su emisión inicial
por `Payment`. CFDI-18 habilita Egreso exclusivamente desde un ajuste comercial
explícito y autorizado. Traslado/Carta Porte, nómina y comercio exterior
permanecen fuera hasta que un caso fiscal aprobado modifique este spec.

La persistencia fiscal definida en CFDI-04 ya existe en Prisma y PostgreSQL.
CFDI-08 habilita la emisión únicamente desde `BillingRequest.APPROVED`; la
publicación de XML/PDF se gobierna por este mismo contexto y no altera ventas,
pagos o inventario.

## Fronteras de dominio

- `Sale` sigue siendo la transacción comercial y la única raíz de creación de
  ventas.
- `SaleDocument` sigue siendo el documento comercial interno y la unidad
  facturable.
- `BillingRequest` sigue siendo la solicitud administrativa. `APPROVED` es
  el único estado de entrada a emisión nativa, pero aprobar no emite por sí
  mismo un CFDI.
- `Invoice` permanece separada y es la raíz persistida tanto de una factura
  externa legacy como del ciclo de vida de un CFDI nativo. Una fila nativa
  anterior al timbrado no representa un CFDI emitido: solo adquiere esa
  semántica cuando `fiscalStatus=STAMPED` y existe UUID validado.
- `Payment` y `AccountReceivable` siguen siendo las fuentes monetaria y de
  cobranza. La emisión inicial no crea ni modifica ninguna.
- `InvoiceSaleDocument` e `InvoiceSaleItemApplication` son las únicas
  relaciones entre factura y documentos/partidas origen.
- Ningún comando fiscal llama mutaciones de Ventas, Inventario o Pagos ni crea
  un `InventoryMovement`.
- No se introduce `PaymentAllocation`. REP 2.0 referencia los registros
  `Payment` existentes mediante `PaymentReceiptDetail` y
  `PaymentInvoiceApplication`, estructuras exclusivamente fiscales que no
  registran ni redistribuyen dinero.

Cadena canónica:

```text
BillingRequest APPROVED
  -> Invoice NATIVE_CFDI + snapshots inmutables
  -> InvoiceConcept[]
  -> FiscalOperationAttempt STAMP
  -> FiscalProviderPort
  -> resultado confirmado del proveedor
  -> Invoice STAMPED + aplicaciones existentes
  -> artefactos privados en ObjectStorage
```

## CFDI E — crédito y bonificación autorizados (CFDI-18)

`CreditAdjustment` es la operación comercial explícita que autoriza un crédito,
bonificación, descuento posterior o ajuste comercial. Permanece separada de
`Invoice`: una `Invoice(origin=NATIVE_CFDI, cfdiType=EXPENSE)` es únicamente la
raíz fiscal creada al emitir un ajuste previamente `APPROVED`.

Crear o resolver `DeliveryIncident`, devolver inventario o insertar
`InventoryMovement` nunca crea, aprueba ni emite un `CreditAdjustment`. Una
devolución aprobada puede conservarse como `sourceType=APPROVED_RETURN` y una
referencia opaca de trazabilidad, pero la autorización fiscal continúa siendo
la transición explícita del ajuste.

```text
CreditAdjustment DRAFT
  -> CreditAdjustmentInvoice[] (Invoice INCOME + UUID snapshot + TipoRelacion)
     -> CreditAdjustmentLine[] (InvoiceConcept + importe solicitado)
  -> APPROVED (reserva saldo acreditable)
  -> Invoice EXPENSE + snapshot fiscal inmutable
  -> FiscalOperationAttempt STAMP
  -> FiscalProviderPort
  -> STAMPED/UNKNOWN/FAILED + artifacts/audit
```

Fuentes permitidas: `APPROVED_RETURN`, `BONUS`, `POST_SALE_DISCOUNT` y
`COMMERCIAL_ADJUSTMENT`. La relación SAT se deriva server-side: `03` para una
devolución aprobada y `01` para los demás créditos, descuentos o bonificaciones.
El request no acepta UUID, tipo de relación libre, totales fiscales, sellos,
TFD, certificado ni estado PAC.

Cada origen debe ser `Invoice` nativa de Ingreso, `STAMPED`, `ACTIVE`, sin
cancelación solicitada y con UUID. Todas las facturas origen deben compartir
entidad legal, receptor, moneda y tipo de cambio. El CFDI E usa los snapshots
inmutables del emisor, receptor y `InvoiceConcept`; no reconstruye historia
desde `Customer` o `Product` actuales. Usa `UsoCFDI=G02`, `MetodoPago=PUE`,
`Exportacion=01` y una `FormaPago` SAT explícita del ajuste.

El importe solicitado por línea es el total acreditado, impuestos incluidos.
El builder prorratea con `Prisma.Decimal` subtotal, descuento, base e impuestos
del concepto original y conserva las ecuaciones fiscales. Para cada concepto y
factura, el saldo acreditable es el importe original menos ajustes en estados
que reservan (`APPROVED`, `ISSUING`, `UNKNOWN`, `ISSUED` o `ISSUE_ERROR`).
`DRAFT`, `REJECTED` y un CFDI E cancelado confirmado no consumen saldo.

La aprobación bloquea facturas y conceptos en orden estable dentro de una
transacción `Serializable`, vuelve a calcular el saldo y persiste el snapshot.
La emisión reserva una sola `Invoice EXPENSE` y un intento `STAMP`; la llamada
PAC ocurre fuera de la transacción. Timeout o resultado ambiguo produce
`UNKNOWN`, conserva saldo y jamás reenvía `stamp` automáticamente. Dos
aprobaciones o emisiones concurrentes no pueden superar el importe original ni
crear más de una operación efectiva por ajuste.

La API canónica es:

- `POST /api/billing/credit-adjustments`;
- `GET /api/billing/credit-adjustments/:id`;
- `POST /api/billing/credit-adjustments/:id/approve`;
- `POST /api/billing/credit-adjustments/:id/issue-cfdi`.

`ADMIN` y `BILLING` pueden crear, aprobar y emitir según RBAC existente. Toda
aprobación registra actor, fecha, versión y auditoría. La UI mínima se integra
al detalle fiscal existente y nunca ofrece acciones desde pantallas de
inventario o incidencias.

## Arquitectura REP 2.0 (CFDI-16)

### Decisión

`Invoice` continúa como la única raíz fiscal persistida. Un REP es una
`Invoice(origin=NATIVE_CFDI, cfdiType=PAYMENT_RECEIPT)` con UUID, estado,
intentos, cancelación y artefactos comunes; no se crea otra raíz llamada
recibo. El complemento se modela como una extensión propiedad de esa factura:

```text
Invoice PAYMENT_RECEIPT
  -> PaymentReceipt (Pagos 2.0 + Totales)
     -> PaymentReceiptDetail[] (Pago; primera implementación: uno)
        -> Payment (fuente económica, solo referencia)
        -> PaymentInvoiceApplication[] (DoctoRelacionado)
           -> Invoice INCOME STAMPED/PPD
```

`PaymentReceipt` no es una segunda fuente de dinero. Sus importes son snapshots
fiscales derivados y jamás participan en caja, cartera, liquidación de ruta,
reportes de ingresos ni `AccountReceivable.outstandingAmount`. Esos cálculos
continúan usando exclusivamente `Payment.amount` con `status=APPLIED`.

La primera implementación emitirá un REP por `Payment`. El modelo permite
varios `PaymentReceiptDetail` por `PaymentReceipt` para una futura agrupación
mensual del mismo receptor, pero esa agrupación no se habilita sin una tarea y
pruebas específicas.

### PUE, PPD y obligación de REP

| Caso                                                    | CFDI de Ingreso                   | REP                                                                                       |
| ------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| Contraprestación completamente pagada antes o al emitir | `MetodoPago=PUE` y FormaPago real | No se emite                                                                               |
| Primer abono al momento de la operación y queda saldo   | `MetodoPago=PPD`, `FormaPago=99`  | Se emite por el abono                                                                     |
| Pago total o parcial posterior a la emisión             | `MetodoPago=PPD`, `FormaPago=99`  | Se emite por cada pago o agrupación futura autorizada                                     |
| CFDI de Ingreso `PUE` pagado después                    | Inconsistencia fiscal             | No se corrige emitiendo REP; requiere cancelación/reexpedición conforme a política fiscal |

### CFDI global de operaciones con público en general

La factura nominativa y el CFDI global son intenciones fiscales distintas. La
emisión global se declara explícitamente mediante `globalInformation`; nunca se
infiere solo porque `Customer.taxId=XAXX010101000`. La ausencia del bloque
identifica una factura nominativa y bloquea ese RFC genérico con
`GLOBAL_INVOICE_INFORMATION_REQUIRED`.

`globalInformation` contiene únicamente claves controladas `periodicity`
(`01` diario, `02` semanal, `03` quincenal, `04` mensual o `05` bimestral),
`months` (`01`-`12`, o `13`-`18` exclusivamente para periodicidad `05`) y un
`year` entero. El año debe coincidir con el año de emisión o alguno de los cinco
ejercicios anteriores. El backend valida el periodo contra la fecha operativa
server-owned de cada venta: usa `Sale.businessDate` y solo cuando no existe usa
`registeredAt` o `createdAt` convertidos a `APP_TIMEZONE`. Diario exige una
misma fecha, semanal una misma semana iniciada en lunes, quincenal una misma
mitad del mes, mensual un mismo mes y bimestral el par indicado.

Un snapshot global exige simultáneamente receptor `XAXX010101000`, nombre
`PUBLICO EN GENERAL`, régimen `616`, UsoCFDI `S01`, código postal igual al lugar
de expedición del emisor, `MetodoPago=PUE` y `Exportacion=01`. Su
`globalInformationSnapshot` se persiste como evidencia fiscal inmutable. Una
factura nominativa conserva el perfil fiscal real del cliente y omite por
completo `globalInformation`.

Solo un `Payment.status=APPLIED` habilita la preparación de REP. `REGISTERED`
no representa dinero aplicado y `CANCELLED` no puede reflejarse fiscalmente. Un
`Payment` ya incluido en un REP reservado, `UNKNOWN`, `STAMPED` o con
cancelación pendiente no admite otra emisión ordinaria.

Para PPD, cada pago aplicado abre obligación REP y `repDueAt` se deriva de
`Payment.paidAt` como el quinto día natural del mes inmediato siguiente en
`APP_TIMEZONE`. El vencimiento genera alerta/remediación, pero nunca cambia la
fecha real del pago ni autoriza timbrado duplicado.

El REP raíz usa `TipoDeComprobante=P`, moneda `XXX`, subtotal y total `0`, sin
FormaPago ni MetodoPago en el comprobante. Conserva el concepto fijo exigido
por el estándar dentro de `InvoiceConcept`; la forma, moneda, fecha y monto del
pago viven en `PaymentReceiptDetail`.

El snapshot raíz valida los valores oficiales de Pago: `Exportacion=01`,
`UsoCFDI=CP01`, concepto `ClaveProdServ=84111506`, `Cantidad=1`,
`ClaveUnidad=ACT`, descripción `Pago`, valor unitario/importe `0` y
`ObjetoImp=01`. No se toman de `Product` ni son editables. Antes de habilitar
REP, CFDI-15 deberá incorporar `c_TipoRelacion` al catálogo versionado para la
relación `04` de sustitución; ningún código se agrega como free text.

### Sustitución de CFDI de Ingreso (motivo SAT `01`)

La sustitución nativa usa una referencia server-owned opcional
`substitutesInvoiceId` en `POST /api/billing/requests/:id/issue-cfdi`. El
backend bloquea el CFDI original, exige que exista, esté `ACTIVE/STAMPED`,
tenga UUID válido, no tenga otra sustitución reservada y pertenezca a la
misma `LegalEntity` que el nuevo CFDI. El cliente nunca envía UUID ni
`TipoRelacion`.

La preparación persiste en el snapshot del nuevo CFDI una única relación:

```json
{
  "typeCode": "04",
  "relatedInvoiceId": "invoice-original-1",
  "relatedUuid": "UUID-DEL-ORIGINAL"
}
```

La relación se conserva server-side junto con la referencia al original y su
índice único impide dos sustituciones nativas concurrentes del mismo CFDI.
Primero se timbra el nuevo CFDI; solo después de confirmar `STAMPED` y UUID
válido se permite cancelar el original con motivo `01` y
`uuidReplacement=UUID-DEL-NUEVO`. La cancelación rechaza antes del PAC un
sustituto inexistente, no timbrado, sin UUID o sin la relación `04` exacta.
Las relaciones `01` y `03` existentes de notas de crédito no cambian.

`Payment.paymentMethod` es operacional y no basta para todos los códigos SAT.
Antes de implementar se agregará de forma aditiva a `Payment`:

- `currencyCode` y, cuando aplique, tipo de cambio a MXN;
- `fiscalPaymentFormCode`, separado de `PaymentMethod` y validado contra
  `c_FormaPago`;
- metadata bancaria solo cuando el estándar la requiera.

No se infiere una forma SAT ambigua desde `CARD`, `VOUCHER`, `DEPOSIT` u
`OTHER`. Los registros legacy sin una equivalencia verificable se envían a
remediación y no bloquean cobranza, caja o liquidación.

### Relación determinista `Payment -> Invoice`

No existe la cardinalidad `Payment -> Sale -> un UUID`. Una venta o documento
puede estar facturado por varias `Invoice`, y una `Invoice` puede agrupar
documentos de varias ventas compatibles. La relación fiscal autoritativa es
`PaymentInvoiceApplication`.

Para un `Payment`, el backend resuelve exactamente una venta origen desde
`accountReceivable.saleId` o `payment.saleId`; ambas referencias deben coincidir
si existen. Después obtiene todas las facturas elegibles a través de:

```text
Payment
  -> AccountReceivable/Sale
  -> SaleDocument
  -> InvoiceSaleDocument no revertida
  -> Invoice NATIVE_CFDI + INCOME + ACTIVE + STAMPED + PPD
```

Las facturas se bloquean y procesan por `issuedAt`, `uuid`, `id`. Para cada una
se calculan dos límites:

1. **Saldo fiscal del CFDI:** `Invoice.total` menos `ImpPagado` de aplicaciones
   fiscales `EFFECTIVE`.
2. **Capacidad de la venta dentro del CFDI:** suma de
   `InvoiceSaleDocument.totalApplied` de la venta menos aplicaciones fiscales
   `EFFECTIVE` de pagos de esa misma venta.

El importe aplicable es el menor entre el remanente del `Payment`, el saldo
fiscal del CFDI y la capacidad de la venta. El algoritmo continúa sobre la
siguiente factura hasta distribuir exactamente `Payment.amount`; por eso un
pago puede producir varios nodos `DoctoRelacionado`. Si queda importe sin
factura PPD elegible, la emisión se bloquea con
`REP_UNALLOCATED_PAYMENT_AMOUNT`; nunca se crea un REP parcial que oculte parte
del pago.

Por cada factura relacionada:

```text
NumParcialidad   = max(NumParcialidad EFFECTIVE de la factura) + 1
ImpSaldoAnt      = Invoice.total - sum(ImpPagado EFFECTIVE previos)
ImpPagado        = importe asignado en moneda del documento
ImpSaldoInsoluto = ImpSaldoAnt - ImpPagado
```

La sustitución de un REP reutiliza la parcialidad y saldos del REP sustituido;
no incrementa `NumParcialidad`. Los cálculos usan `Prisma.Decimal`, precisión y
redondeo del estándar, y snapshots de moneda/equivalencia. La suma convertida
de las aplicaciones debe coincidir con `PaymentReceiptDetail.amount`; impuestos
`DR`, impuestos `P` y `Totales` se derivan proporcionalmente desde el snapshot
de la factura de Ingreso, nunca desde `Product`, `Sale` o tasas actuales.

Dos pagos que afecten la misma factura se procesan en orden
`Payment.paidAt`, `Payment.id`. Un pago anterior elegible aún no representado
bloquea uno posterior con `REP_OUT_OF_ORDER_PAYMENT`; así la parcialidad y el
saldo anterior no dependen del orden de clicks.

### Persistencia fiscal

`PaymentReceipt` conserva `complementVersion=2.0`, totales en MXN, resumen de
impuestos, hash y timestamps. `PaymentReceiptDetail` conserva referencia al
`Payment`, fecha, forma, moneda, tipo de cambio, monto, número de operación,
fecha límite de emisión, datos bancarios permitidos, impuestos y hash.
`PaymentInvoiceApplication`
conserva la referencia al CFDI de Ingreso y snapshots de UUID, serie/folio,
moneda, equivalencia, `MetodoPagoDR`, `NumParcialidad`, saldos, importe,
`ObjetoImpDR`, impuestos y hash.

También conserva `sourceDocumentsSnapshot` con los
`InvoiceSaleDocument.id`/importes que justificaron la capacidad de esa venta;
es evidencia inmutable, no una nueva aplicación contable.

Los snapshots son insert-only desde que inicia una llamada PAC. Solo cambia el
estado de aplicación:

```text
RESERVED -> EFFECTIVE
RESERVED -> RELEASED
RESERVED -> UNKNOWN
UNKNOWN  -> EFFECTIVE
UNKNOWN  -> RELEASED        (solo inexistencia fiscal confirmada)
EFFECTIVE -> REVERSED       (solo cancelación fiscal confirmada)
```

Una sustitución crea aplicaciones `REPLACEMENT_PENDING` que copian el snapshot
lógico del REP original. Al confirmarse la cancelación del original, la misma
transacción revierte las aplicaciones previas y activa las sustitutas. Si la
cancelación es rechazada o indeterminada, ninguna se cuenta dos veces y se abre
remediación fiscal.

Restricciones PostgreSQL mínimas:

- una `PaymentReceipt` por `Invoice` y una combinación
  `(paymentReceiptId, paymentId)` única;
- una aplicación por `(paymentReceiptDetailId, relatedInvoiceId)`;
- `amount > 0`, `previousBalance >= amount` y
  `remainingBalance = previousBalance - amount`;
- `installmentNumber >= 1`;
- una emisión ordinaria abierta por `Payment`; una sustitución solo puede
  coexistir si referencia exactamente al REP reemplazado;
- UUID relacionado obligatorio e inmutable antes de `STAMPING`;
- índices por `paymentId`, `relatedInvoiceId`, estado y fecha;
- ningún trigger o FK actualiza saldos económicos, ventas o inventario.

### Transacciones, idempotencia y timeout

La preparación REP usa una transacción `Serializable`: bloquea `Payment`,
`AccountReceivable`, facturas de Ingreso y sus aplicaciones en orden estable;
valida `expectedVersion`, replay, elegibilidad y catálogos; crea `Invoice`
`PAYMENT_RECEIPT`, snapshots, aplicaciones `RESERVED` y un
`FiscalOperationAttempt(STAMP, PROCESSING)`. La red PAC ocurre después del
commit.

Éxito cambia la `Invoice` REP a `STAMPED`, las aplicaciones a `EFFECTIVE` y
crea artefactos pendientes en una segunda transacción. Rechazo definitivo
marca `FAILED` y libera solo la reserva fiscal. Timeout o respuesta ambigua
marca `UNKNOWN`, conserva la reserva y prohíbe otro REP; la reconciliación
consulta al proveedor y jamás repite `stamp` automáticamente.

`Idempotency-Key` y hash incluyen `paymentId`, versión esperada, orden de
facturas, importes derivados, snapshot y operación. La misma clave/payload
reproduce el resultado; la misma clave con otro hash produce
`IDEMPOTENCY_CONFLICT`; otra clave sobre el mismo pago reservado produce
`REP_ALREADY_RESERVED`.

### Cancelación, sustitución y dependencias

La cancelación REP reutiliza la máquina fiscal, motivos `01`-`04`,
`expectedVersion`, idempotencia, intentos y confirmación PAC existentes. No
revierte aplicaciones al solicitar cancelación. Solo `CANCELLED` confirmado
cambia `PaymentInvoiceApplication` a `REVERSED`.

Motivo `01` exige otro REP `STAMPED`, del mismo emisor/receptor y pago, con
relación CFDI `04` y UUID resuelto por backend. El UUID original nunca se
sobrescribe. Un REP con aplicaciones posteriores sobre cualquiera de sus
facturas no puede cancelarse ni sustituirse hasta resolver esas dependencias en
orden inverso (`REP_DEPENDENT_APPLICATION_EXISTS`).

No puede cancelarse económicamente un `Payment` mientras exista un REP
`RESERVED`, `UNKNOWN`, `EFFECTIVE` o con cancelación pendiente. Asimismo, un
CFDI de Ingreso PPD no puede cancelarse mientras tenga aplicaciones REP
vigentes. Estas validaciones deberán agregarse a los comandos actuales de
cancelación en la tarea de implementación; CFDI-16 no cambia hoy su
comportamiento.

### Cobranza de ruta, pagos parciales y segunda vuelta

Un cobro de ruta y una segunda vuelta no generan una entidad REP diferente.
Cuando `DeliveryService.registerCollection` crea un `Payment(APPLIED)`, ese
mismo registro es la fuente económica. `routeId`, `routeSettlementId`,
`collectionPass` y `collectedByUserId` se conservan para auditoría interna,
pero no alteran `NumParcialidad` ni crean dinero fiscal adicional.

Pago parcial y liquidación usan el mismo algoritmo: el primero deja
`ImpSaldoInsoluto > 0`; la liquidación deja `0`. El estado de
`AccountReceivable` puede ayudar a detectar inconsistencias, pero los saldos REP
se calculan desde la `Invoice` de Ingreso y las aplicaciones fiscales vigentes,
no desde `AccountReceivable.outstandingAmount`, porque una venta puede estar
facturada en más de una factura.

### API reservada y RBAC

La ruta reservada basada en una sola factura se retira del diseño. La entrada
correcta es el pago:

- `GET /api/billing/payments/:paymentId/rep-preview`;
- `POST /api/billing/payments/:paymentId/issue-cfdi`;
- `GET /api/billing/payments/:paymentId/payment-receipts`.

Emisión y cancelación requieren `ADMIN` o `BILLING`, `Idempotency-Key` y
`expectedVersion`. `COLLECTIONS` puede consultar elegibilidad y relación fiscal
sin emitir, cancelar, enviar UUID o definir saldos. El request no acepta UUID,
TFD, sellos, certificado, `NumParcialidad`, `ImpSaldoAnt`, `ImpPagado`,
`ImpSaldoInsoluto`, impuestos ni totales.

### Compatibilidad y migración futura

CFDI-17 implementa las estructuras REP de forma aditiva y conserva el
comportamiento económico existente. La migración sigue expand-backfill-validate:

1. crear tablas/enum y campos nullable de pago;
2. conservar todos los `Payment`, `AccountReceivable`, `Invoice` y aplicaciones
   actuales sin backfill fiscal inventado;
3. backfillear `MXN` solo donde la moneda de la venta/factura sea inequívoca;
4. no inferir FormaPago SAT ambigua;
5. la emisión admite solo facturas `NATIVE_CFDI`, `INCOME`, `STAMPED`,
   `ACTIVE`, `PPD`; facturas legacy requieren remediación explícita;
6. validar que ningún saldo económico, cierre, ruta, reporte o inventario
   cambió.

Los casos ambiguos usan `BillingDataRemediation` con códigos estables, entre
ellos `REP_PAYMENT_FISCAL_FORM_MISSING`, `REP_PAYMENT_CURRENCY_MISSING`,
`REP_INVOICE_NOT_ELIGIBLE`, `REP_UNALLOCATED_PAYMENT_AMOUNT`,
`REP_OUT_OF_ORDER_PAYMENT`, `REP_APPLICATION_CHAIN_INCONSISTENT`,
`REP_TAX_SNAPSHOT_MISSING` y `REP_TAX_SNAPSHOT_INVALID`.

### Implementación CFDI-17

La emisión real usa `POST /api/billing/payments/:paymentId/issue-cfdi` para
`ADMIN`/`BILLING`. `Payment` se bloquea con `expectedVersion` e
`Idempotency-Key`; la preparación `Serializable` crea `Invoice` tipo
`PAYMENT_RECEIPT`, `PaymentReceipt`, `PaymentReceiptDetail`, aplicaciones
`RESERVED` y un intento `STAMP` antes de llamar al PAC. La llamada HTTP ocurre
fuera del lock de PostgreSQL.

El builder Decimal distribuye el pago completo por `InvoiceSaleDocument` en
orden `issuedAt`, `uuid`, `id`, calcula `NumParcialidad`, `ImpSaldoAnt`,
`ImpPagado` e `ImpSaldoInsoluto`, y rechaza PUE, moneda mixta, exceso,
aplicación duplicada o saldo no asignable. Éxito cambia aplicaciones a
`EFFECTIVE`; timeout o respuesta ambigua deja `Invoice.UNKNOWN` y aplicaciones
`UNKNOWN`, sin segundo timbrado automático. `FiscalArtifactService` conserva
XML/PDF en ObjectStorage. Cuando `taxObjectCode=02`, usa el snapshot fiscal
inmutable de `InvoiceConcept`, prorratea impuestos con `Decimal` al importe
pagado y envía `Taxes` en el documento relacionado y el nodo de pago; la
ausencia del snapshot bloquea la emisión.

La cancelación existente de `Invoice` revierte aplicaciones REP únicamente tras
confirmación fiscal `CANCELLED`; una solicitud pendiente no altera saldos.

## Catálogos SAT versionados

Los códigos fiscales no se capturan como texto libre ni se consultan al SAT en
tiempo real durante una venta. `SatCatalog`, `SatCatalogVersion` y
`SatCatalogEntry` son la fuente operativa versionada para los catálogos
`c_ClaveProdServ`, `c_ClaveUnidad`, `c_RegimenFiscal`, `c_UsoCFDI`,
`c_FormaPago`, `c_MetodoPago`, `c_Impuesto`, `c_TasaOCuota`,
`c_TipoDeComprobante`, `c_Moneda`, `c_MotivoCancelacion`, `c_CodigoPostal` y
`c_ObjetoImp`, `c_Periodicidad`, `c_Meses`, además de `c_TipoRelacion`
requerido por Egreso. Cada entrada conserva `code`, `description`, `validFrom`,
`validTo` y `metadata`; cada versión conserva `sourceVersion`, checksum SHA-256,
conteo, estado y marcas de staging/validación/activación.

El importador ejecuta `STAGING -> VALIDATED -> ACTIVE` dentro de PostgreSQL.
Rechaza códigos duplicados, rangos de vigencia inválidos, metadatos no JSON y
checksums divergentes. Activar una versión retira la anterior y actualiza el
puntero activo en una sola transacción; la caché de lectura se invalida después
del commit. Versiones activas nunca se editan: una actualización siempre crea
una nueva versión y conserva la anterior como `RETIRED`.

No se incluyen filas SAT inventadas en migraciones o seeds. La actualización
operativa requiere descargar el archivo oficial vigente, conservar su nombre y
versión de fuente, normalizarlo al contrato de importación, calcular y revisar
el checksum, ejecutar staging/validación en un entorno controlado y activar solo
tras aprobación fiscal. Si la fuente oficial cambia de formato, se adapta el
parser antes de importar; no se rellena el catálogo con heurísticas.

La API de solo lectura es `GET /api/cfdi/catalogs` y
`GET /api/cfdi/catalogs/:key`, con filtro opcional por código/fecha y límite
acotado. Requiere `ADMIN` o `BILLING`, devuelve la versión activa y aplica una
caché privada de cinco minutos. Un catálogo soportado sin versión activa se
devuelve como `configured=false` y entradas vacías para no inventar valores.
Frontend usa esta API cuando existe una versión activa; los snapshots
compatibles existentes solo mantienen selects controlados mientras el entorno
no haya importado su primera versión y no sustituyen la validación fiscal
server-owned.

Para CFDI 4.0, `c_UsoCFDI` no se valida únicamente por existencia. Cada entrada
de `c_UsoCFDI` conserva en `metadata` la clasificación explícita de persona
física/moral y la lista de códigos de `RégimenFiscalReceptor` permitidos. Las
entradas de `c_RegimenFiscal` conservan la misma clasificación y ambos catálogos
conservan `validFrom`/`validTo`. `isCfdiUseCompatible` exige simultáneamente la
existencia, vigencia, tipo de persona y relación de régimen indicada por SAT.

Cuando existe una versión activa de `c_UsoCFDI` y `c_RegimenFiscal`, esos
metadatos versionados son autoritativos para la emisión; si falta cualquiera de
los dos catálogos o la metadata de compatibilidad es inválida, la operación se
bloquea y no usa el fallback. Sin una versión importada, el ERP usa únicamente
la proyección estática revisada de `shared/fiscal-catalog.ts`. La fuente de esa
proyección es el archivo oficial SAT `catCFDI_V_4_20260821.xls`; no se permiten
asociaciones obtenidas de blogs ni matrices parciales.

El tipo de persona se deriva del RFC ordinario (12 caracteres: moral; 13:
física). `XAXX010101000` y `XEXX010101000` se tratan como RFC genéricos y
requieren `RégimenFiscalReceptor=616` y `UsoCFDI=S01`; XAXX además requiere el
bloque explícito de factura global descrito arriba. La compatibilidad se valida
antes de persistir snapshots, reservar folio o crear `FiscalOperationAttempt`.
Una incompatibilidad produce `CFDI_USE_REGIME_INCOMPATIBLE` con solo los datos
fiscales no sensibles necesarios para corrección.

`Invoice` e `InvoiceConcept` conservan códigos y descripciones en sus snapshots
inmutables. No existe una relación fiscal que obligue a reconstruir una factura
histórica desde la descripción mutable de `SatCatalogEntry`.

Antes de construir el snapshot de emisión, `CfdiValidationService` verifica la
versión activa y la pertenencia de los códigos de emisor, receptor, pago,
moneda, concepto, impuesto, objeto de impuesto y tipo de comprobante. Si el
catálogo no está configurado o el código no existe, la operación se bloquea con
`SAT_CATALOG_NOT_CONFIGURED` o `SAT_CATALOG_CODE_NOT_FOUND`; la venta y sus
unidades operativas no se modifican.

## Núcleo de dominio fiscal

`CfdiValidationService` es la frontera de lectura del núcleo. Carga una
`BillingRequest` vigente, exige `APPROVED`, rechaza una raíz nativa ya
existente y resuelve cliente, emisor, documentos, partidas y aplicaciones de
facturas activas. Esta operación es read-only: no crea `Invoice`, no reserva
inventario y no modifica `Sale`, `Payment` ni `AccountReceivable`.

`CfdiDocumentBuilder` recibe exclusivamente datos resueltos por backend y
produce un snapshot neutral al proveedor, profundamente inmutable y con hash
canónico. Recalcula con `Prisma.Decimal` cantidad, valor unitario, importe,
descuento, base, impuesto y total; valida tanto cada ecuación como los
agregados por documento y factura. El snapshot no contiene UUID, TFD, sello
CFDI, sello SAT ni resultados del PAC.

La construcción rechaza perfiles fiscales incompletos, claves SAT inválidas,
configuración FormaPago/MetodoPago incoherente, moneda/tipo de cambio inválido,
ventas de clientes, monedas o entidades legales mezcladas y cualquier importe
superior al saldo facturable vigente. Los códigos de dominio son estables:
`MISSING_FISCAL_PROFILE`, `MISSING_PRODUCT_FISCAL_PROFILE`,
`INVALID_CFDI_USE`, `INVALID_PAYMENT_CONFIGURATION`, `TOTAL_MISMATCH`,
`OVER_INVOICED`, `MIXED_CUSTOMERS`, `MIXED_CURRENCIES`,
`MIXED_LEGAL_ENTITIES`, `BILLING_REQUEST_NOT_APPROVED` y
`CFDI_ALREADY_EXISTS`. La combinación inválida de UsoCFDI, régimen o persona
produce `CFDI_USE_REGIME_INCOMPATIBLE`.

La configuración de pago es un comando interno server-owned. `PUE` exige una
FormaPago distinta de `99`; `PPD` exige `99`. Para `MXN`, el tipo de cambio es
exactamente `1`; para otra moneda debe ser positivo. El núcleo no infiere
FormaPago/MetodoPago desde `Sale.paymentType` ni acepta totales calculados por
el frontend.

## Frontera del proveedor

`FiscalProviderPort` recibe snapshots neutrales y devuelve resultados
normalizados. DTO, autenticación, URL, envelopes de error y traducciones de
catálogos permanecen dentro de cada adapter.

```ts
interface FiscalProviderPort {
  readonly providerKey: string;
  readonly capabilities: {
    readonly providerSideIdempotency: boolean;
  };
  stamp(command: FiscalIssueCommand): Promise<FiscalStampResponse>;
  cancel(command: FiscalCancelCommand): Promise<FiscalCancellationResponse>;
  getStatus(command: FiscalStatusCommand): Promise<FiscalStatusResponse>;
  getXml(command: FiscalArtifactCommand): Promise<FiscalArtifactContent>;
  getPdf(command: FiscalArtifactCommand): Promise<FiscalArtifactContent>;
  getCancellationStatus(
    command: FiscalStatusCommand,
  ): Promise<FiscalCancellationResponse>;
}
```

`providerKey` es identidad opaca y normalizada del adapter; los servicios de
emisión de Ingreso, REP y Egreso, cancelación, reconciliación y artefactos la
obtienen del port y jamás comparan nombres concretos de PAC. `capabilities`
declara únicamente garantías verificables del proveedor. En particular,
`providerSideIdempotency=false` obliga a conservar la protección PostgreSQL y
la reconciliación conservadora sin repetir `stamp`.

Cancelación, consulta y descarga transportan además el `providerKey`
persistido de la operación original. Una cancelación hereda la clave del
intento `STAMP` confirmado, no la configuración activa al momento de cancelar.
El adapter concreto falla cerrado antes de la red si recibe una operación de
otro proveedor; un futuro router que implemente el mismo port podrá seleccionar
Facturama o Finkok con esa clave sin cambiar los orquestadores ni consultar el
PAC equivocado después de un cambio de proveedor.

El único import concreto de un adapter permitido fuera de su propio árbol es
el composition root de NestJS que enlaza `FISCAL_PROVIDER_PORT`. Los adapters
concretos no se exportan desde el módulo CFDI. Configuración, credenciales,
payloads, errores HTTP y respuestas del PAC permanecen dentro del adapter.

El runtime actual implementa ingreso (`CfdiType=I`) y recepción de pagos
(`CfdiType=P` con Complemento de Pagos 2.0), además de cancelación, consulta de
estado, recuperación de XML/PDF/acuse y reconciliación de operaciones inciertas.
Egreso, Traslado, Carta Porte, nómina y comercio exterior permanecen fuera. Un
`FiscalCredentialResolver` recibe solo la referencia opaca de secretos y
entrega credenciales al adapter durante la llamada; el port nunca expone ni
persiste contraseñas, CSD o tokens.

El registro selecciona el adapter por `FiscalIssuerBinding.providerKey`. La
clave se persiste como string y no como enum PostgreSQL para agregar un segundo
adapter sin reescribir historia. `FACTURAMA` es la primera clave y `FINKOK`
queda reservada.

## Flujo UI de emisión

La emisión no crea una pantalla fiscal paralela. `BillingRequestDetailPage`
reutiliza `InvoiceReconciliationPanel` para `BillingRequest.APPROVED` y obtiene
una revisión de lectura `cfdiReview` desde el backend. Esa revisión expone los
snapshots candidatos de emisor/receptor, conceptos y totales calculados con
`Prisma.Decimal`; sirve para inspección operativa, pero no sustituye la
validación autoritativa de `CfdiValidationService` durante el comando.

Solo `ADMIN` y `BILLING` ven la CTA `Emitir CFDI`. El navegador puede enviar
`expectedVersion`, una `Idempotency-Key` estable por intención y las decisiones
permitidas (`cfdiUse`, `paymentMethod`, `paymentForm`, `exportCode` y
`tipoCambio` cuando aplique). No puede editar ni originar UUID, TFD, sellos,
certificados, estado PAC, XML/PDF, conceptos ni totales.

El panel muestra `LOADING`, `READY`, `STAMPING`, `STAMP_UNKNOWN`, `STAMP_ERROR`
y `STAMPED`. El backend `UNKNOWN` se etiqueta como `STAMP_UNKNOWN` y mantiene
la instrucción de reconciliar sin volver a timbrar. Después de `STAMPED`, el
panel muestra UUID, fechas, cancelación y acciones XML/PDF que solicitan la URL
firmada temporal de `/api/billing/invoices/:id/{xml|pdf}`; nunca recibe ni
expone `storageKey`. Perfiles incompletos, errores de validación, conflictos de
versión y artefactos aún no disponibles se muestran como estados distintos y
accionables.

Facturama inicia en modo Multiemisor porque el dominio admite más de una
`LegalEntity`. El binding es por emisor y ambiente. Credenciales y secretos
CSD nunca se guardan en tablas de dominio ni se devuelven al frontend.

`FacturamaAdapter` usa los contratos vigentes de la API Multiemisor sin que el
dominio importe DTOs del PAC:

- emisión: `POST /api-lite/3/cfdis`, con `Issuer`, `Receiver`, `Items`,
  `TaxObject`, `PaymentForm`, `PaymentMethod`, `Currency`, `Exportation`,
  serie y folio server-owned;
- para un snapshot explícitamente global, emisión agrega exactamente
  `GlobalInformation { Periodicity, Months, Year }`; una factura nominativa lo
  omite;
- cancelación: `DELETE /api-lite/cfdis/{id}` con motivo y, cuando aplica,
  `uuidReplacement`;
- estado: `GET /cfdi/{id}?type=issuedLite`;
- archivos: `GET /Cfdi/{format}/issuedLite/{id}` para `xml` y `pdf`;
- la respuesta de emisión exige `Id`, `Date` y `Complement.TaxStamp`; el
  adapter normaliza UUID, fechas, sellos, certificado y RFC del PAC, y
  devuelve referencias de artefactos sin copiar el envelope del proveedor.

Los códigos HTTP y respuestas incompletas se convierten a errores estables
(`FISCAL_PROVIDER_VALIDATION`, `FISCAL_PROVIDER_AUTHENTICATION`,
`FISCAL_PROVIDER_TIMEOUT`, `FISCAL_PROVIDER_UNAVAILABLE`,
`FISCAL_PROVIDER_RESPONSE_INVALID`, entre otros). El adapter no registra
headers de autenticación, requests completos, XML/PDF, passwords ni cuerpos de
error. Cada llamada conserva `correlationId`; no se ejecutan reintentos
automáticos; la orquestación de `BillingRequest.APPROVED` pertenece a
`CfdiIssuanceService`, no al adapter.

`FakeFiscalProvider` implementa el mismo port con identidad `FAKE` para pruebas
unitarias y de contrato sin simular ser Facturama. La suite reusable de
conformidad exige identidad/capacidades, `stamp`, estado activo, estado
`UNKNOWN`, cancelación, descarga XML con SHA-256 y replay idempotente solo
cuando el adapter declara esa garantía. Facturama ejecuta esa misma suite con
`providerSideIdempotency=false`; un adapter Finkok deberá ejecutarla antes de
ser enlazado. `FiscalArtifactService` consume ese port y el
`ObjectStoragePort` existente; el dominio no conoce SDKs de S3 ni tipos de
Facturama.

## Configuración segura del proveedor

El runtime recibe `CFDI_ENABLED`, `FISCAL_PROVIDER`,
`FISCAL_PROVIDER_ENVIRONMENT`, `CFDI_REQUEST_TIMEOUT_MS` y
`CFDI_MAX_RETRIES`. La única configuración Facturama de esta fase es
`FACTURAMA_API_BASE_URL`, `FACTURAMA_API_MODE=MULTI_ISSUER` y la referencia
opaca `FACTURAMA_CREDENTIAL_REF`. La referencia se resuelve en un Docker Secret
o secret manager futuro; no contiene ni sustituye usuario, contraseña, token,
CSD, `.key` o certificado privado.

Los valores `SANDBOX` y `PRODUCTION` son explícitos. La URL se valida antes de
resolver credenciales o iniciar red contra una allowlist exacta por ambiente:
`https://apisandbox.facturama.mx` para `SANDBOX` y
`https://api.facturama.mx` para `PRODUCTION`. No se admiten credenciales en la
URL, puertos, paths, query ni fragments. Cuando `CFDI_ENABLED=true`, proveedor,
ambiente, endpoint y referencia son obligatorios y los límites de
timeout/reintentos son acotados. El validador rechaza variables de credenciales
en claro y los errores externos se convierten a un registro genérico sin
copiar mensajes, URLs, headers, payloads o secretos. Esta configuración no
activa timbrado ni llama al PAC. Toda respuesta Facturama se limita a 16 MiB;
se rechaza por `Content-Length` antes de leer y también durante streaming para
respuestas chunked.

## Enums nuevos

### `InvoiceOrigin`

- `LEGACY_EXTERNAL`
- `NATIVE_CFDI`

### `CfdiDocumentType`

- `INCOME`
- `PAYMENT_RECEIPT`
- `CREDIT_NOTE`

El runtime actual habilita `INCOME`. `PAYMENT_RECEIPT` queda canonizado por
CFDI-16 y solo se habilitará en una tarea de implementación posterior.

### `InvoiceFiscalStatus`

- `LEGACY`
- `DRAFT`
- `READY`
- `STAMPING`
- `STAMPED`
- `FAILED`
- `UNKNOWN`

### `FiscalCancellationStatus`

- `NOT_APPLICABLE`
- `NOT_REQUESTED`
- `PENDING`
- `ACCEPTED`
- `REJECTED`
- `UNKNOWN`

### `FiscalOperationType`

- `STAMP`
- `CANCEL`
- `STATUS`
- `RECOVERY`

### `FiscalOperationStatus`

- `PENDING`
- `PROCESSING`
- `UNKNOWN`
- `RETRYABLE_FAILURE`
- `TERMINAL_FAILURE`
- `SUCCEEDED`

### `FiscalArtifactType`

- `XML`
- `PDF`
- `CANCELLATION_ACK`

### `FiscalArtifactStatus`

- `PENDING`
- `AVAILABLE`
- `FAILED`

### `SatCatalogVersionStatus`

- `STAGING`
- `VALIDATED`
- `ACTIVE`
- `RETIRED`
- `FAILED`

### `PaymentInvoiceApplicationStatus` (diseño CFDI-16)

- `RESERVED`
- `UNKNOWN`
- `EFFECTIVE`
- `REPLACEMENT_PENDING`
- `RELEASED`
- `REVERSED`
- `INCONSISTENT`

### `FiscalEnvironment`

- `SANDBOX`
- `PRODUCTION`

## Entidades nuevas

### `LegalEntity` como emisor autoritativo

`LegalEntity` permanece una entidad existente, pero su configuración fiscal es
la autoridad del emisor CFDI y nunca se mezcla con `OperationalLocation`.
Conserva `cfdiEnabled`, `fiscalPostalCode` como lugar de expedición,
`fiscalRegime`, `defaultSeries` y metadata no secreta del certificado
(`certificateSerialNumber`, `certificateFingerprint`, `certificateSubject`,
`certificateValidFrom`, `certificateValidTo`). El backend deriva estado,
campos faltantes y `CFDI_LEGAL_ENTITY_FISCAL_PROFILE_INCOMPLETE`.

No se almacenan `.key`, contraseña de CSD, token PAC ni secretos de proveedor.
`cfdiEnabled=true` exige RFC, código postal, régimen SAT, serie y vigencia de
certificado válidos. Una venta facturable debe resolver exactamente un mapeo
vigente `Sale -> LegalEntity` antes de confirmar; ubicación sin emisor,
mapeos solapados, entidad inactiva, CFDI deshabilitado, perfil incompleto o
certificado fuera de vigencia son bloqueos terminales de validación.

### `FiscalIssuerBinding`

Relaciona una `LegalEntity` con la cuenta del proveedor sin guardar secretos:

- `legalEntityId`, `providerKey`, `environment`, `credentialRef`;
- referencias de emisor/sucursal del proveedor cuando apliquen;
- vigencia, `isActive` y `version`;
- un único binding activo por entidad legal y ambiente.

### `FiscalFolioSequence`

Asigna serie y folio deterministas en PostgreSQL antes de llamar al proveedor.
La secuencia es única por entidad legal y serie y se comparte entre CFDI I, E
y P. El tipo de documento no crea contadores independientes. La identidad
asignada es inmutable y sirve para reconciliar respuestas ambiguas.

### `Invoice` fiscal

Extiende la raíz existente sin reemplazarla. Conserva `status` para la
operación legacy y agrega estados fiscales separados, versión/tipo CFDI,
emisión/timbrado, UsoCFDI, Exportación, forma/método de pago, moneda/tipo de
cambio, snapshots JSONB de emisor/receptor, certificado, TFD, sellos,
sustitución, relaciones fiscales, contador de intentos y último error.

`sourceBillingRequestId` y `fiscalIdempotencyKey` son únicos cuando existen y
evitan dos raíces nativas para una solicitud/comando; `fiscalRequestHash`
detecta replay conflictivo. `uuid` permanece nullable antes del timbrado y
único cuando existe. Los campos de resultado SAT/PAC son exclusivamente
server-owned.

### `InvoiceConcept`

Fila insert-only por concepto fiscal. Conserva códigos SAT, descripción,
cantidad, unidad, valor unitario, descuento, base/impuesto, total, impuestos
estructurados y hash canónico. `sourceSaleItemId` es solo trazabilidad opaca:
no existe relación a `Product` ni `Customer`, por lo que cambios comerciales
posteriores no alteran el concepto emitido.

### `FiscalOperationAttempt`

Registro durable de cada interacción fiscal `STAMP`, `CANCEL`, `STATUS` o
`RECOVERY`:

- número monotónico por factura/operación;
- `correlationId` e `idempotencyKey` globalmente únicos;
- hash de request, estado, timestamps y próxima recuperación;
- proveedor/referencia, HTTP, error sanitizado y digest de respuesta;
- nunca payload fiscal binario, credenciales ni secretos.

`UNKNOWN` bloquea un nuevo `STAMP`; solo una consulta `STATUS` o una operación
`RECOVERY` puede resolverlo. Un nuevo `STAMP` exige que el intento anterior sea
`RETRYABLE_FAILURE`, número consecutivo y la misma clave idempotente.
PostgreSQL mantiene el contador agregado y último error en `Invoice`, pero el
historial autoritativo son los intentos.

### `FiscalCertificate`

Snapshot inmutable de la metadata pública del CSD usado: entidad legal, número
de serie, huella SHA-256, sujeto/emisor y vigencia. No almacena `.key`,
contraseña, token PAC ni secreto. `LegalEntity` conserva la configuración
vigente; `FiscalCertificate` preserva el certificado exacto asociado a la
factura histórica.

### `FiscalArtifact`

Metadatos PostgreSQL para archivos privados guardados mediante el
`ObjectStoragePort` existente:

- factura/intento, tipo y object key determinista;
- MIME, longitud, checksum SHA-256 y digest de proveedor;
- estado, versión, errores y timestamps.

No existe columna de bytes, XML o PDF. El archivo solo vive en ObjectStorage;
la fila PostgreSQL conserva identidad, metadata y hash. `byteSize` es la
columna persistida y la API la expone como `sizeBytes`. Los objetos
`AVAILABLE` nunca se eliminan por un comando de negocio. `STAMPED` con XML
pendiente o fallido se registra como inconsistencia recuperable y no invalida
el UUID fiscal ya confirmado.

### `PaymentReceipt`, `PaymentReceiptDetail` y `PaymentInvoiceApplication`

Extensiones insert-only de una `Invoice(PAYMENT_RECEIPT)`. `PaymentReceipt`
representa el nodo Pagos 2.0 y sus Totales; `PaymentReceiptDetail` fotografía
un `Payment` como nodo Pago; `PaymentInvoiceApplication` fotografía cada
`DoctoRelacionado` y enlaza el pago con una factura de Ingreso concreta. No
actualizan `Payment.amount`, `AccountReceivable.outstandingAmount`, ventas,
cierres, rutas ni inventario. Campos, restricciones y ciclo de vida están en la
sección «Arquitectura REP 2.0 (CFDI-16)».

## Extensiones de entidades existentes

- `Invoice.origin` será obligatorio tras backfill: filas existentes
  `LEGACY_EXTERNAL`, filas nativas `NATIVE_CFDI`.
- `Invoice.sourceBillingRequestId` es único y nullable para legacy.
- `Invoice.status` conserva `ACTIVE`, `CANCELLED` y `SUBSTITUTED`; el trabajo
  PAC vive en `fiscalStatus`, `cancellationStatus` e intentos.
- La cancelación fiscal separa `cancellationMotiveCode`, `internalReason`,
  `replacementInvoiceId` y `replacementUuid`. `cancellationReason`,
  `substitutionUuid` y `substitutedByInvoiceId` permanecen como compatibilidad
  legacy, no como autoridad de comandos nativos.
- `substitutionOfInvoiceId` y `fiscalRelationships` son la representación
  server-owned de una sustitución nativa de Ingreso; el primero es único por
  CFDI original y la segunda conserva el snapshot exacto de la relación `04`.
- `LegalEntity` debe exponer los datos estructurados del emisor CFDI 4.0.
- `Sale.requiresAdministrativeInvoice=true` obliga a resolver una única
  configuración fiscal activa desde `Sale.locationId` mediante
  `LegalEntityOperationalLocation`; la resolución ocurre dentro de la
  transacción serializable y cualquier fallo revierte la transacción completa.
- `Customer` sigue como origen del perfil receptor hasta introducir un perfil
  fiscal versionado.
- `Product` conserva un perfil fiscal nullable administrado por backend:
  `satProductServiceCode`, `satUnitCode`, `taxObjectCode`, `defaultTaxCode`,
  `defaultFactorType` y `defaultRateOrQuota`.
- `ProductUnit` (`KG`, `PIECE`, `KG_AND_PIECE`) sigue siendo operacional y no
  se usa como fallback para `satUnitCode`; tampoco se asigna
  `satProductServiceCode` automáticamente a productos existentes.
- El perfil vacío o parcial no bloquea ventas/compras, pero deriva
  `CFDI_PRODUCT_PROFILE_INCOMPLETE` y no puede construir un
  `InvoiceConcept`. Los seis campos completos y válidos son condición
  previa de emisión.

## Máquinas de estado

### Solicitud de facturación

La máquina actual no cambia:

```text
REQUESTED -> IN_REVIEW | CANCELLED
IN_REVIEW -> APPROVED | REJECTED | CANCELLED
APPROVED | REJECTED | CANCELLED -> terminal
```

Solo `APPROVED` permite crear o reproducir la raíz nativa y su intento `STAMP`. El resultado
fiscal no modifica el estado de la solicitud.

### Ciclo de vida fiscal de dominio

```text
DRAFT --START_VALIDATION--> VALIDATING
VALIDATING --VALIDATION_PASSED--> READY_TO_STAMP
VALIDATING --VALIDATION_FAILED--> STAMP_ERROR
READY_TO_STAMP --START_STAMP--> STAMPING
STAMPING --STAMP_CONFIRMED--> STAMPED
STAMPING --STAMP_TIMED_OUT--> STAMP_UNKNOWN
STAMPING --STAMP_FAILED--> STAMP_ERROR
STAMP_UNKNOWN --STAMP_CONFIRMED--> STAMPED
STAMP_UNKNOWN --STAMP_FAILED--> STAMP_ERROR
STAMP_ERROR --START_VALIDATION--> VALIDATING
STAMPED --REQUEST_CANCELLATION--> CANCEL_REQUESTED
CANCEL_REQUESTED --CANCELLATION_SUBMITTED--> CANCEL_PENDING_ACCEPTANCE
CANCEL_PENDING_ACCEPTANCE --CANCELLATION_CONFIRMED--> CANCELLED
CANCEL_PENDING_ACCEPTANCE --CANCELLATION_REJECTED--> CANCEL_REJECTED
CANCEL_PENDING_ACCEPTANCE --CANCELLATION_FAILED--> CANCEL_ERROR
CANCEL_REJECTED | CANCEL_ERROR --REQUEST_CANCELLATION--> CANCEL_REQUESTED
STAMPED --MARK_SUBSTITUTED--> SUBSTITUTED
```

`CANCELLED` y `SUBSTITUTED` son terminales. Toda transición no enumerada falla
con `INVALID_STATE_TRANSITION`. `STAMP_UNKNOWN -> STAMP_ERROR` solo procede si
una consulta `STATUS` demuestra
definitivamente que no se emitió CFDI. El tiempo transcurrido no es prueba.
Cada transición de red conserva un `FiscalOperationAttempt`.

El estado combinado se proyecta sobre los campos persistidos existentes sin
crear una segunda autoridad: `READY_TO_STAMP` corresponde a
`fiscalStatus=READY`, `STAMP_UNKNOWN` a `UNKNOWN`, los estados de cancelación
a `cancellationStatus` y solo la confirmación final cambia `Invoice.status` a
`CANCELLED` o `SUBSTITUTED`.

### Factura

```text
emisión confirmada -> ACTIVE
ACTIVE -> CANCELLED       (cancelación fiscal confirmada)
ACTIVE -> SUBSTITUTED     (sustitución confirmada)
```

En factura nativa, la cancelación pendiente vive en `cancellationStatus` y sus
intentos. `Invoice.status` cambia solo tras confirmación. La cancelación
operacional actual queda limitada a `LEGACY_EXTERNAL`.

Los motivos SAT permitidos son `01`, `02`, `03` y `04`. El motivo `01` exige
una `replacementInvoiceId` distinta, activa, `STAMPED`, con UUID y la misma
entidad legal. El backend resuelve y persiste `replacementUuid`; el caller
nunca puede enviar UUID, referencia PAC o estado fiscal.

### Artefacto

```text
PENDING -> AVAILABLE
PENDING -> FAILED -> PENDING
```

Un fallo de artefacto nunca dispara otra emisión.

## Fronteras transaccionales

### 1. Aceptar comando de emisión

Una transacción PostgreSQL `Serializable`:

1. bloquea solicitud, documentos/partidas y facturas en orden
   estable;
2. valida `APPROVED`, `expectedVersion`, perfiles fiscales completos,
   moneda/entidad compatibles e importes no consumidos;
3. rechaza otra emisión exitosa, en vuelo, reintentable o desconocida;
4. asigna serie/folio, crea `Invoice` nativa, sus snapshots/conceptos
   inmutables, aplicaciones de reserva y un
   `FiscalOperationAttempt(STAMP, PENDING)` con clave/hash de idempotencia;
5. escribe `BillingAuditLog` y confirma.

No hay llamadas a proveedor ni ObjectStorage dentro de esta transacción.

### 2. Reservar ejecución

La primera fase mueve el intento `PENDING` a `PROCESSING` y la factura a
`STAMPING` dentro de la misma transacción de preparación. El endpoint llama al
PAC solo después del commit. Si el proceso cae tras ese commit, el intento no
se vuelve a enviar: queda para reconciliación. Un worker futuro podrá reclamar
otras operaciones con `FOR UPDATE SKIP LOCKED`; no se agregan Redis, Kafka ni
microservicio fiscal.

### 3. Llamar al proveedor

El adapter Facturama recibe solo el snapshot inmutable. La red opera fuera de
una transacción y con timeouts acotados de conexión y lectura.

### 4. Finalizar

Una segunda transacción `Serializable` bloquea factura, intento y relaciones
origen:

- éxito confirmado: valida respuesta, completa solo campos SAT/PAC
  server-owned, conserva aplicaciones, crea artefactos pendientes y marca
  factura `STAMPED` e intento `SUCCEEDED`;
- rechazo definitivo: marca factura `FAILED`, intento `TERMINAL_FAILURE` y
  revierte lógicamente las aplicaciones de reserva;
- resultado ambiguo: marca factura e intento `UNKNOWN` sin crear otro intento
  `STAMP`.

Las aplicaciones se copian del snapshot antes de red para reservar saldo; no se
reconstruyen con importes del frontend ni de la respuesta PAC. `UNKNOWN` las
conserva para bloquear otro CFDI.

### 5. Publicar artefactos

`FiscalArtifactService` descarga XML/PDF del `FiscalProviderPort`, calcula y
verifica SHA-256, valida el UUID del `TimbreFiscalDigital` contra `Invoice`,
sube al bucket privado mediante `ObjectStoragePort` y confirma metadata en una
transacción corta. El acuse de cancelación usa la misma frontera cuando exista.
Un fallo de proveedor, storage o persistencia marca `FiscalArtifact.FAILED` con
código estable y `recoverable=true`; una recuperación posterior reutiliza la
misma key y nunca vuelve a timbrar. Solo puede limpiar objetos huérfanos sin
metadata fiscal confirmada.

### 6. Cancelar CFDI

Una primera transacción `Serializable` bloquea `Invoice`, valida
`ACTIVE/STAMPED`, `expectedVersion`, idempotencia, motivo y sustituto; crea un
`FiscalOperationAttempt(CANCEL, PROCESSING)`, persiste
`cancellationStatus=PENDING` y audita `CANCEL_REQUESTED`. No revierte
`InvoiceSaleDocument` ni `InvoiceSaleItemApplication`.

La llamada `FiscalProviderPort.cancel` ocurre después del commit. Una segunda
transacción corta procesa la respuesta normalizada:

- `PENDING` mantiene `Invoice.status=ACTIVE`, aplicaciones y saldo reservado;
- `REJECTED` mantiene `ACTIVE`, registra rechazo y no libera saldo;
- timeout/respuesta ambigua conserva `ACTIVE`, proyecta `CANCEL_ERROR` como
  `cancellationStatus=UNKNOWN` y no repite `cancel` automáticamente;
- solo `CANCELLED` confirmado cambia `Invoice.status=CANCELLED` y
  `cancellationStatus=ACCEPTED`, y revierte aplicaciones en la misma
  transacción que libera el saldo facturable.

El UUID histórico de `Invoice` es inmutable durante todo el flujo. Un acuse
recibido se publica después de la confirmación mediante `FiscalArtifactService`;
un fallo de ObjectStorage no degrada una cancelación fiscal confirmada.

### 6.1 Reconciliación asíncrona de cancelación

`CancellationStatusJob` es el único proceso automático que consulta una
cancelación ya enviada. Se registra como provider `STATUS` y se ejecuta con
`@nestjs/schedule` cada cinco minutos, con lotes máximos de 50 facturas. Cada
lote adquiere el advisory lock PostgreSQL `71823044`; si otra instancia lo
posee, la ejecución termina sin reclamar filas. La reclamación se confirma en
una transacción corta y la consulta HTTP al PAC ocurre después de liberar el
lock.

Se procesan las representaciones persistidas de `CANCEL_REQUESTED` y
`CANCEL_PENDING_ACCEPTANCE` (`Invoice.cancellationStatus=PENDING`), además de
`UNKNOWN` cuando un timeout ocurrió antes de conocer la respuesta. Un intento
`CANCEL` debe conservar `providerReference` y `correlationId`; el job nunca
vuelve a llamar `cancel`. Cada consulta crea un `FiscalOperationAttempt(STATUS)`
con correlación/idempotencia derivadas del intento original. Las respuestas
`PENDING` se reprograman con backoff exponencial de 60 s, limitado a 15 min;
timeouts y errores transitorios respetan `CFDI_MAX_RETRIES`. Al agotar los
intentos se conserva `ACTIVE`, `PENDING/UNKNOWN`, saldo reservado y se crea o
actualiza `BillingDataRemediation` sin generar otro CFDI.

Una respuesta `CANCELLED` se finaliza con la misma transacción serializable de
cancelación y, cuando el PAC entrega `AcuseXmlBase64`, se persiste como
`FiscalArtifact(type=CANCELLATION_ACK)` mediante `ObjectStoragePort`. Un acuse
faltante o un fallo de almacenamiento es recuperable y no revierte la
confirmación fiscal. UUID, correlación, referencia PAC y estado se validan antes
de persistir; una discrepancia crea remediación y no libera saldo.

La UI solo solicita una consulta manual explícita y muestra `PENDING`,
`CANCELLED`, `REJECTED` o `ERROR`; no usa polling agresivo como fuente de
verdad. Los logs del job contienen únicamente evento, ids opacos, estado,
contador y código estable; nunca incluyen request PAC, XML, credenciales ni
headers de autenticación.

## Política de timeout y reconciliación

- Timeout de conexión o lectura después del dispatch es `UNKNOWN`, nunca fallo
  ni reintento automático.
- El reconciliador consulta por referencia conocida o por identidad
  determinista emisor/serie/folio.
- Si encuentra el CFDI, descarga/valida el resultado y finaliza como éxito.
- Solo evidencia definitiva de no emisión habilita reintento, reutilizando
  factura, snapshots, conceptos, serie, folio e identidad idempotente.
- Rechazo fiscal 4xx es `TERMINAL_FAILURE`; corregir exige otra
  `BillingRequest` aprobada, no mutar el snapshot.
- Respuesta 5xx o malformada es `UNKNOWN` salvo prueba de rechazo previo a
  emisión.
- Un lease vencido puede reclamarse, pero un intento despachado se reconcilia
  antes de cualquier POST nuevo.
- Éxito PAC con falla de XML/PDF sigue siendo un único CFDI; solo se reintenta
  recuperar/publicar artefactos.

## Invariantes y controles PostgreSQL

- Una `Invoice` nativa por `BillingRequest` mediante
  `sourceBillingRequestId` único.
- Un intento por `(invoiceId, operation, attemptNumber)` y claves globalmente
  únicas de correlación/idempotencia.
- UUID global único e identidad entidad legal/serie/folio única.
- `UNKNOWN`, `PROCESSING`, `PENDING` o `SUCCEEDED` impiden otra emisión.
- Una fila nativa anterior a `STAMPED` no se presenta ni contabiliza como CFDI
  emitido.
- No existe factura `STAMPED` sin UUID, fecha TFD, certificados, proveedor
  certificador y sellos.
- Totales de factura, conceptos y aplicaciones coinciden por subtotal,
  descuento, impuesto y total.
- Cada concepto conserva su `sourceSaleItemId` autorizado sin depender de la
  fila mutable.
- Los guards actuales de aplicaciones siguen evitando sobreaplicación.
- Una solicitud de cancelación nunca revierte aplicaciones; únicamente una
  respuesta fiscal `CANCELLED` confirmada libera el saldo facturable.
- Un motivo `01` nunca acepta UUID desde el cliente: la relación y UUID del
  sustituto se resuelven desde una `Invoice` previamente `STAMPED`, y esa
  factura debe conservar una relación `04` exacta hacia el original.
- Una sustitución de Ingreso reserva como máximo un nuevo CFDI por original;
  una transacción concurrente no puede crear una segunda relación `04` válida.
- UUID, TFD, sellos, atributos SAT, IDs proveedor y bytes no tienen ruta
  pública de escritura.
- La operación fiscal no crea ni actualiza `Sale`, `SaleItem`, `Payment`,
  `AccountReceivable`, `InventoryBalance` ni `InventoryMovement`.
- Toda transición está versionada y auditada.

## Almacenamiento y retención

- Key privada determinista:
  `fiscal/<legalEntityId>/<year>/<month>/<uuid>/<artifact>-v1.<extension>`.
- La key no contiene RFC, nombre ni otra PII directa; el UUID es la identidad
  fiscal recibida y validada del documento.
- XML es el artefacto fiscal canónico; PDF es representación; los acuses son
  artefactos independientes.
- La descarga exige autorización backend y URL firmada con máximo cinco
  minutos, aun si el TTL global de ObjectStorage es mayor.
- El port actual conserva `putObject` y `getDownloadUrl`; no se exponen keys
  como URLs públicas y el flujo fiscal no usa delete para archivos confirmados.
- Retención y eliminación legal requieren aprobación fiscal/jurídica separada;
  ningún flujo purga evidencia silenciosamente.

## RBAC

Permisos nuevos:

- `cfdi.read`
- `cfdi.issue`
- `cfdi.reconcile`
- `cfdi.cancel`
- `cfdi.artifacts.read`
- `cfdi.provider.manage`

Asignación inicial:

- `ADMIN`: todos.
- `BILLING`: lectura, emisión, reconciliación, cancelación y artefactos.
- `SELLER`: sin comando fiscal; puede descargar artefactos únicamente de sus
  ventas visibles.
- `COLLECTIONS`: sin comando fiscal; puede descargar artefactos vinculados a
  cuentas por cobrar visibles.
- `WAREHOUSE` y `DRIVER`: sin acceso fiscal.

La emisión CFDI-08 aplica directamente la allowlist de roles `ADMIN` y
`BILLING`; la descarga de artefactos aplica además ownership/scope para
`SELLER` y `COLLECTIONS`. Los permisos `cfdi.*` restantes se activarán al
implementar sus rutas. Ocultar rutas frontend solo es defensa adicional.
Ninguna API devuelve secretos o configuración del proveedor.

La administración de la configuración de `LegalEntity` se expone únicamente a
`ADMIN` y `BILLING` mediante `cfdi.provider.manage`:

- `GET /api/legal-entities`
- `GET /api/legal-entities/:id`
- `POST /api/legal-entities`
- `PATCH /api/legal-entities/:id`
- `DELETE /api/legal-entities/:id` (desactivación lógica)

Estas rutas solo modifican configuración fiscal; no crean facturas, no llaman
PAC y no modifican ventas ni inventario.

## API pública

Los contratos exactos viven en `specs/.specs/03-api/cfdi-api.md`.

Runtime implementado:

- `POST /api/billing/requests/:id/issue-cfdi`
- `GET /api/cfdi/operations/:operationId`
- `POST /api/cfdi/operations/:operationId/reconcile`
- `GET /api/billing/invoices`
- `GET /api/billing/invoices/:invoiceId`
- `GET /api/billing/invoices/:invoiceId/status`
- `GET /api/billing/invoices/:invoiceId/cancellation`
- `GET /api/billing/invoices/:invoiceId/xml`
- `GET /api/billing/invoices/:invoiceId/pdf`

Las lecturas de historial y detalle fiscal requieren `ADMIN` o `BILLING` y
consumen exclusivamente los snapshots inmutables de `Invoice` y
`InvoiceConcept`. No reconstruyen emisor, receptor o conceptos desde
`LegalEntity`, `Customer` o `Product` actuales. Para legacy sin snapshots se
devuelve `snapshotAvailable=false` y se conserva la ausencia como dato
histórico.

La lista es paginada, ejecuta una consulta de conteo y una consulta batched con
relaciones de documentos/artefactos, y acepta filtros de fecha, cliente, RFC,
UUID, serie/folio, estado fiscal, entidad legal, ubicación derivable y tipo
CFDI. El detalle agrega conceptos, impuestos, aplicaciones, cancelación,
intentos y auditoría resumida; el endpoint `status` devuelve solo el estado y
sus artefactos disponibles. Todos los importes JSON son strings decimales.

API fiscal REP de CFDI-17 y contratos reservados:

- `POST /api/billing/payments/:paymentId/issue-cfdi`
- `GET /api/billing/payments/:paymentId/rep-preview` (reservado)
- `GET /api/billing/payments/:paymentId/payment-receipts` (reservado)

Reservado sin arquitectura de implementación:

- `POST /api/cfdi/invoices/:invoiceId/credit-notes`

## Migración legacy y compatibilidad

1. **Expand:** agregar estructuras fiscales nullable e `Invoice.origin`.
2. **Backfill:** clasificar todas las facturas actuales como
   `LEGACY_EXTERNAL`/`LEGACY`; preservar UUID, serie, folio, estado,
   sustituciones y aplicaciones. No completar versión, catálogos, snapshots,
   TFD, certificado ni sellos desde datos mutables.
3. **Validate:** demostrar que ninguna fila legacy se reclasificó y que los
   reportes/totales permanecen idénticos. Registrar
   `LEGACY_INVOICE_UUID_INVALID` y
   `LEGACY_INVOICE_TOTAL_INCONSISTENT` en `BillingDataRemediation` para
   revisión manual; UUID nulo se conserva y no es error por sí mismo.
4. **Coexist:** `link-invoice` y cancelación operacional aceptan solo origen
   legacy; emisión nativa usa exclusivamente
   `POST /api/billing/requests/:id/issue-cfdi`.
5. **Cutover UI:** reemplazar captura manual de serie/folio/UUID por el comando
   de emisión. Ningún DTO frontend incluye resultados fiscales.
6. **Contract:** retirar `POST /api/billing/requests/:id/link-invoice` cuando
   termine la reconciliación externa pendiente; conservar lectura/auditoría
   legacy indefinidamente.

CFDI-04 implementa expand/backfill/validate en
`20260822120000_add_cfdi_fiscal_data_model`; no ejecuta integración PAC ni
reclasifica facturas legacy como nativas.

## Pruebas requeridas

- Unitarias: constructor de snapshot, aritmética `Prisma.Decimal`, totales,
  saldos disponibles, inmutabilidad/hash, todas las transiciones permitidas y
  rechazo exhaustivo de las no permitidas, clasificación de timeout, permisos,
  normalización de error y mapping del adapter.
- Contrato del proveedor: cada adapter ejecuta la misma suite reusable para
  `stamp`, `status`, `UNKNOWN`, `cancel`, descarga XML, identidad/capacidades y
  replay provider-side solo cuando la capacidad está declarada. Facturama la
  satisface sin afirmar idempotencia PAC; un adapter Finkok futuro debe
  satisfacerla antes de entrar al composition root.
- Integración PostgreSQL: replay idempotente, concurrencia, constraints, lease,
  bloqueo `UNKNOWN`, inmutabilidad y aplicaciones exactas.
- Runtime timeout: pérdida de respuesta tras aceptación reconcilia una sola
  factura sin segundo POST.
- ObjectStorage: staging, checksum/readback, reintento, RBAC de URL firmada y
  no eliminación de artefactos confirmados.
- HTTP E2E: matriz autenticada, decimales string, errores estables, rechazo de
  campos fiscales server-owned y ausencia de secretos.
- Regresión: factura externa/reportes sin cambios y cero mutaciones de ventas,
  pagos, cuentas por cobrar, balances o movimientos de inventario.
- Migración: expand/backfill/validate/rollback en PostgreSQL desechable con
  facturas legacy y sustituciones.
- Frontend: solo usuarios autorizados ven emitir en solicitud `APPROVED`; no
  existen inputs UUID, TFD, sellos, datos PAC, XML ni PDF.
- Reconciliación: tabla, detalle, exportación, estados e históricos consumen la
  misma autoridad Invoice/aplicaciones.
- REP 2.0: PUE/PPD, pago parcial/liquidación, multi-factura, factura
  multi-venta, orden de pagos, conversión/impuestos, replay, dos emisiones
  concurrentes, timeout, cancelación, sustitución y cero escrituras económicas.

## Criterios de aceptación

- `APPROVED` es la única entrada nativa y aprobar no tiene efecto fiscal.
- Un timeout no puede crear un segundo CFDI.
- Toda factura nativa traza intentos, snapshots, conceptos, resultado, artefactos,
  documentos/partidas y auditoría.
- El frontend no puede escribir datos PAC o SAT de resultado.
- Ninguna operación fiscal cambia inventario, ventas, pagos o cobranza.
- Facturas y solicitudes externas actuales siguen legibles y migrables.
- Facturama puede sustituirse por Finkok mediante el port/registry.

## Quality Gate fiscal

El Quality Gate normal opera con CFDI deshabilitado y proveedor `NONE`. Los
contratos PAC se ejecutan con `FakeFiscalProvider` y fixtures sintéticas; las
pruebas PostgreSQL usan una base declarada desechable después de aplicar todas
las migraciones desde cero. Los jobs de reconciliación comparten la misma
evidencia de exclusión por advisory lock que sus pruebas de dos instancias.

El repositorio rechaza llaves/certificados fiscales versionados, material PEM
privado y XML CFDI no sanitizado. Facturama real solo se verifica mediante un
workflow manual protegido, fijo a sandbox y con credenciales provenientes de
secrets; el contrato de lectura consulta un CFDI existente y el contrato de
escritura exige `RUN_FACTURAMA_SANDBOX_STAMP="true"` antes de ejecutar
`FiscalProviderPort.stamp()` real. El contrato de escritura valida el UUID
retornado, `getStatus()`, XML CFDI 4.0 y `TimbreFiscalDigital.UUID` del mismo
documento. Ningún contrato forma parte de PR, `main`, release, Docker build o
el `test:e2e` normal.

## CFDI-12 — Reconciliación de `STAMP_UNKNOWN`

`StampReconciliationJob` ejecuta una pasada cada cinco minutos y también una
pasada inicial al arrancar el proceso. PostgreSQL concede el advisory lock
`71823043` dentro de la transacción corta de selección; si otra instancia lo
posee, la pasada termina sin consultar al proveedor. La transacción reclama
como máximo 50 operaciones y termina antes de cualquier llamada HTTP.

Solo se reclaman intentos `STAMP` cuya `Invoice.fiscalStatus=UNKNOWN` y cuya
próxima recuperación venció. Un intento `RECOVERY` en `PROCESSING` reciente
impide crear otro intento para la misma factura; el número, `correlationId`,
idempotencia y referencia PAC se persisten en PostgreSQL antes de llamar al
proveedor. La operación de recuperación nunca mantiene locks durante la
consulta o la descarga de artefactos.

La job consulta `FiscalProviderPort.getStatus` con la referencia PAC y el
`correlationId` de recuperación. Cuando el proveedor confirma un CFDI, el XML
se descarga y su `TimbreFiscalDigital.UUID` debe coincidir exactamente con el
UUID de la respuesta de estado. Se recuperan XML y PDF en memoria acotada y se
entregan a `FiscalArtifactService`; los bytes siguen fuera de PostgreSQL. Un
PDF ausente deja el artefacto recuperable, pero no degrada una identidad fiscal
ya confirmada. La transacción final bloquea la factura, persiste UUID, TFD,
sellos, certificados, `STAMPED`, los intentos y la auditoría; una factura ya
`STAMPED` con el mismo UUID solo completa intentos pendientes y nunca crea otro
CFDI.

Una respuesta `FISCAL_PROVIDER_NOT_FOUND` permite únicamente reintentos
acotados de `STATUS/RECOVERY`. No se ejecuta un segundo `stamp` automático:
Facturama no ofrece en este adapter una garantía verificable de idempotencia
para repetir el POST después de un timeout. Al agotar `CFDI_MAX_RETRIES`, o
ante referencia ausente, TFD incompleto, UUID divergente o persistencia
inconsistente, la factura permanece `UNKNOWN` y se abre o actualiza una
`BillingDataRemediation` con un código estable. Mientras exista `UNKNOWN` no se
acepta otra emisión.

Los eventos de aplicación son sanitizados y no incluyen XML, PDF, payload,
headers, credenciales ni mensajes PAC: `started`, `recovered`, `not-found`,
`still-unknown` y `failed`. No se agrega Redis, Kafka ni un microservicio
fiscal.

Todo XML recuperado del PAC se rechaza antes de persistir o promover estado si
contiene declaraciones `DOCTYPE` o `ENTITY`. El extractor de TFD no resuelve
entidades externas y ningún parser XML puede habilitar DTD, XXE o acceso a red.

## CFDI-22 — Operación, diagnóstico y recuperación

Las fronteras fiscales emiten eventos JSON estructurados bajo namespaces
estables: `cfdi.stamp.*`, `cfdi.reconciliation.*`, `cfdi.cancel.*`,
`cfdi.artifact.*` y `cfdi.rep.*`. Cada registro admite solo ids opacos, estados,
contadores, timestamps y códigos internos acotados. Se descartan campos no
permitidos, valores anidados y strings sobredimensionados; nunca se registran
XML, PDF, payloads, headers, credenciales, CSD privado ni mensajes PAC.

Como `LegalEntity` conserva metadata pública de vigencia del CSD,
`CertificateExpiryJob` revisa diariamente emisores activos con CFDI habilitado.
La pasada usa `pg_try_advisory_xact_lock(71823045)`, reporta certificados
vencidos o dentro de 30 días de vencer mediante `cfdi.certificate.expiry.*` y
no lee material secreto ni modifica estado fiscal.

`GET /api/health/dependencies` incorpora una comprobación fiscal local sobre
PostgreSQL: degrada cuando un emisor CFDI activo carece de vigencia futura. No
consulta al PAC y no participa en `GET /api/health/ready`, por lo que una caída
del PAC o una alerta de certificado no impide levantar el ERP.

El runbook canónico `docs/runbooks/cfdi-operations.md` cubre caída PAC, timeout
incierto, artefactos faltantes, entrega al cliente, cancelación pendiente,
divergencia UUID, expiración CSD, credenciales inválidas y restauración de
ObjectStorage. Ninguna recuperación repite un `stamp`/`cancel` incierto ni
modifica verdad fiscal directamente en PostgreSQL. No se agrega Redis.

## Referencias canónicas

- `specs/.specs/00-business/PRD.md`
- `specs/.specs/00-business/business-rules.md`
- `specs/.specs/01-architecture/architecture.md`
- `specs/.specs/02-database/entities.md`
- `specs/.specs/02-database/database.md`
- `specs/.specs/03-api/cfdi-api.md`
- `specs/.specs/05-testing/testing-strategy.md`
- `specs/.specs/05-testing/acceptance-criteria.md`
- `docs/adr/ADR-001-native-cfdi-4-architecture.md`
- `docs/adr/ADR-008-stamp-reconciliation.md`
- `docs/adr/ADR-012-rep-2-payment-invoice-applications.md`

### Contrato externo verificado

- SAT — Complemento de pagos 2.0:
  `https://wwwmat.sat.gob.mx/consultas/92764/comprobante-de-recepcion-de-pagos`
- SAT — Regla 2.7.1.32, expedición de CFDI por pagos realizados:
  `https://wwwmat.sat.gob.mx/articulo/22029/regla-2.7.1.35`
- SAT — Estándar técnico Pagos 2.0:
  `https://www.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461175070885&ssbinary=true`
- SAT — Cancelación de facturas:
  `https://wwwmat.sat.gob.mx/consultas/91447/nuevo-esquema-de-cancelacion`

- Guía oficial Facturama API Multiemisor — crear CFDI 4.0:
  `https://apisandbox.facturama.mx/guias/api-multi/cfdi/factura`
- Guía oficial Facturama API Multiemisor — cancelar CFDI 4.0:
  `https://apisandbox.facturama.mx/guias/api-multi/cfdi/cancelacion`
- Referencia oficial Facturama — descargar XML/PDF:
  `https://apisandbox.facturama.mx/Docs/Api/GET-api-Cfdi-format-type-id`
- Referencia oficial Facturama — estado de solicitud de cancelación:
  `https://apisandbox.facturama.mx/docs/Api/DELETE-api-cfdi-id-response`
