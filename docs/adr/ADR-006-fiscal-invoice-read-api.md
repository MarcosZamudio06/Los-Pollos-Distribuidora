# ADR-006 — Lectura fiscal desde snapshots persistidos

## Estado

Aceptado para CFDI-10.

## Contexto

`Customer`, `Product` y `LegalEntity` son registros mutables. Usarlos para
reconstruir una factura histórica puede cambiar el receptor, las claves SAT,
las descripciones o los importes observados después de emitirla. `Invoice`,
`InvoiceConcept` y las aplicaciones por documento/partida ya conservan la
autoridad fiscal y comercial necesaria.

## Decisión

`FiscalInvoiceReadService` es la única frontera de lectura de historial CFDI:

1. La lista usa filtros, conteo y una consulta paginada batched; no hace una
   consulta por factura.
2. El detalle lee `issuerSnapshot`, `receiverSnapshot`, `InvoiceConcept`,
   `InvoiceSaleDocument`, `InvoiceSaleItemApplication`, `FiscalArtifact` y
   operaciones en una selección acotada, más una consulta limitada de
   `BillingAuditLog`.
3. El endpoint de estado no carga conceptos y devuelve únicamente estado,
   cancelación, último intento y disponibilidad de artefactos.
4. Los snapshots son la fuente de emisor, receptor y conceptos. Las facturas
   legacy sin snapshot se identifican con `snapshotAvailable=false`; no se
   completan desde datos actuales.
5. Solo `ADMIN` y `BILLING` pueden leer historial, detalle y estado. Los
   alcances `SELLER`/`COLLECTIONS` permanecen limitados a descarga de artefactos
   según la política canónica.
6. Los importes se serializan como strings decimales y nunca se exponen
   `storageKey` ni payloads fiscales almacenados.

## Consecuencias

- El historial permanece estable aunque cambien clientes, productos o emisor.
- Legacy sigue consultable sin inventar información fiscal faltante.
- El detalle puede ser más grande, pero queda limitado a una factura y no
  introduce N+1 en la lista.
- RFC de una factura nativa se filtra por `receiverSnapshot`; legacy puede usar
  relaciones disponibles solo para seleccionar, nunca para construir la
  respuesta histórica.

## Fuera de alcance

No se agregan exportaciones, acciones de cancelación, reconciliación ni nuevos
campos de snapshot. La integración HTTP/PostgreSQL real requiere la
infraestructura de pruebas correspondiente.
