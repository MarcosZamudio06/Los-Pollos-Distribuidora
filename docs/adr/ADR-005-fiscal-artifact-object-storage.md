# ADR-005 — Artefactos fiscales fuera de PostgreSQL

## Estado

Aceptado para CFDI-09. La verificación contra un proveedor S3/MinIO real queda
pendiente de infraestructura disponible.

## Contexto

El XML timbrado es evidencia fiscal autoritativa; PDF y acuses son artefactos
derivados que deben sobrevivir a reinicios, reintentos y reconciliación sin
convertir `Invoice` en un almacén binario. El repositorio ya tiene un
`ObjectStoragePort` privado con carga y URLs firmadas.

## Decisión

`FiscalArtifactService` será la única frontera para publicar y descargar
artefactos fiscales:

1. Lee contenido normalizado desde `FiscalProviderPort` o recibe el acuse
   normalizado de una operación futura.
2. Calcula SHA-256 y tamaño desde los bytes recibidos y valida MIME.
3. Para XML verifica que `TimbreFiscalDigital.UUID`, `Invoice.uuid` y la
   respuesta del proveedor coincidan.
4. Sube mediante `ObjectStoragePort` a una key privada determinista:
   `fiscal/{legalEntityId}/{year}/{month}/{uuid}/{artifact}-v1.{extension}`.
5. En una transacción breve marca `FiscalArtifact.AVAILABLE` y persiste
   `storageKey`, `byteSize`, `sha256`, `mimeType`, digest del proveedor y
   timestamps. La API expone `byteSize` como `sizeBytes`.
6. Ante fallo, marca `FAILED` con código estable y `recoverable=true`; no cambia
   `Invoice.fiscalStatus=STAMPED` ni vuelve a llamar `stamp`.

Las descargas validan RBAC y ownership/scope, y solo devuelven URLs firmadas
temporales. Nunca se devuelve `storageKey` como URL pública ni se guarda XML,
PDF o acuse en columnas BYTEA/TEXT de `Invoice`.

## Consecuencias

- La pérdida temporal de ObjectStorage no pierde el CFDI ni permite duplicarlo;
  una recuperación posterior puede reusar la misma key.
- `FiscalArtifact.FAILED` es una inconsistencia operativa recuperable y debe
  aparecer en auditoría.
- La retención y eliminación legal de objetos requieren una decisión fiscal
  separada; los artefactos `AVAILABLE` no se borran desde comandos comerciales.
- La prueba local usa fake ObjectStorage; la prueba S3/MinIO real depende de
  infraestructura externa.

## Fuera de alcance

No se implementan en esta tarea la cancelación fiscal ni el worker periódico de
reconciliación; el servicio ya expone la operación necesaria para un acuse y
para recuperar filas PENDING/FAILED sin volver a timbrar.
