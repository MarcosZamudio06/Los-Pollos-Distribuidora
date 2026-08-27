# ADR-002 — Invoice como raíz persistente del ciclo CFDI nativo

- Estado: Aceptado
- Fecha: 2026-08-22
- Alcance: modelo persistente CFDI-04; sin integración PAC

## Contexto

`Invoice` ya es la raíz de facturas externas y conserva las relaciones
`InvoiceSaleDocument` e `InvoiceSaleItemApplication`. Crear otra raíz fiscal
para el documento duplicaría identidad, importes y vínculos comerciales.

El ciclo nativo también necesita persistir identidad, snapshot e idempotencia
antes del I/O remoto. Un UUID solo existe después del timbrado y un timeout no
demuestra que el PAC haya rechazado la operación.

## Decisión

Extender `Invoice` en lugar de reemplazarla. Una fila `NATIVE_CFDI` puede
existir antes del timbrado, pero solo es un CFDI emitido cuando
`fiscalStatus=STAMPED`. `Invoice.status` mantiene exclusivamente la semántica
operacional legacy.

- `sourceBillingRequestId` único evita dos raíces nativas por solicitud.
- `fiscalIdempotencyKey` único y `fiscalRequestHash` inmutable protegen replay;
  los intentos `STAMP` posteriores conservan esa identidad y solo proceden
  después de un `RETRYABLE_FAILURE` confirmado.
- Emisor, receptor y conceptos son snapshots inmutables.
- `InvoiceConcept` no depende de `Product` o `Customer` mutable.
- `FiscalOperationAttempt` registra `STAMP`, `CANCEL`, `STATUS` y `RECOVERY`
  con correlación e idempotencia únicas.
- `FiscalArtifact` solo conserva metadata/hash/storage key; XML/PDF/acuses
  permanecen en ObjectStorage.
- `FiscalCertificate` conserva metadata pública del certificado usado, nunca
  llave privada, contraseña ni token PAC.
- UUID, TFD, sellos y datos SAT/PAC son server-owned.

## Migración legacy

La migración clasifica las filas existentes como
`LEGACY_EXTERNAL`/`LEGACY` y no infiere versión, catálogos, snapshots,
certificados o sellos. UUID inválido y ecuaciones monetarias inconsistentes se
registran en `BillingDataRemediation`; UUID nulo se conserva.

## Consecuencias

- La lectura fiscal debe exigir `STAMPED`; una raíz `DRAFT`, `READY`,
  `STAMPING`, `FAILED` o `UNKNOWN` no se presenta como CFDI emitido.
- El timeout `UNKNOWN` impide otro `STAMP` hasta reconciliación.
- Las relaciones de venta existentes continúan siendo la única autoridad.
- Este ADR no habilita endpoints ni proveedor y no cambia comportamiento
  productivo por sí mismo.
