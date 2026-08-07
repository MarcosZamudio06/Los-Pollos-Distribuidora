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
- [x] Registrar faltantes como `SHRINKAGE` y sobrantes como `IN` con referencia de recepción.
- [x] Rechazar reservas ausentes o incompatibles con `INVENTORY_RESERVATION_INTEGRITY_ERROR` sin reconstruir stock.
- [x] Confirmar el traspaso, incrementar la versión del ciclo e invalidar su reconciliación mediante evento auditable.
- [x] Preservar reintentos serializables e idempotentes sin duplicar movimientos, eventos ni versionados.
- [x] Cubrir confirmación, recepción exacta, faltantes, sobrantes, idempotencia y ausencia de movimientos duplicados.

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
