# ADR-011 — Catálogos SAT versionados y sin consulta en línea

## Estado

Aceptado — CFDI-15.

## Contexto

CFDI 4.0 requiere códigos SAT para receptor, conceptos, impuestos, pagos,
moneda y cancelación. Mantener esos códigos como texto libre o pedirlos al SAT
durante una venta introduce latencia, dependencia externa y una fuente mutable
para facturas históricas. El repositorio tampoco contiene una fuente oficial
automatizable ni debe inventar filas SAT.

## Decisión

Persistir tres modelos PostgreSQL:

- `SatCatalog`: clave soportada y puntero a la versión activa.
- `SatCatalogVersion`: `sourceVersion`, estado, checksum SHA-256, conteo,
  metadata y timestamps de ciclo de vida.
- `SatCatalogEntry`: código, descripción, vigencia y metadata por versión.

La primera familia soportada es `c_ClaveProdServ`, `c_ClaveUnidad`,
`c_RegimenFiscal`, `c_UsoCFDI`, `c_FormaPago`, `c_MetodoPago`, `c_Impuesto`,
`c_TasaOCuota`, `c_TipoDeComprobante`, `c_Moneda`, `c_MotivoCancelacion`,
`c_CodigoPostal` y `c_ObjetoImp`.

`SatCatalogImportService` acepta un archivo ya obtenido por un proceso operativo
debidamente registrado. Normaliza, rechaza duplicados y rangos inválidos,
calcula un checksum canónico y ejecuta `STAGING -> VALIDATED -> ACTIVE`. La
activación retira la versión previa y actualiza el puntero en una transacción
atómica. No hay seeds con descripciones supuestas y no se consulta la fuente
SAT desde ventas.

La lectura se expone en `GET /api/cfdi/catalogs` y
`GET /api/cfdi/catalogs/:key`, solo para `ADMIN`/`BILLING`, con filtro por código
y fecha, límite acotado, `Cache-Control` privado y caché de servidor de cinco
minutos. Un catálogo sin carga activa devuelve `configured=false` y cero filas.

Las facturas no referencian entradas de catálogo: `Invoice` e `InvoiceConcept`
guardan códigos y descripciones en snapshots inmutables. El frontend usa la API
cuando existe una versión activa y conserva únicamente selects controlados de
compatibilidad mientras se prepara la primera importación del ambiente.

## Alternativas descartadas

1. **Consultar SAT/PAC durante cada venta.** Rechazada por latencia,
   indisponibilidad y falta de reproducibilidad histórica.
2. **Sembrar un catálogo parcial en la migración.** Rechazada porque no existe
   una fuente oficial verificada en el repositorio y una fila inventada puede
   producir un CFDI inválido.
3. **Guardar solo el código en Product/Customer.** Rechazada porque no permite
   versionar vigencia ni auditar la fuente, aunque esos perfiles siguen siendo
   opcionales para operación comercial.

## Consecuencias

- Una publicación SAT requiere una operación explícita de importación y
  aprobación, pero no bloquea ventas mientras se prepara.
- La base de datos es la autoridad de versión activa, checksum y transición;
  las descripciones futuras no reescriben facturas históricas.
- Debe existir un proceso operativo para descargar, revisar y registrar la
  fuente oficial antes de activar una versión.
- Un catálogo soportado sin versión activa bloquea emisión CFDI en la validación
  fiscal, no la venta ni la captura de perfiles opcionales.

## Evidencia

- `backend/prisma/migrations/20260823140000_add_sat_catalog_versioning/migration.sql`
- `backend/src/modules/cfdi/sat-catalog.service.ts`
- `backend/src/modules/cfdi/sat-catalog.controller.ts`
- `backend/src/modules/cfdi/sat-catalog.service.spec.ts`
