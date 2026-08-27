# ADR-003: Facturama detrás de FiscalProviderPort

- **Estado:** Aceptado para implementación del adapter; no habilita timbrado
- **Fecha:** 2026-08-22
- **Contexto:** CFDI-07-FACTURAMA-ADAPTER

## Decisión

El núcleo CFDI llama únicamente a `FiscalProviderPort`. La primera
implementación es `FacturamaAdapter` en modalidad API Multiemisor y usa una
referencia opaca resuelta por `FiscalCredentialResolver`. Un adapter Finkok
futuro podrá implementar el mismo port sin importar DTOs de Facturama ni
modificar snapshots, `Invoice` o las máquinas de estado.

El port expone `stamp`, `cancel`, `getStatus`, `getXml`, `getPdf` y
`getCancellationStatus`. Las respuestas son normalizadas y contienen solo
identificadores, fechas, UUID, TFD, sellos/certificados necesarios y artefactos
binarios o referencias de recuperación. Un UUID, sello o dato SAT nunca es
aceptado desde el frontend.

## Contrato Facturama verificado

La integración usa la documentación oficial vigente:

- `POST /api-lite/3/cfdis` para CFDI de ingreso 4.0;
- `DELETE /api-lite/cfdis/{id}` con `motive` y `uuidReplacement` opcional;
- `GET /cfdi/{id}?type=issuedLite` para detalle/estado;
- `GET /Cfdi/{format}/issuedLite/{id}` para XML/PDF.

La emisión exige `Id`, `Date` y `Complement.TaxStamp` completos. `pending`,
`canceled`, `acepted`, `expired`, `rejected` y `active` se mapean a estados
neutrales. Un envelope incompleto no se convierte en una factura timbrada.

## Seguridad y resiliencia

- El timeout se toma de `CFDI_REQUEST_TIMEOUT_MS` y cada llamada recibe
  `correlationId`.
- La autenticación Basic se construye en memoria con credenciales resueltas;
  nunca se registra el header, password, CSD, XML/PDF o cuerpo de error.
- 4xx de validación/autenticación, timeout, 5xx y respuesta incompleta se
  traducen a códigos internos estables.
- El adapter no ejecuta reintentos automáticos ni reconcilia por sí mismo. La
  política de `STAMP_UNKNOWN` y la idempotencia permanecen en PostgreSQL.

## Enmienda CFDI-19 — frontera verificable

El port expone una identidad opaca `providerKey` y capacidades normalizadas.
Los orquestadores fiscales persisten esa identidad sin leer
`FISCAL_PROVIDER` ni comparar `FACTURAMA`/`FINKOK`. El fake usa su propia
identidad y no simula otro PAC. Facturama declara
`providerSideIdempotency=false` porque no existe una garantía verificable en
el contrato integrado; PostgreSQL mantiene la exclusión e idempotencia
autoritativas.

Las operaciones sobre documentos históricos transportan la identidad
persistida: una cancelación hereda `providerKey` del `STAMP` original y las
jobs/descargas reenvían la clave del intento o artefacto. El adapter rechaza
antes de HTTP una clave distinta. Así, un futuro router puede implementar el
mismo port y despachar al adapter correcto sin contaminar los servicios.

Una prueba de arquitectura impide nombres o imports de adapters concretos en
emisión, REP, Egreso, cancelación, reconciliación y artefactos. Una suite de
contrato reusable verifica resultados normalizados para `stamp`, estado,
`UNKNOWN`, cancelación, XML/hash y la idempotencia provider-side únicamente
cuando el adapter la declara. El único punto que conoce la clase concreta es
el composition root de NestJS.

## Consecuencias

La API PAC puede cambiar sin contaminar el dominio, y un segundo proveedor se
puede incorporar con una nueva implementación y ejecutar la misma suite. La
selección/configuración Finkok y sus credenciales quedan para una tarea
posterior; incorporarlo no requiere cambiar servicios fiscales, snapshots,
estados ni resultados normalizados.
