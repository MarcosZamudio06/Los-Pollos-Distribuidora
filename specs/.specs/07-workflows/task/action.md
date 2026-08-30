# TASK-CASH-SHIFT-CLOSURE

## Objetivo

Implementar el cierre explícito de turnos de caja antes del cierre diario, con recuperación administrativa auditable para turnos abandonados o terminales inaccesibles.

## Estado

- [x] Persistir modo y motivo de cierre administrativo.
- [x] Exponer `PATCH /cash-shifts/:id/close` para cierre normal y administrativo.
- [x] Recalcular resumen diario, efectivo contado y diferencias desde los turnos.
- [x] Mostrar turnos abiertos y captura de efectivo contado por turno.
- [x] Bloquear visualmente "Cerrar jornada" mientras existan turnos abiertos.
- [x] Mapear códigos API a mensajes operativos.
- [x] Documentar el procedimiento administrativo.
- [x] Ejecutar validación completa en un entorno con dependencias instaladas.

# TASK-CEDIS-CUSTODY-STOCK-AVAILABILITY

## Objetivo

Implementar la existencia física por ubicación, la reserva de mercancía para
transferencias pendientes y la disponibilidad operativa CEDIS → sucursal sin
crear stock global ni ocultar inconsistencias históricas.

## Estado

- [x] Canonizar existencia física, custodia, propiedad derivada, reserva y disponibilidad en los specs.
- [x] Ejecutar el preflight de datos en modo solo lectura.
- [x] Agregar columnas, backfill fail-fast, constraints e índices de reservas.
- [x] Validar el contrato de migración, el backfill real y el estado de migraciones Prisma.
- [x] Implementar el servicio central de balances con reserva, liberación y consumo.
- [x] Integrar ventas, ajustes y transferencias con disponibilidad reservada.
- [x] Reservar al crear transferencias genéricas y operaciones CEDIS dentro de la transacción de negocio.
- [x] Agrupar partidas repetidas y construir todos los hallazgos de insuficiencia antes de escribir.
- [x] Preservar idempotencia, vínculo CEDIS, snapshots, eventos y versionado sin reservas parciales.
- [x] Exponer disponibilidad en API y UI CEDIS.
- [x] Ejecutar pruebas unitarias, concurrencia, integración, E2E y frontend.

### Fase 5: Liberación al cancelar

- [x] Cancelar únicamente transferencias `DRAFT`, `REQUESTED` e `IN_TRANSIT`.
- [x] Liberar exactamente las reservas originales de `REQUESTED` e `IN_TRANSIT`.
- [x] Persistir cancelación, actor, motivo, timestamp e idempotency marker.
- [x] Invalidar y reabrir ciclos CEDIS vinculados con versión optimista y evento auditable.
- [x] Reproducir cancelaciones idempotentes sin liberar, versionar o auditar dos veces.
- [x] Rechazar reservas faltantes o incompatibles sin cambios parciales ni movimientos físicos.

### Fase 6: Consumo al confirmar

- [x] Validar ciclo mutable, dirección, estado, productos activos, permisos y alcance del actor.
- [x] Exigir que la reserva pendiente del origen cubra todas las cantidades enviadas.
- [x] Consumir físicamente la existencia y la reserva del origen de forma atómica y serializable.
- [x] Acreditar el destino con cantidades confirmadas y crear movimientos `TRANSFER_OUT`/`TRANSFER_IN` con saldos anterior y posterior.
- [x] Acreditar recepciones CEDIS únicamente por cantidades recibidas.
- [x] Conservar faltantes y sobrantes de tránsito en `BranchSupplyReceiptItem`, sin crear movimientos físicos adicionales en el destino.
- [x] Rechazar reservas ausentes o incompatibles con `INVENTORY_RESERVATION_INTEGRITY_ERROR` sin reconstruir stock.
- [x] Confirmar el traspaso, incrementar la versión del ciclo e invalidar su reconciliación mediante evento auditable.
- [x] Preservar reintentos serializables e idempotentes sin duplicar movimientos, eventos ni versionados.
- [x] Cubrir confirmación, recepción exacta, faltantes, sobrantes, ecuación de saldo, idempotencia y ausencia de movimientos duplicados.

### Fase 7: Protección de ventas y ajustes

- [x] Auditar todas las mutaciones directas de `InventoryBalance` y eliminar los decrementos fuera del servicio central.
- [x] Validar disponibilidad física menos reserva por separado para KG y PIECE.
- [x] Proteger ventas confirmadas y ventas de canal `ROUTE` contra consumo de mercancía reservada.
- [x] Proteger ajustes negativos, mermas y diferencias físicas contra consumo de mercancía reservada.
- [x] Proteger cancelaciones de compra contra saldo físico o disponible insuficiente.
- [x] Preservar reservas durante entradas positivas y actualizar snapshots de movimientos desde el cambio central.
- [x] Cubrir `ROUTE_STOCK` con incrementos de devoluciones y decrementos de ventas, sin doble descuento.
- [x] Ejecutar pruebas enfocadas de rechazo por reserva y decremento exitoso en cada flujo restante.

### Fase 8: Consultas y API

- [x] Exponer disponibilidad física, reservada y disponible por KG y PIECE en balances.
- [x] Exponer balances con alcance de ubicación en productos y detalle de transferencias.
- [x] Separar físico CEDIS, reserva, disponible, custodia de sucursales y propiedad de red.
- [x] Mantener `remaining` como saldo físico CEDIS y no como propiedad total.
- [x] Mostrar los nuevos saldos en las pantallas existentes de inventario y CEDIS.
- [x] Cubrir los contratos de lectura con pruebas backend y frontend enfocadas.
- [x] Ejecutar la validación completa de backend, frontend, E2E, Prisma y preflight.

### Fase 9: Errores operativos

- [x] Implementar y documentar la presentación completa de errores operativos.
- [x] Exponer `INSUFFICIENT_STOCK` con `409 Conflict` y `findings[]` estructurados.
- [x] Exponer `INVENTORY_RESERVATION_INTEGRITY_ERROR` e `INVENTORY_CONCURRENCY_CONFLICT` con códigos estables.
- [x] Mantener `LOCATION_NOT_AUTHORIZED`, `PRODUCT_INACTIVE`, `UNIT_MISMATCH` y `BRANCH_SUPPLY_CYCLE_DIRECTION_INVALID` en el sobre HTTP.
- [x] Cubrir el filtro HTTP, disponibilidad, concurrencia y dirección inválida con pruebas.

### Fase 10: Frontend

- [x] Añadir disponibilidad en el formulario de comandos CEDIS antes de confirmar.
- [x] Deshabilitar productos sin disponibilidad y conservar el formulario ante conflictos.
- [x] Consultar balances del CEDIS para suministros y de la sucursal para devoluciones.
- [x] Validar KG y PIECE por separado, evitar productos duplicados y mostrar faltantes.
- [x] Refrescar productos y resumen CEDIS después de conflictos de disponibilidad o concurrencia.
- [x] Mantener la misma clave de idempotencia al reintentar el mismo payload.

## Reglas de ejecución

- La migración no puede reducir cantidades, cancelar transferencias ni crear inventario para resolver sobrerreservas.
- Las transferencias `REQUESTED` e `IN_TRANSIT` reservan en el origen y no crean movimientos físicos.
- `CONFIRMED` consume la reserva con la salida física; `CANCELLED` libera la reserva.
- Las ventas y ajustes negativos solo pueden usar disponibilidad no reservada.

# TASK-074 — Fase 0: alta de sucursales y rutas desacopladas

## Objetivo

Cerrar la Fase 0 documental del plan `docs/ui/planSucursales.md` para el alta de
sucursales y la planeación geoespacial. La fase define el contrato de una alta
que persiste únicamente una `BRANCH` vinculada a un CEDIS activo, conserva la
captura manual sin mapa y deja bloqueado el renderer productivo hasta aprobar
los contratos y el proveedor de style/tiles.

## Estado

- Estado: COMPLETED — especificaciones y decisiones documentadas; no se
  implementó infraestructura ni renderer.

## Review Workload Forecast

- Estimated changed lines: 399; 400-line budget risk: Medium.
- Chained PRs recommended: No; Decision needed before apply: No.
- Delivery strategy: single focused documentation slice.

## Alcance de Fase 0

- [x] Documentar en la UI que el alta persiste únicamente una
      `OperationalLocation` de tipo `BRANCH`.
- [x] Documentar el vínculo obligatorio de la sucursal con un CEDIS activo y
      las validaciones de la jerarquía directa.
- [x] Documentar que el mapa, el geocodificador y WebGL no son requisitos para
      la captura manual ni para guardar una alta válida.
- [x] Documentar que el alta no crea balances, movimientos, reservas,
      transferencias ni `BranchSupplyCycle`.
- [x] Alinear el contrato API de ubicaciones con las reglas específicas de
      `BRANCH` y sus efectos de persistencia.
- [x] Documentar `GeocodingPort`, `RoutingPort`, `RouteOptimizationPort` y la
      frontera de configuración de mapas, con Photon como adaptador inicial de
      geocodificación sin acoplar la UI al proveedor.
- [x] Eliminar la dependencia normativa de React Leaflet en la UI de rutas y
      documentar la alternativa textual cuando el renderer no esté disponible.
- [x] Definir criterios y decisión pendiente para style/tiles en
      `docs/open-decisions.md`.
- [x] Registrar este gate y las referencias canónicas para mantener la TASK
      trazable.

## Gate de implementación

**BLOQUEADO para renderer productivo e infraestructura cartográfica.** No se
puede instalar ni implementar renderer, Leaflet, React Leaflet, MapLibre, tiles,
styles o servidores asociados hasta que:

1. los specs canónicos no mantengan una dependencia obligatoria de React Leaflet
   o Leaflet; y
2. exista un proveedor de style/tiles aprobado con licencia, atribución,
   style JSON, sprites, glyphs, endpoint controlado, healthcheck y smoke test.

La captura manual de sucursales y la experiencia textual/lista de rutas no están
bloqueadas por este gate.

## Work Unit Evidence

| Evidence                                          | Required value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused test command and exact result             | `git diff --check` — PASS; no whitespace errors. `pnpm exec node --input-type=module -e 'import { readFileSync } from "node:fs"; const files = ["specs/.specs/04-ui/locations.md", "specs/.specs/03-api/locations-api.md", "specs/.specs/03-api/delivery-api.md", "specs/.specs/04-ui/routes-delivery.md", "specs/modules/routes-delivery/spec.md", "docs/open-decisions.md", "specs/.specs/07-workflows/task/action.md", "specs/FILE_INDEX.md"]; const docs = Object.fromEntries(files.map((file) => [file, readFileSync(file, "utf8")])); const checks = [files.every((file) => docs[file].length > 0), docs[files[0]].includes("Una alta exitosa MUST persistir únicamente una"), docs[files[0]].includes("`BRANCH` mediante"), docs[files[0]].includes("DISTRIBUTION_CENTER` activo"), docs[files[0]].includes("no es la fuente"), docs[files[0]].includes("no debe crear ni modificar"), docs[files[2]].includes("GeocodingPort"), docs[files[2]].includes("Photon es el proveedor inicial"), !docs[files[3]].includes("La planeación geoespacial utiliza React Leaflet"), docs[files[4]].includes("provider-neutral contract"), docs[files[5]].includes("Decisión: pendiente"), docs[files[3]].includes("Gate Fase 0"), docs[files[6]].includes("TASK-074"), docs[files[7]].includes(".specs/04-ui/locations.md")]; if (checks.some((check) => !check)) throw new Error(`documentation assertion failed: ${checks.findIndex((check) => !check) + 1}`); console.log(`PASS: ${checks.length} documentation assertions`);'` — PASS; 8 target artifacts, 14 required markers, canonical references, and no normative React Leaflet sentence detected. |
| Runtime harness command/scenario and exact result | N/A — this work unit changes Markdown specifications and decision records only; it adds no executable runtime boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Rollback boundary                                 | Revert only `specs/.specs/04-ui/locations.md`, `specs/.specs/03-api/locations-api.md`, `specs/.specs/03-api/delivery-api.md`, `specs/.specs/04-ui/routes-delivery.md`, `specs/modules/routes-delivery/spec.md`, `specs/FILE_INDEX.md`, `docs/open-decisions.md`, and this TASK-074 section in `action.md`; no application code or map infrastructure is included.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## TDD Cycle Evidence

| Task                       | Test File                                | Layer                  | Safety Net                                           | RED                                                                                                                                    | GREEN                                                                            | TRIANGULATE                                                                                                                                       | REFACTOR                                                                                                                               |
| -------------------------- | ---------------------------------------- | ---------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| TASK-074 Fase 0 documental | Inline documentation contract assertions | Documentation contract | N/A — Markdown has no file-specific executable suite | PASS as RED; pre-edit assertions detected the missing `locations.md`, missing provider/gate markers, and missing TASK-074 traceability | PASS; post-edit assertions validated all 8 target artifacts and required markers | PASS; checked canonical references, absence of the former normative React Leaflet sentence, provider-neutral ports, and the explicit blocked gate | PASS; clarified conditional map wording, indexed the new canonical UI spec, and added work-unit evidence without changing runtime code |

## Referencias de la TASK

- `docs/ui/planSucursales.md`.
- `specs/.specs/04-ui/locations.md`.
- `specs/.specs/03-api/locations-api.md`.
- `specs/.specs/03-api/delivery-api.md`.
- `specs/.specs/04-ui/routes-delivery.md`.
- `specs/modules/routes-delivery/spec.md`.
- `docs/open-decisions.md`.

# CFDI-00-ARCHITECTURE — Arquitectura CFDI 4.0 nativa

## Objetivo

Canonizar la arquitectura CFDI 4.0 nativa sobre los contratos actuales de
facturación, solicitudes, ventas, pagos, cuentas por cobrar, ObjectStorage,
configuración y frontend sin integrar un PAC ni cambiar comportamiento
productivo.

## Estado

- Estado: COMPLETED — solo arquitectura canónica y ADR; implementación
  explícitamente pendiente.

## Alcance completado

- [x] Conservó `Sale`, `SaleDocument`, `BillingRequest`, `Invoice` y
      `Payment` como conceptos separados.
- [x] Definió `BillingRequest.APPROVED` como única entrada a emisión nativa.
- [x] Conservó `InvoiceSaleDocument` e `InvoiceSaleItemApplication` como
      única autoridad factura-venta.
- [x] Definió snapshots inmutables de emisor, receptor, conceptos, impuestos y
      totales.
- [x] Definió `FiscalProviderPort`, Facturama primero y Finkok futuro.
- [x] Definió idempotencia, leases, reconciliación de timeout y estados en
      PostgreSQL, sin Redis, Kafka ni microservicio fiscal.
- [x] Definió XML/PDF/acuses privados mediante ObjectStorage.
- [x] Definió RBAC, endpoints, invariantes, transacciones, migración y pruebas.
- [x] Dejó Ingreso como primera fase; cancelación, REP 2.0 y Egreso después;
      Traslado/Carta Porte, nómina y comercio exterior fuera.
- [x] Definió `Invoice.origin`, cutover nativo y retiro futuro de
      `link-invoice`.

## Gate de implementación

Esta tarea no implementa adapter PAC, migración, variable de entorno, worker,
endpoint ni comportamiento UI. La implementación requiere otra tarea acotada y
debe iniciar con schema/port/proveedor sandbox según el ADR.

## Referencias

- `specs/modules/cfdi/spec.md`

- `specs/.specs/03-api/cfdi-api.md`

# CFDI-17-REP-IMPLEMENTATION — Emisión de CFDI P y Pagos 2.0

## Estado

- Estado: COMPLETED para el bounded context de emisión; preview e historial
  por `paymentId` permanecen reservados para una tarea posterior.

## Contrato implementado

- [x] `POST /api/billing/payments/:paymentId/issue-cfdi` con RBAC
      `ADMIN`/`BILLING`, `Idempotency-Key` obligatorio y `expectedVersion`.
- [x] El request acepta únicamente `expectedVersion`; UUID, TFD, sellos,
      certificados, conceptos, saldos, importes y estado PAC son server-owned.
- [x] `PaymentStatus.APPLIED`, `fiscalPaymentFormCode`, moneda/tipo de cambio,
      cuenta por cobrar y relación fiscal con `InvoiceSaleDocument` son
      requisitos de elegibilidad.
- [x] La emisión crea `Invoice(cfdiType=PAYMENT_RECEIPT)` y sus snapshots
      `PaymentReceipt`, `PaymentReceiptDetail` y
      `PaymentInvoiceApplication`; `Payment` continúa como fuente económica.
- [x] Un pago se distribuye sobre una o varias facturas de Ingreso `STAMPED`,
      activas y `PPD`, en orden determinista `issuedAt`, UUID, id.
- [x] `Prisma.Decimal` calcula y persiste `NumParcialidad`, `ImpSaldoAnt`,
      `ImpPagado`, `ImpSaldoInsoluto`, capacidad disponible y monto MXN.
- [x] La reserva serializable bloquea pago y facturas en orden estable, llama
      al PAC fuera de locks largos y hace replay sin segundo timbrado.
- [x] Timeout o respuesta ambigua conserva `UNKNOWN` y las aplicaciones
      reservadas; `StampReconciliationJob` recupera o mantiene indeterminado.
- [x] XML/PDF se persisten mediante `FiscalArtifactService` y ObjectStorage;
      no se almacenan bytes en PostgreSQL.
- [x] Cancelar el REP solo revierte aplicaciones tras confirmación fiscal
      `CANCELLED`; una solicitud pendiente no libera saldo.

## Pruebas y límites de evidencia

- [x] Unitarias del builder: primer pago, pago parcial, segundo pago,
      liquidación, dos facturas, exceso, moneda mixta y fecha raíz separada de
      `paidAt`.
- [x] Servicio/controller: happy path, replay, timeout `UNKNOWN` y header
      idempotente.
- [x] Adapter Facturama: payload oficial `P`, `NameId=14`, `CP01`, pagos y
      documentos relacionados; `ObjetoImpDR=02` conserva/prorratea snapshots
      de impuestos en `Taxes` sin inventar valores.
- [x] Reconciliación: advisory lock, proveedor encontrado, timeout, not-found,
      artefactos y UUID inconsistente.
- [ ] Concurrencia PostgreSQL real de REP: requiere `E2E_DATABASE_URL` y
      `E2E_DATABASE_DISPOSABLE=true`; no se infiere a partir de mocks.

## Archivos relevantes

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260823150000_add_cfdi_rep_payment_receipts/migration.sql`
- `backend/src/modules/cfdi/domain/rep-document-builder.ts`
- `backend/src/modules/cfdi/rep-issuance.repository.ts`
- `backend/src/modules/cfdi/rep-issuance.service.ts`
- `backend/src/modules/cfdi/rep-issuance.controller.ts`
- `backend/src/modules/cfdi/adapters/facturama/facturama.adapter.ts`
- `backend/src/modules/cfdi/stamp-reconciliation.job.ts`
- `backend/src/modules/billing/invoice-cancellation.service.ts`
- `specs/.specs/03-api/cfdi-api.md`

- `docs/adr/ADR-013-rep-2-implementation.md`
- `docs/adr/ADR-001-native-cfdi-4-architecture.md`
- `specs/modules/billing-reportable-notes/spec.md`
- `specs/modules/billing-requests/spec.md`

# CFDI-05-FISCAL-DOMAIN — Núcleo fiscal neutral al proveedor

## Objetivo

Implementar validación, construcción de snapshot y máquina de estados fiscal
sin invocar PAC ni mutar Ventas, Inventario, Pagos o Cuentas por cobrar.

## Estado

- Estado: PARTIAL — alcance funcional y pruebas completados; el typecheck global
  permanece bloqueado por errores preexistentes en `modules/suppliers` y la
  dependencia ausente `@nestjs/mapped-types`.

## Alcance completado

- [x] Trece estados de dominio con transiciones allowlist y error estable.
- [x] `CfdiValidationService` read-only para `BillingRequest.APPROVED`, raíz
      existente y saldos consumidos por aplicaciones activas.
- [x] `CfdiDocumentBuilder` neutral al proveedor con snapshot profundamente
      inmutable, hash canónico y aritmética `Prisma.Decimal`.
- [x] Perfiles de emisor/receptor/producto, claves SAT, FormaPago/MetodoPago,
      moneda/tipo de cambio, composición homogénea, ecuaciones y sobrefacturación.
- [x] Ausencia de UUID, TFD, sellos, Facturama y mutaciones fiscales.
- [x] Specs canónicos de módulo, arquitectura, testing y aceptación alineados.

## Evidencia

- RED: Jest falló al no existir todavía el módulo `cfdi`.
- GREEN focalizado: 3 suites, 49 pruebas, 0 fallos.
- Regresión backend directa: 154 suites, 1274 pruebas, 0 fallos.
- ESLint focalizado y `git diff --check`: PASS.
- Typecheck backend: FAIL únicamente por `modules/suppliers` y
  `@nestjs/mapped-types`; no reportó errores en `modules/cfdi`.

## Referencias

- `backend/src/modules/cfdi/`
- `specs/modules/cfdi/spec.md`
- `specs/.specs/01-architecture/architecture.md`
- `specs/.specs/05-testing/testing-strategy.md`
- `specs/.specs/05-testing/acceptance-criteria.md`

# CFDI-06-FISCAL-CONFIG — Configuración segura del proveedor fiscal

## Objetivo

Preparar configuración validada para Facturama/CSD sin habilitar timbrado ni
guardar credenciales, certificados o claves privadas en el repositorio o en
Compose.

## Estado

- Estado: IN_PROGRESS — implementación y pruebas locales completadas; falta
  validación `docker compose config` porque el runtime Docker está bloqueado en
  este entorno.

## Alcance completado

- [x] `CFDI_ENABLED`, proveedor/ambiente explícitos, timeout y máximo de
      reintentos con límites.
- [x] Configuración Facturama Multiemisor mediante endpoint y referencia opaca
      `FACTURAMA_CREDENTIAL_REF`.
- [x] Producción exige endpoint HTTPS y configuración completa cuando CFDI está
      habilitado.
- [x] Variables de credenciales en claro (`FACTURAMA_PASSWORD`, API keys,
      tokens y `CFDI_CSD_*`) rechazadas por el validador.
- [x] `.env.example`, `.env.production.example`, Compose y runbook actualizados
      sin secretos versionados.
- [x] Sanitización de errores/metadatos externos sin copiar mensajes, URLs,
      headers, tokens o cuerpos de respuesta.
- [x] No se implementó timbrado ni llamada a PAC.

## Evidencia

- Configuración/env focalizada: 26 pruebas, 0 fallos.
- Configuración CFDI + dominio CFDI: 79 pruebas, 0 fallos.
- ESLint focalizado: PASS.
- `git diff --check`: PASS.
- `docker compose --env-file .env.production.example -f docker-compose.production.yml config --quiet`:
  NOT_TESTED — Docker devuelve `operation not permitted` en este entorno.

## Referencias

- `backend/src/config/env.validation.ts`
- `backend/src/config/env.validation.spec.ts`
- `backend/src/config/fiscal-config.contract.spec.ts`
- `backend/src/modules/cfdi/fiscal-provider-error.sanitizer.ts`
- `specs/.specs/06-deployment/env-vars.md`
- `.env.example`, `.env.production.example`
- `docker-compose.yml`, `docker-compose.production.yml`

# CFDI-07-FACTURAMA-ADAPTER — Adapter PAC agnóstico al proveedor

## Objetivo

Implementar `FiscalProviderPort`, `FacturamaAdapter` Multiemisor y
`FakeFiscalProvider` sin conectarlos todavía al flujo de `BillingRequest`.

## Estado

- Estado: PARTIAL — adapter, port, fake y pruebas focalizadas completados; el
  typecheck global conserva únicamente el bloqueo preexistente en
  `modules/suppliers` y Docker no está disponible en este entorno.

## Alcance completado

- [x] Operaciones normalizadas `stamp`, `cancel`, `getStatus`, `getXml`,
      `getPdf` y `getCancellationStatus`.
- [x] Payload Multiemisor real (`/api-lite/3/cfdis`) con CFDI de Ingreso,
      `Issuer`, `Receiver`, conceptos, impuestos, forma/método de pago,
      moneda, exportación, serie y folio server-owned.
- [x] Mapeo real de cancelación (`/api-lite/cfdis/{id}`), estado y archivos
      `issuedLite` conforme a la documentación oficial vigente.
- [x] Respuestas normalizadas con UUID, fechas, TFD, sellos, certificado,
      RFC del certificador, referencias XML/PDF y acuse binario con hash.
- [x] Timeout configurable, Basic Auth resuelta desde referencia opaca,
      `correlationId`, clasificación estable de 4xx/timeout/5xx y rechazo de
      respuestas incompletas.
- [x] Prohibición de logs sensibles y ausencia de tipos Facturama en el
      dominio; no hay reintentos automáticos ni conexión a `BillingRequest`.
- [x] Fake provider y escenarios de éxito, validación, autenticación,
      timeout, 5xx, respuesta incompleta, cancelación pendiente/completa,
      estado y artefactos.

## Evidencia

- `backend/src/modules/cfdi`: 6 suites, 65 pruebas, 0 fallos.
- Typecheck aislado del port/adapter/fake: PASS.
- ESLint y Prettier focalizados: PASS.
- `git diff --check`: PASS.

## Referencias

- `backend/src/modules/cfdi/domain/fiscal-provider.port.ts`
- `backend/src/modules/cfdi/adapters/facturama/facturama.adapter.ts`
- `backend/src/modules/cfdi/testing/fake-fiscal-provider.ts`
- `docs/adr/ADR-003-facturama-provider-adapter.md`
- `specs/modules/cfdi/spec.md`

# CFDI-08-ISSUE-INVOICE — Emisión CFDI Ingreso

## Objetivo

Emitir CFDI 4.0 de Ingreso desde `BillingRequest.APPROVED` con idempotencia,
exclusión concurrente, reserva de saldo y reconciliación segura de resultados
ambiguos del PAC.

## Estado

- Estado: PARTIAL — implementación, migración y pruebas automatizadas locales
  completadas; la prueba de concurrencia PostgreSQL real está implementada pero
  no pudo ejecutarse porque el entorno no expone una base E2E desechable ni un
  runtime Docker utilizable.

## Alcance completado

- [x] `POST /api/billing/requests/:id/issue-cfdi` para `ADMIN` y `BILLING`, con
      `Idempotency-Key`, `expectedVersion`, allowlist fiscal y rechazo explícito
      de identidad, sellos, TFD, certificados, estado PAC y totales de cliente.
- [x] Preparación serializable corta: locks estables, replay global, validación,
      snapshot, folio, `Invoice`, conceptos, aplicaciones, intento y auditoría.
- [x] Llamada a `FiscalProviderPort` fuera de la transacción PostgreSQL.
- [x] Finalización atómica de éxito y estados terminal/ambiguo; timeout, 5xx y
      respuesta incompleta conservan la reserva en `STAMP_UNKNOWN` sin retimbrar.
- [x] Un error ambiguo de confirmación DB relee el estado bloqueado y no degrada
      un `STAMPED/SUCCEEDED` que sí quedó confirmado.
- [x] Migración aditiva para secuencia fiscal, unicidad de idempotencia y
      artefactos pendientes; XML/PDF permanecen fuera de PostgreSQL.
- [x] Prueba E2E desechable que enfrenta dos claves concurrentes y verifica
      sobrefacturación, una sola llamada al proveedor y una sola raíz fiscal.
- [x] Sin mutaciones a `Sale`, `Payment` ni `InventoryMovement`.

## Evidencia

- RED: endpoint ausente, repositorio de emisión ausente, fingerprint fiscal
  inválido y degradación errónea tras confirmación DB ambigua.
- GREEN backend: 160 suites, 1322 pruebas, 0 fallos.
- Prisma `format`, `validate` y `generate`: PASS.
- Typecheck aislado CFDI-08, ESLint focalizado, Prettier focalizado y
  `git diff --check`: PASS.
- Integración PostgreSQL real: NOT_TESTED — faltan `DATABASE_URL` y
  `E2E_DATABASE_URL`; Docker devuelve `operation not permitted`.
- Typecheck global: FAIL solo por el bloqueo preexistente de `modules/suppliers`
  y `@nestjs/mapped-types`.

## Referencias

- `backend/src/modules/cfdi/cfdi-issuance.service.ts`
- `backend/src/modules/cfdi/cfdi-issuance.repository.ts`
- `backend/test/cfdi-issue-invoice.e2e-spec.ts`
- `backend/prisma/migrations/20260823120000_add_cfdi_issuance_coordination/migration.sql`
- `docs/adr/ADR-004-native-cfdi-issuance-execution.md`
- `specs/modules/cfdi/spec.md`

# CFDI-09-FISCAL-ARTIFACTS — Artefactos fiscales en ObjectStorage

## Objetivo

Persistir XML/PDF y acuses fiscales fuera de PostgreSQL mediante el
`ObjectStoragePort` existente, conservando metadata, hash, disponibilidad y
recuperación auditable.

## Estado

- Estado: PARTIAL — servicio, endpoints y pruebas con fake ObjectStorage
  completados; no se ejecutó una prueba contra un bucket S3/MinIO real porque
  el runtime Docker/infraestructura externa no está disponible en el entorno.

## Alcance completado

- [x] `FiscalArtifactService` descarga XML/PDF desde `FiscalProviderPort`,
      calcula SHA-256 y tamaño desde bytes reales, sube al bucket privado y
      confirma metadata en transacciones PostgreSQL cortas.
- [x] XML valida que el UUID del `TimbreFiscalDigital` coincide con el UUID de
      `Invoice` y la respuesta normalizada del proveedor.
- [x] Keys deterministas:
      `fiscal/{legalEntityId}/{year}/{month}/{uuid}/{artifact}-v1.{extension}`.
- [x] Fallos de proveedor, storage, hash o UUID producen `FAILED` recuperable;
      nunca degradan un CFDI `STAMPED` ni provocan otro timbrado.
- [x] Recuperación posterior reutiliza la referencia persistida y no ejecuta
      `stamp`.
- [x] Soporte de `CANCELLATION_ACK` preparado para cancelación futura.
- [x] `GET /api/billing/invoices/:id/xml` y `/pdf` devuelven solo URLs firmadas
      temporales, sin `storageKey` público.
- [x] RBAC y ownership/scope para ADMIN, BILLING, SELLER y COLLECTIONS.

## Evidencia

- RED: módulo/servicio inexistente para upload, hash, URL firmada, UUID,
  storage failure y artifact faltante.
- GREEN focalizado: 4 suites, 26 pruebas, 0 fallos (servicio, controller,
  emisión y contrato del modelo fiscal).
- GREEN backend completo: 162 suites, 1333 pruebas, 0 fallos.
- Typecheck CFDI-09: sin errores propios; el typecheck global conserva el
  bloqueo preexistente de `modules/suppliers` y `@nestjs/mapped-types`.
- Prettier focalizado y `git diff --check`: PASS.
- ObjectStorage S3/MinIO real: NOT_TESTED — Docker devuelve
  `operation not permitted` y no hay bucket externo configurado.

## Referencias

- `backend/src/modules/cfdi/fiscal-artifact.service.ts`
- `backend/src/modules/cfdi/fiscal-artifact.controller.ts`
- `backend/src/modules/object-storage/object-storage.port.ts`
- `backend/src/modules/object-storage/object-storage.service.ts`
- `specs/modules/cfdi/spec.md`
- `specs/.specs/03-api/cfdi-api.md`

# CFDI-15-SAT-CATALOGS — Catálogos SAT versionados

## Alcance implementado

- [x] Modelos `SatCatalog`, `SatCatalogVersion` y `SatCatalogEntry` con estado,
      fuente, checksum, vigencia, metadata y puntero de versión activa.
- [x] Migración aditiva `20260823140000_add_sat_catalog_versioning`, sin seeds ni
      inferencia de datos oficiales.
- [x] `SatCatalogImportService` con staging, validación de duplicados/rangos,
      checksum canónico y activación atómica con retiro de la versión previa.
- [x] API read-only `GET /api/cfdi/catalogs` y
      `GET /api/cfdi/catalogs/:key`, RBAC `ADMIN/BILLING`, filtro por código/fecha
      y caché privada/acotada.
- [x] Frontend de revisión CFDI consume la versión activa cuando existe y
      conserva selects controlados de compatibilidad mientras el entorno no
      tenga una importación aprobada.
- [x] Pruebas de normalización, checksum, staging, validación, activación,
      caché, endpoint y contrato Prisma.

## Evidencia y operación

No se inventaron filas SAT. La primera carga debe partir del archivo oficial
vigente, conservar la versión/fuente, normalizar al contrato, revisar checksum y
activar solo después de aprobación fiscal. Una nueva publicación se importa como
otra versión; nunca se edita una versión activa ni se consulta la fuente remota
durante ventas.

## Archivos relevantes

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260823140000_add_sat_catalog_versioning/migration.sql`
- `backend/src/modules/cfdi/sat-catalog.service.ts`
- `backend/src/modules/cfdi/sat-catalog.controller.ts`
- `frontend/src/features/billing-requests/billingRequestsService.ts`
- `frontend/src/features/billing-requests/InvoiceReconciliationPanel.tsx`
- `docs/adr/ADR-011-sat-catalog-versioning.md`
- `docs/adr/ADR-005-fiscal-artifact-object-storage.md`

# CFDI-10-INVOICE-READ-API — Historial y detalle fiscal

## Objetivo

Exponer historial, detalle y estado fiscal de `Invoice` sin reconstruir datos
históricos desde `Customer` o `Product` mutables.

## Estado

- Estado: COMPLETED en código y pruebas unitarias; integración HTTP/PostgreSQL
  real queda pendiente de infraestructura de base de datos desechable.

## Alcance completado

- [x] `GET /api/billing/invoices` con paginación máxima de 100 y filtros
      fiscales, cliente, RFC, fecha, entidad legal, ubicación y tipo CFDI.
- [x] `GET /api/billing/invoices/:id` con snapshots, conceptos, impuestos,
      aplicaciones, documentos, artefactos, cancelación y auditoría resumida.
- [x] `GET /api/billing/invoices/:id/status` con estado, intento actual y
      disponibilidad de artefactos sin cargar conceptos.
- [x] RBAC exclusivo `ADMIN`/`BILLING`; importes como strings decimales.
- [x] Lista batched y detalle con consultas acotadas; no hay N+1 ni lecturas
      de `Customer`/`Product` para reconstruir historia.

## Evidencia

- GREEN focalizado: 2 suites, 7 pruebas, 0 fallos.
- GREEN backend completo: 164 suites, 1340 pruebas, 0 fallos.
- ESLint y Prettier focalizados: PASS.
- Typecheck global: conserva únicamente el bloqueo preexistente de
  `modules/suppliers` y `@nestjs/mapped-types`.
- No se ejecutó integración HTTP/PostgreSQL real por falta de infraestructura
  disponible.

## Referencias

- `backend/src/modules/cfdi/fiscal-invoice-read.service.ts`
- `backend/src/modules/cfdi/fiscal-invoice-read.controller.ts`
- `backend/src/modules/cfdi/dto/fiscal-invoice-query.dto.ts`
- `specs/.specs/03-api/cfdi-api.md`

# CFDI-16-REP-ARCHITECTURE — Complemento para Recepción de Pagos 2.0

## Objetivo

Canonizar REP 2.0 sobre `Payment` y `AccountReceivable` actuales, resolviendo
la relación de un pago con una o varias facturas sin duplicar dinero ni cambiar
comportamiento productivo.

## Alcance de arquitectura

- [x] Mantener `Payment` como única fuente económica y
      `AccountReceivable` como saldo de cobranza.
- [x] Modelar REP como `Invoice(PAYMENT_RECEIPT)`; no crear una segunda raíz
      fiscal.
- [x] Diseñar `PaymentReceipt`, `PaymentReceiptDetail` y
      `PaymentInvoiceApplication` como snapshots fiscales insert-only.
- [x] Resolver explícitamente que `Sale`/`SaleDocument` puede estar aplicado a
      más de una `Invoice` mediante `InvoiceSaleDocument`.
- [x] Definir distribución determinista por factura y capacidad de venta, sin
      asumir `Payment -> Sale -> un UUID`.
- [x] Definir cálculo Decimal de UUID relacionado, `NumParcialidad`,
      `ImpSaldoAnt`, `ImpPagado` e `ImpSaldoInsoluto`.
- [x] Definir PUE/PPD, obligación REP y elegibilidad exclusiva de
      `PaymentStatus.APPLIED`.
- [x] Cubrir multi-factura, pago parcial, liquidación, cobranza de ruta y
      segunda vuelta con el mismo `Payment`.
- [x] Definir idempotencia, concurrencia, timeout PAC, cancelación,
      sustitución y dependencias en PostgreSQL.
- [x] Retirar del diseño el endpoint basado en una sola factura y reservar API
      basada en `paymentId`.
- [x] Definir migración expand-backfill-validate sin inferencia fiscal legacy.
- [x] Actualizar specs canónicos y crear ADR fiscal.

## Decisiones cerradas

- La primera implementación será un REP por `Payment`; la agrupación mensual
  queda preparada en cardinalidad, pero deshabilitada.
- El pago debe distribuirse completamente entre facturas PPD elegibles; no se
  emite un REP fiscalmente parcial respecto del pago económico.
- Facturas candidatas se procesan por `issuedAt`, `uuid`, `id`; pagos por
  `paidAt`, `id`.
- Los saldos REP se calculan sobre la `Invoice` y sus aplicaciones fiscales;
  el saldo de `AccountReceivable` no sustituye esa cadena.
- Cancelación solicitada no revierte aplicaciones; solo confirmación fiscal.
- Un pago o CFDI de Ingreso con REP vigente no puede cancelarse antes de
  resolver el documento fiscal dependiente.

## Gate de implementación

CFDI-16 no agrega tablas, migración, adapter, endpoint, job, UI ni cambio de
servicio. La implementación debe comenzar con migración aditiva y pruebas RED
de contratos/concurrencia, extender el port/adapter con el payload oficial
vigente y mantener llamadas PAC fuera de transacciones largas.

## Referencias

- `specs/modules/cfdi/spec.md`
- `specs/.specs/01-architecture/architecture.md`
- `specs/.specs/02-database/database.md`
- `specs/.specs/02-database/entities.md`
- `specs/.specs/03-api/cfdi-api.md`
- `specs/.specs/05-testing/acceptance-criteria.md`
- `docs/adr/ADR-012-rep-2-payment-invoice-applications.md`

# CFDI-11-INVOICE-UI — Emisión nativa desde solicitudes aprobadas

## Objetivo

Transformar el flujo UI legacy de captura de factura externa en revisión y
emisión CFDI nativa dentro de `BillingRequestDetailPage`, reutilizando
`InvoiceReconciliationPanel`, servicios y hooks existentes.

## Alcance

- [x] Revisión server-owned de emisor, receptor, RFC, régimen, CP, UsoCFDI,
      conceptos, claves SAT, impuestos, FormaPago, MetodoPago y totales.
- [x] CTA `Emitir CFDI` para `ADMIN`/`BILLING` con `expectedVersion` y
      `Idempotency-Key` estable.
- [x] Prohibición visual de UUID, TFD, sellos, certificados y totales editables.
- [x] Estados `STAMPING`, `STAMP_UNKNOWN`, `STAMP_ERROR` y `STAMPED`; el estado
      indeterminado se muestra como reconciliable y no como error genérico.
- [x] UUID, fechas, cancelación y descargas XML/PDF mediante URL firmada cuando
      el artefacto esté disponible.
- [x] Vitest para contrato de payload, revisión, doble submit y estados críticos.

## Estado y evidencia

- Estado: COMPLETED en implementación, pruebas focalizadas y typecheck
  frontend; integración HTTP autenticada y navegador real quedan pendientes
  de infraestructura.
- Backend: detalle de BillingRequest expone `cfdiReview` calculado con
  `Prisma.Decimal` y resumen seguro de `nativeInvoice` sin `storageKey`.
- Frontend: `InvoiceReconciliationPanel` reemplaza la captura de factura
  externa sin crear un módulo paralelo.
- Pruebas focalizadas: suite `cfdiIssueUi.test.tsx` y regresiones de
  `invoiceReconciliation.test.ts`/`status.test.ts`.

## Referencias

- `frontend/src/features/billing-requests/InvoiceReconciliationPanel.tsx`
- `frontend/src/features/billing-requests/cfdiReview.ts`
- `frontend/src/features/billing-requests/billingRequestsService.ts`
- `frontend/src/features/billing-requests/hooks.ts`
- `backend/src/modules/billing-requests/billing-requests.service.ts`
- `specs/.specs/04-ui/billing-requests.md`
- `specs/modules/cfdi/spec.md`
- `docs/adr/ADR-007-native-cfdi-issue-ui.md`

# CFDI-12-STAMP-RECONCILIATION — Reconciliación de timbrado incierto

## Objetivo

Resolver `Invoice.fiscalStatus=UNKNOWN` de forma segura, sin doble timbrado,
sin locks PostgreSQL durante HTTP y sin agregar Redis/Kafka.

## Alcance

- [x] Job `@nestjs/schedule` con advisory lock PostgreSQL `71823043` y claim
      transaccional corto.
- [x] Consulta `getStatus` por `providerReference`/`correlationId` y recuperación
      de XML/PDF fuera de la transacción.
- [x] Validación de TFD UUID contra estado del proveedor y UUID persistido.
- [x] Finalización atómica `Invoice`/intentos/auditoría; estados ya `STAMPED`
      son idempotentes.
- [x] Política conservadora ante `NOT_FOUND`: reintentos de STATUS/RECOVERY
      acotados y remediación al agotar presupuesto; nunca POST `stamp` automático.
- [x] Métricas/logs sanitizados `started`, `recovered`, `not-found`,
      `still-unknown`, `failed`.
- [x] Pruebas unitarias de lock, dos instancias, proveedor encontrado, timeout
      repetido, artefactos y UUID divergente.

## Evidencia

- RED: `StampReconciliationJob` inexistente; la primera prueba falló por módulo
  ausente.
- GREEN focalizado: job y artefactos con 7 y 9 pruebas respectivamente, 0
  fallos.
- La prueba de dos instancias simula la decisión del advisory lock; la prueba
  PostgreSQL real requiere una base desechable y debe reportarse `NOT_TESTED`
  si Docker o `E2E_DATABASE_URL` no están disponibles.
- Typecheck global conserva los bloqueos preexistentes documentados en
  `modules/suppliers` y `@nestjs/mapped-types`.

## Referencias

- `backend/src/modules/cfdi/stamp-reconciliation.job.ts`
- `backend/src/modules/cfdi/stamp-reconciliation.job.spec.ts`
- `backend/src/modules/cfdi/fiscal-artifact.service.ts`
- `backend/src/modules/cfdi/fiscal-artifact.service.spec.ts`
- `docs/adr/ADR-008-stamp-reconciliation.md`
- `specs/modules/cfdi/spec.md`

# CFDI-13-CANCELLATION — Cancelación fiscal confirmada

## Objetivo

Reemplazar la cancelación operativa inmediata de `Invoice` por una frontera
fiscal que solo libera saldo y marca `CANCELLED` tras confirmación PAC/SAT.

## Alcance implementado

- [x] Motivos `01`, `02`, `03`, `04` y DTO separado con razón interna.
- [x] Persistencia aditiva de `cancellationMotiveCode`, `internalReason`,
      `replacementInvoiceId` y `replacementUuid` con migración SQL real.
- [x] Preparación `Serializable`, `expectedVersion`, idempotencia, locking,
      intento `CANCEL` y auditoría antes de la red.
- [x] Llamada PAC fuera de transacción y mapeo `PENDING`, `CANCELLED`,
      `REJECTED` y error/timeout.
- [x] Aplicaciones y saldo se mantienen reservados hasta `CANCELLED`
      confirmado; solo entonces se revierten atómicamente.
- [x] Motivo `01` resuelve un sustituto ya `STAMPED` y su UUID desde backend,
      sin aceptar UUID fiscal en el request ni sobrescribir el histórico.
- [x] Acuse de cancelación reutiliza `FiscalArtifactService` después de la
      confirmación.
- [x] Pruebas unitarias y corpus E2E PostgreSQL para éxito, pending, rechazo,
      timeout, replay, concurrencia, sustitución y liberación de saldo.

## Evidencia

- RED: la suite fiscal falló contra la semántica legacy `reason is required` y
  cancelación/reversión inmediata.
- GREEN focalizado: servicio, DTO, lectura fiscal y contrato Prisma en verde.
- El corpus PostgreSQL está creado en
  `backend/test/cfdi-cancellation.e2e-spec.ts`; ejecución real queda
  `NOT_TESTED` cuando no existe `E2E_DATABASE_URL` desechable y Docker no está
  disponible.
- Typecheck global conserva únicamente los bloqueos preexistentes de
  `modules/suppliers` y `@nestjs/mapped-types`.

## Referencias

- `backend/src/modules/billing/invoice-cancellation.service.ts`
- `backend/src/modules/billing/dto/cancel-invoice.dto.ts`
- `backend/prisma/migrations/20260823130000_add_cfdi_cancellation_fields/migration.sql`
- `backend/test/cfdi-cancellation.e2e-spec.ts`
- `docs/adr/ADR-009-confirmed-fiscal-cancellation.md`

# CFDI-14-CANCELLATION-OPERATIONS — Reconciliación asíncrona de cancelación

## Objetivo

Completar la consulta asíncrona de cancelaciones sin volver a enviar una
solicitud al PAC, liberando saldo únicamente después de confirmación fiscal.

## Criterios de implementación

- [x] Crear `CancellationStatusJob` con `@nestjs/schedule`, advisory lock
      PostgreSQL `71823044`, lotes de 50 y cron de cinco minutos.
- [x] Reclamar `CANCEL_REQUESTED`/`CANCEL_PENDING_ACCEPTANCE` persistidos como
      `cancellationStatus=PENDING`, además de `UNKNOWN` nacido de un timeout,
      en una transacción corta y consultar el PAC fuera de locks.
- [x] Crear intentos `FiscalOperationAttempt(STATUS)` derivados de correlación
      e idempotencia del intento `CANCEL`; nunca volver a llamar `cancel`.
- [x] Implementar backoff de 60 s a 15 min y límite `CFDI_MAX_RETRIES`; al
      agotar errores transitorios mantener saldo reservado y abrir
      `BillingDataRemediation`.
- [x] Finalizar `CANCELLED`, `REJECTED`, `PENDING` y `ERROR` mediante el
      servicio de cancelación existente, preservando UUID y reversión solo en
      confirmación.
- [x] Transportar `AcuseXmlBase64` de Facturama en consultas de estado y
      persistirlo como `FiscalArtifact(CANCELLATION_ACK)` mediante
      `FiscalArtifactService`.
- [x] Exponer `GET /api/billing/invoices/:id/cancellation` con RBAC
      `ADMIN/BILLING`, estado de próxima consulta, operación, acuse y auditoría
      resumida sin `storageKey`.
- [x] Reutilizar `InvoiceReconciliationPanel` para motivos SAT 01-04, razón
      interna obligatoria, sustituto solo en motivo 01, estado Pending/
      Cancelled/Rejected/Error y consulta manual sin polling agresivo.
- [x] Añadir pruebas unitarias del job, reconciliación, adapter, controller,
      servicio y estados UI.

## Evidencia

- `backend/src/modules/billing/cancellation-status.job.spec.ts` cubre lock,
  lote acotado y conteo de resultados.
- `backend/src/modules/billing/invoice-cancellation.service.spec.ts` cubre
  confirmación, pending, timeout/backoff, acuse y ausencia de reversión
  prematura.
- `backend/src/modules/cfdi/adapters/facturama/facturama.adapter.spec.ts`
  cubre acuse en `getCancellationStatus`.
- `frontend/src/features/billing-requests/__tests__/cfdiIssueUi.test.tsx`
  cubre controles SAT, motivo 01 y estado pendiente.
- La concurrencia PostgreSQL real requiere una base desechable; si no está
  disponible se reporta `NOT_TESTED`.

## Archivos relevantes

- `backend/src/modules/billing/cancellation-status.job.ts`
- `backend/src/modules/billing/invoice-cancellation.service.ts`
- `backend/src/modules/cfdi/fiscal-invoice-read.controller.ts`
- `backend/src/modules/cfdi/fiscal-invoice-read.service.ts`
- `backend/src/modules/cfdi/adapters/facturama/facturama.adapter.ts`
- `frontend/src/features/billing-requests/InvoiceReconciliationPanel.tsx`
- `docs/adr/ADR-010-async-cancellation-reconciliation.md`
- `specs/modules/cfdi/spec.md`
- `specs/.specs/03-api/cfdi-api.md`

## CFDI-18-CREDIT-NOTE

- [x] Canonizar `CreditAdjustment` como operación comercial separada de
      devolución física, inventario e `Invoice EXPENSE`.
- [x] Crear migración aditiva y snapshots inmutables por factura/concepto.
- [x] Implementar creación, aprobación e emisión idempotente/concurrente.
- [x] Extender Facturama detrás de `FiscalProviderPort` para CFDI `E`.
- [x] Reutilizar ObjectStorage, audit y reconciliación fiscal.
- [x] Agregar UI mínima en el flujo fiscal existente.
- [x] Agregar pruebas unitarias/contract para total, parcial,
      sobre-acreditación, replay, timeout y ausencia de acoplamiento a inventario.
- [ ] Ejecutar la suite de concurrencia PostgreSQL desechable de CFDI E; el
      corpus existe en `backend/test/cfdi-credit-note.e2e-spec.ts`, pero requiere
      `DATABASE_URL=E2E_DATABASE_URL` y `E2E_DATABASE_DISPOSABLE=true`.

# CFDI-19-PROVIDER-DECOUPLING — Frontera PAC verificable

## Objetivo

Eliminar dependencias concretas de Facturama en la capa de aplicación fiscal y
dejar una suite reusable que un adapter Finkok futuro deba satisfacer sin
cambiar comportamiento fiscal visible.

## Alcance implementado

- [x] `FiscalProviderPort` expone identidad opaca y capacidades normalizadas.
- [x] Ingreso, REP, Egreso y cancelación obtienen `providerKey` del port, no de
      configuración ni comparaciones contra nombres PAC.
- [x] Reconciliación y artefactos continúan consumiendo exclusivamente el port;
      operaciones históricas transportan la identidad persistida y el adapter
      falla cerrado si la clave no le corresponde.
- [x] Cancelación hereda `providerKey` del `STAMP` confirmado en lugar de usar
      la configuración activa al momento de cancelar.
- [x] `FakeFiscalProvider` usa identidad `FAKE` y declara idempotencia
      provider-side verificable sin simular Facturama.
- [x] El adapter concreto permanece encapsulado; solo el composition root lo
      importa y ya no lo exporta desde `CfdiModule`.
- [x] Prueba de arquitectura bloquea dependencias PAC concretas fuera de
      adapter/configuración/composition root.
- [x] Suite reusable cubre `stamp`, estado activo, `UNKNOWN`, cancelación,
      descarga XML/hash y replay cuando el adapter declara idempotencia propia.

## Evidencia

- RED: la prueba de frontera detectó ocho módulos de aplicación con nombres
  concretos de proveedor, incluidos emisión, REP, Egreso, cancelación,
  artefactos, repositorio y sanitización.
- GREEN: Facturama y Fake ejecutan el mismo contrato normalizado; Facturama no
  declara idempotencia provider-side y PostgreSQL conserva esa autoridad.
- No se implementa `FinkokAdapter`, configuración Finkok ni XML propio.
- No cambian endpoints, estados fiscales, inventario, ventas, pagos ni saldos.

## Referencias

- `backend/src/modules/cfdi/domain/fiscal-provider.port.ts`
- `backend/src/modules/cfdi/testing/fiscal-provider.contract.ts`
- `backend/src/modules/cfdi/provider-decoupling.contract.spec.ts`
- `backend/src/modules/cfdi/adapters/facturama/facturama.adapter.ts`
- `docs/adr/ADR-003-facturama-provider-adapter.md`
- `specs/modules/cfdi/spec.md`

# CFDI-20-QUALITY-GATE — Puerta fiscal sin timbres productivos

## Alcance implementado

- [x] CI normal fija CFDI apagado y proveedor `NONE`; no recibe secrets PAC.
- [x] Se preservan lint, typecheck, coverage y thresholds existentes.
- [x] PostgreSQL limpio ejecuta todas las migraciones y el corpus E2E fiscal.
- [x] El corpus fiscal cubre emisión/idempotencia/sobrefacturación,
      cancelación confirmada, sobre-acreditación de Egreso y advisory locks
      reales para los dos jobs de reconciliación.
- [x] Provider contracts normales usan fake y fixtures sanitizadas.
- [x] El security gate rechaza llaves/certificados, PEM privado, referencias
      fiscales crudas y XML CFDI no sintético.
- [x] Facturama real queda aislado en un workflow manual, protegido y fijo a
      sandbox; separa el contrato read-only de un documento existente del
      contrato explícito de stamp con `RUN_FACTURAMA_SANDBOX_STAMP="true"`.
      El contrato de escritura valida el mismo UUID mediante estado/XML y no
      pertenece al `test:e2e` normal.
- [x] Prisma clean deploy, backend/frontend typecheck y Docker build permanecen
      dentro del Quality Gate agregador.

## Evidencia requerida

- Unit/contract: state machine, `Decimal`, impuestos, PUE/PPD, UsoCFDI,
  ObjetoImp, mappings, cancelación, REP y Egreso.
- PostgreSQL: `backend/test/cfdi-*.e2e-spec.ts` sobre una DB declarada
  desechable. La ejecución local se reporta `NOT_TESTED` sin PostgreSQL.
- Sandbox: ejecución manual de `.github/workflows/cfdi-sandbox.yml`; nunca es
  evidencia sustituible por un run normal de PR/main.

## Referencias

- `.github/workflows/quality-gate.yml`
- `.github/workflows/cfdi-sandbox.yml`
- `scripts/validate-fiscal-assets.mjs`
- `backend/src/config/cfdi-quality-gate.contract.spec.ts`
- `backend/test/cfdi-advisory-lock.e2e-spec.ts`
- `backend/test/facturama-sandbox.e2e-spec.ts`
- `backend/test/facturama-sandbox-stamp.protected.spec.ts`
- `backend/test/jest-facturama-sandbox-stamp.json`

# CFDI-21-SECURITY-AUDIT — Auditoría de seguridad fiscal

## Objetivo

Auditar secrets, CSD, configuración, contenedores, logs, persistencia fiscal,
ObjectStorage, URLs firmadas, endpoints, RBAC/IDOR, red PAC, XML y datos
personales; corregir únicamente vulnerabilidades reproducidas.

## Vulnerabilidades demostradas y corregidas

- [x] `RepIssuanceController` y `CreditAdjustmentController` tenían metadata de
      roles sin `RolesGuard` local; ahora aplican JWT y roles en runtime.
- [x] Facturama aceptaba un host configurable arbitrario y podía enviar Basic
      auth fuera del PAC; ahora valida origen exacto por ambiente antes de
      resolver credenciales o abrir red.
- [x] La lectura del body PAC no tenía límite; ahora rechaza más de 16 MiB por
      header y durante streaming chunked, cancelando el body.
- [x] El TTL fiscal heredaba cualquier valor global de ObjectStorage; ahora se
      limita a cinco minutos sin exponer `storageKey`.
- [x] Los flujos de artefactos/reconciliación aceptaban XML con
      `DOCTYPE`/`ENTITY`; ahora fallan cerrado antes de persistencia o cambio de
      estado.
- [x] Los jobs podían registrar `error.stack` o `error.code` arbitrarios; ahora
      emiten códigos internos estables sin datos externos.

## Evidencia requerida

- Suite RED/GREEN para guards, allowlist PAC, XML seguro, logs sanitizados y
  ownership/IDOR de URLs firmadas.
- Typecheck/build backend, validador de assets fiscales, gitleaks y quality gate
  aplicable, reportando por separado cualquier infraestructura no disponible.

## Evidencia ejecutada — 2026-08-25

- RED inicial: 8 fallos/75 pases demostraron guards ausentes, host PAC
  arbitrario, XML inseguro y logs con datos externos. RED adicionales
  demostraron body PAC sin límite, acuse XML inseguro y TTL fiscal global.
- GREEN focalizado final: 8 suites/91 pruebas.
- Quality/coverage backend: 180 suites/1454 pruebas; 82.81% statements, 69.82%
  branches, 81.92% functions y 83.8% lines.
- ESLint focalizado, guard de pruebas enfocadas, política de assets fiscales y
  `git diff --check`: PASS.
- Gitleaks 8.28.0: 172 commits y superficies CFDI/config/billing/env/Compose sin
  hallazgos. Un falso positivo de fixture sintética se eliminó antes del pase.
- Typecheck global: FAIL por deuda ajena en `modules/suppliers` y dependencia
  ausente `@nestjs/mapped-types`; no hay error reportado en archivos CFDI-21.
- Build Nest: FAIL de entorno al limpiar `backend/dist` (`rmdir EPERM`), incluso
  fuera del sandbox. Docker, PostgreSQL desechable, HTTP autenticado real,
  ObjectStorage real y sandbox PAC: NOT_TESTED por infraestructura ausente.

# CFDI-22-OPERATIONS — Operación fiscal y recuperación

## Objetivo

Preparar diagnóstico y recuperación fiscal con eventos estructurados
sanitizados, runbooks accionables, alerta de expiración CSD y health fiscal sin
acoplar el arranque del ERP al PAC.

## Alcance implementado

- [x] Eventos `cfdi.stamp.*`, `cfdi.reconciliation.*`, `cfdi.cancel.*`,
      `cfdi.artifact.*` y `cfdi.rep.*` con allowlist de campos y sin XML,
      payloads, headers ni secretos.
- [x] Diez runbooks de diagnóstico/recuperación en
      `docs/runbooks/cfdi-operations.md`.
- [x] `CertificateExpiryJob` diario porque `LegalEntity` conserva vigencia
      pública CSD; usa advisory lock PostgreSQL `71823045` y ventana de 30 días.
- [x] Health fiscal local en `/api/health/dependencies`, sin consulta PAC y sin
      afectar `/api/health/ready`.
- [x] Sin Redis, segundo timbrado/cancelación automática ni escrituras SQL de
      reparación fiscal.

## Evidencia

- RED: módulos de logger/job/runbook ausentes y health sin dependencia fiscal;
  4 suites fallaron antes de implementar.
- GREEN focalizado: 11 suites, 85 pruebas, 0 fallos. Backend completo: 183
  suites, 1468 pruebas, 0 fallos.
- ESLint y Prettier focalizados; `git diff --check`: PASS.
- Typecheck fuente/build: FAIL únicamente por la deuda preexistente de
  `modules/suppliers` y `@nestjs/mapped-types`; no reportó diagnósticos en
  fuentes CFDI-22. El typecheck global de tests conserva además deuda previa.
- PostgreSQL multi-instancia, HTTP autenticado y ObjectStorage real:
  NOT_TESTED. Docker no pudo ejecutarse por `operation not permitted`, incluso
  tras solicitar ejecución fuera del sandbox.
