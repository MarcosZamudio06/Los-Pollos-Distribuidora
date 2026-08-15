# Migración de evidencia de entrega a Object Storage

## Contrato de producción

Las fotos de `DRIVER` se validan en el backend y se suben a un bucket privado
compatible con S3. PostgreSQL conserva únicamente la referencia e integridad:

- `storageKey`
- `mimeType`
- `sha256`
- `sizeBytes`
- `metadata`
- `receivedAt`
- `capturedByUserId`

Las nuevas fotos tienen `value = NULL`. `value` es nullable únicamente para
permitir la migración gradual de filas históricas.

Variables obligatorias en producción:

```text
OBJECT_STORAGE_BUCKET
OBJECT_STORAGE_REGION
```

`OBJECT_STORAGE_ENDPOINT` permite usar MinIO, Cloudflare R2, DigitalOcean
Spaces u otro proveedor S3-compatible. Las credenciales pueden provenir de
`OBJECT_STORAGE_ACCESS_KEY_ID` y `OBJECT_STORAGE_SECRET_ACCESS_KEY`, o de la
cadena de credenciales/IAM del runtime. El bucket debe permanecer privado.

## Despliegue

1. Aplicar la migración Prisma `20260815110000_move_delivery_evidence_to_object_storage`.
2. Desplegar el backend con Object Storage configurado. Las capturas nuevas ya
   no escriben Base64 en PostgreSQL.
3. Contar las filas históricas pendientes:

   ```sql
   SELECT count(*)
   FROM "DeliveryEvidence"
   WHERE type = 'PHOTO' AND "storageKey" IS NULL AND value IS NOT NULL;
   ```

4. Ejecutar el backfill idempotente con las mismas variables de producción:

   ```bash
   OPENSSL_CONF=/dev/null pnpm --dir backend run evidence:migrate-to-object-storage
   ```

5. Repetir la consulta anterior. El resultado esperado es `0`. El comando no
   elimina una fila inválida: termina con código distinto de cero y reporta el
   identificador para revisión manual.
6. Verificar que no existan fotos sin referencia:

   ```sql
   SELECT count(*)
   FROM "DeliveryEvidence"
   WHERE type = 'PHOTO' AND "storageKey" IS NULL AND value IS NULL;
   ```

El endpoint de ruta devuelve `contentUrl` firmado y de corta duración para que
la UI pueda leer objetos privados sin exponer credenciales.
