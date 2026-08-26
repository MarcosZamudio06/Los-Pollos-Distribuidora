# ADR-001 — CFDI 4.0 nativo mediante port de proveedor y workflow PostgreSQL

- Estado: Aceptado, con persistencia refinada por ADR-002
- Fecha: 2026-08-22
- Responsables: Arquitectura y Facturación
- Alcance: solo arquitectura; sin integración PAC ni cambio productivo

## Decisión

Construir CFDI 4.0 nativo como contexto fiscal delimitado dentro del backend
NestJS actual. PostgreSQL será la autoridad de idempotencia, estados, leases,
reconciliación, snapshots inmutables y auditoría. El ObjectStorage privado
actual conservará XML, PDF y acuses de cancelación.

`BillingRequest.APPROVED` será la única entrada. El primer adapter será
Facturama Multiemisor. `FiscalProviderPort` impedirá que DTO o credenciales
del proveedor entren al dominio y permitirá incorporar Finkok después.

No se introducen Redis, Kafka ni un microservicio fiscal.

### Emisor fiscal y ubicación operativa

`LegalEntity` es la única raíz de configuración fiscal del emisor. Conserva
`cfdiEnabled`, lugar de expedición (`fiscalPostalCode`), régimen SAT, serie por
defecto y metadata no secreta del certificado con vigencia. `OperationalLocation`
solo representa la ubicación operativa y se vincula mediante
`LegalEntityOperationalLocation` con vigencia explícita.

Una venta que solicita factura debe resolver exactamente un mapeo vigente hacia
una `LegalEntity` activa, habilitada y fiscalmente completa antes de confirmar.
La resolución ocurre dentro de la transacción serializable y un fallo revierte
la transacción completa; ninguna operación fiscal cambia inventario.

La administración de estas entidades usa `cfdi.provider.manage` y se limita a
`ADMIN` y `BILLING`. Nunca se persisten `.key`, contraseña de CSD, token PAC o
secretos equivalentes; las credenciales futuras se referencian fuera del
dominio mediante un binding seguro.

## Contexto verificado en el código actual

- `BillingRequest` ya cuenta con aprobación versionada, creación idempotente,
  reservas por documento/partida, transacciones serializables y auditoría.
- `Invoice`, `InvoiceSaleDocument` e `InvoiceSaleItemApplication` ya
  reconcilian facturas externas y controlan aplicaciones exactas.
- El frontend actual envía serie, folio, UUID y totales a `link-invoice`; ese
  es un flujo legacy de reconciliación, no una frontera segura de emisión.
- `Payment` y `AccountReceivable` permanecen separadas y cada pago de
  cobranza aplica a una cuenta sin `PaymentAllocation`.
- `ObjectStoragePort` ya carga objetos S3 privados y crea URL firmadas, pero
  necesita put-if-absent y lectura de metadata para uso fiscal.
- `env.validation.ts` no contiene configuración PAC o CFDI.

## Fundamentación

### Persistir la operación antes de llamar al PAC

Un timeout no demuestra fracaso. Persistir primero comando, snapshot e identidad
fiscal permite consultar si el PAC emitió sin enviar otra solicitud.

### Persistencia de `Invoice`

ADR-002 refina esta frontera: una `Invoice` `NATIVE_CFDI` puede persistirse con
snapshot completo antes del llamado PAC para ser la raíz idempotente. Esa fila
NO representa un CFDI emitido hasta quedar `fiscalStatus=STAMPED` con UUID y
TFD validados. El trabajo pendiente o ambiguo se distingue mediante estado
fiscal e intentos separados, sin sobrecargar `Invoice.status`.

### Mantener I/O del proveedor fuera de transacciones

La red puede durar más que los locks y no participa en el commit PostgreSQL.
Transacciones serializables cortas protegen invariantes antes y después del PAC.

### Reutilizar aplicaciones de factura existentes

`InvoiceSaleDocument` e `InvoiceSaleItemApplication` ya protegen relación y
límites monetarios. Otra relación CFDI-venta crearía doble fuente contable.

### Usar Facturama Multiemisor primero

El dominio admite múltiples `LegalEntity`. Facturama documenta Multiemisor
para múltiples RFC, mientras su Web API se centra en uno. El modo permanece
dentro del adapter y del binding del emisor.

## Consecuencias

### Positivas

- Resultados ambiguos bloquean duplicados en vez de provocar reintentos ciegos.
- Un segundo proveedor no cambia API pública ni semántica persistida.
- Reportes y controles actuales de aplicaciones siguen siendo la autoridad.
- Emisión fiscal no afecta inventario, ventas, pagos ni cuentas por cobrar.
- Un éxito PAC sobrevive una caída posterior de ObjectStorage mediante outbox.

### Costos

- Workers, leases, reconciliación y publicación requieren monitoreo.
- Multiemisor exige aprovisionar emisores/CSD fuera del dominio.
- UI legacy y emisión nativa coexistirán durante la migración.
- Se requieren perfiles fiscales de producto y snapshots antes de activar.

## Alternativas rechazadas

### Llamar Facturama dentro de la transacción de aprobación

Se rechaza porque prolongaría locks y un timeout podría dejar un CFDI emitido
con transacción local revertida.

### Usar `BillingRequest.status` como estado PAC

Se rechaza porque aprobación administrativa y procesamiento fiscal tienen
transiciones y semántica de reintento distintas.

### Llevar campos del proveedor a controllers/services

Se rechaza porque convertiría los envelopes Facturama en contrato de dominio y
haría transversal adoptar Finkok.

### Agregar Redis/Kafka o microservicio fiscal

Se rechaza porque PostgreSQL ya provee transacciones, constraints, leases,
locking ordenado y `SKIP LOCKED`; la escala actual no justifica otra frontera.

### Reutilizar datos frontend de `link-invoice`

Se rechaza porque UUID, TFD, sellos, SAT, referencias PAC y artefactos deben
provenir del resultado validado. Valores escritos por usuario duplicarían la
verdad fiscal.

## Reglas operativas

- `UNKNOWN` es estado bloqueante de primera clase.
- Nunca hay reenvío automático tras respuesta ambigua.
- La reconciliación usa referencia PAC o emisor/serie/folio deterministas.
- Éxito PAC y disponibilidad de artefactos son responsabilidades separadas.
- Las object keys usan IDs internos, nunca RFC, UUID ni nombres.
- Artefactos confirmados son inmutables y no se eliminan por flujos de negocio.

## Compatibilidad y migración

Las facturas actuales se backfill como `LEGACY_EXTERNAL`. UUID, aplicaciones,
cancelaciones, sustituciones, reportes y exportaciones quedan intactos. Las
nativas usan `NATIVE_CFDI` y `/api/cfdi/**`.

La UI y endpoint `link-invoice` se retiran únicamente después de cerrar la
reconciliación externa pendiente. Esta tarea no ejecuta migraciones ni cambia
runtime.

## Evidencia del proveedor para la frontera

- La guía oficial CFDI 4.0 documenta el endpoint de emisión y datos requeridos:
  <https://apisandbox.facturama.mx/guias/api-web/cfdi/factura>
- Facturama documenta Web/Multiemisor, consulta, cancelación y descarga:
  <https://apisandbox.facturama.mx/guias>
- La referencia oficial expone consulta/estado, artefactos y cancelación:
  <https://apisandbox.facturama.mx/docs/menu>

Estas fuentes sustentan capacidades del adapter; sus schemas no se vuelven
contrato canónico del dominio.

## Orden futuro de implementación

1. Expandir schema, port, permisos y validación estricta de configuración.
2. Agregar perfiles/snapshots construidos por servidor y constraints.
3. Implementar adapter Facturama sandbox y pruebas de contrato.
4. Implementar worker, reconciliación de timeout y outbox de artefactos.
5. Agregar HTTP/frontend y pruebas PostgreSQL, ObjectStorage y sandbox.
6. Activar mediante gate explícito después de validar migración.
