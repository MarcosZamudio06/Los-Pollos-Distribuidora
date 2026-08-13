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

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `git diff --check` — PASS; no whitespace errors. `pnpm exec node --input-type=module -e 'import { readFileSync } from "node:fs"; const files = ["specs/.specs/04-ui/locations.md", "specs/.specs/03-api/locations-api.md", "specs/.specs/03-api/delivery-api.md", "specs/.specs/04-ui/routes-delivery.md", "specs/modules/routes-delivery/spec.md", "docs/open-decisions.md", "specs/.specs/07-workflows/task/action.md", "specs/FILE_INDEX.md"]; const docs = Object.fromEntries(files.map((file) => [file, readFileSync(file, "utf8")])); const checks = [files.every((file) => docs[file].length > 0), docs[files[0]].includes("Una alta exitosa MUST persistir únicamente una"), docs[files[0]].includes("`BRANCH` mediante"), docs[files[0]].includes("DISTRIBUTION_CENTER` activo"), docs[files[0]].includes("no es la fuente"), docs[files[0]].includes("no debe crear ni modificar"), docs[files[2]].includes("GeocodingPort"), docs[files[2]].includes("Photon es el proveedor inicial"), !docs[files[3]].includes("La planeación geoespacial utiliza React Leaflet"), docs[files[4]].includes("provider-neutral contract"), docs[files[5]].includes("Decisión: pendiente"), docs[files[3]].includes("Gate Fase 0"), docs[files[6]].includes("TASK-074"), docs[files[7]].includes(".specs/04-ui/locations.md")]; if (checks.some((check) => !check)) throw new Error(`documentation assertion failed: ${checks.findIndex((check) => !check) + 1}`); console.log(`PASS: ${checks.length} documentation assertions`);'` — PASS; 8 target artifacts, 14 required markers, canonical references, and no normative React Leaflet sentence detected. |
| Runtime harness command/scenario and exact result | N/A — this work unit changes Markdown specifications and decision records only; it adds no executable runtime boundary. |
| Rollback boundary | Revert only `specs/.specs/04-ui/locations.md`, `specs/.specs/03-api/locations-api.md`, `specs/.specs/03-api/delivery-api.md`, `specs/.specs/04-ui/routes-delivery.md`, `specs/modules/routes-delivery/spec.md`, `specs/FILE_INDEX.md`, `docs/open-decisions.md`, and this TASK-074 section in `action.md`; no application code or map infrastructure is included. |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| TASK-074 Fase 0 documental | Inline documentation contract assertions | Documentation contract | N/A — Markdown has no file-specific executable suite | PASS as RED; pre-edit assertions detected the missing `locations.md`, missing provider/gate markers, and missing TASK-074 traceability | PASS; post-edit assertions validated all 8 target artifacts and required markers | PASS; checked canonical references, absence of the former normative React Leaflet sentence, provider-neutral ports, and the explicit blocked gate | PASS; clarified conditional map wording, indexed the new canonical UI spec, and added work-unit evidence without changing runtime code |

## Referencias de la TASK

- `docs/ui/planSucursales.md`.
- `specs/.specs/04-ui/locations.md`.
- `specs/.specs/03-api/locations-api.md`.
- `specs/.specs/03-api/delivery-api.md`.
- `specs/.specs/04-ui/routes-delivery.md`.
- `specs/modules/routes-delivery/spec.md`.
- `docs/open-decisions.md`.
