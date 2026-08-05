# Module Spec — Ciclos de suministro CEDIS-sucursal

## Objetivo

Coordinar la jornada de suministro entre un CEDIS y una sucursal mediante ciclos que vinculan traspasos de inventario, sin crear stock ni movimientos paralelos.

## Requisitos

### Ciclo único y ubicaciones

El sistema MUST mantener como máximo un ciclo no cancelado por sucursal y fecha de negocio. El CEDIS MUST ser una ubicación activa `DISTRIBUTION_CENTER` y la sucursal una hija directa activa `BRANCH`.

#### Scenario: Apertura válida

- GIVEN CEDIS y sucursal compatibles sin ciclo activo para la fecha
- WHEN un usuario autorizado abre el ciclo
- THEN el ciclo queda `OPEN` con actor, fecha, versión y evento auditables

#### Scenario: Apertura concurrente

- GIVEN dos solicitudes para la misma sucursal y fecha
- WHEN se ejecutan concurrentemente
- THEN PostgreSQL conserva un solo ciclo activo y la otra solicitud recibe conflicto

### Suministros y devoluciones

El sistema MUST admitir múltiples suministros CEDIS → sucursal y múltiples devoluciones sucursal → CEDIS. Cada operación MUST crear un `InventoryTransfer` `REQUESTED` y vincularlo una sola vez al ciclo.

#### Scenario: Creación sin movimiento

- GIVEN un ciclo mutable y partidas válidas
- WHEN se registra un suministro o devolución
- THEN transferencia, vínculo y auditoría se crean atómicamente
- AND no cambia ningún balance ni se crea movimiento

### Confirmación y cancelación

Los comandos existentes de inventario MUST seguir siendo la única vía para confirmar o cancelar transferencias. Confirmar MUST aplicar `TRANSFER_OUT` y `TRANSFER_IN` atómicamente; cancelar MUST limitarse a transferencias no confirmadas.

#### Scenario: Confirmación con stock

- GIVEN una transferencia vinculada y stock suficiente en origen
- WHEN el destino confirma la recepción
- THEN inventario genera ambos movimientos y el ciclo queda invalidado para nuevo refresh

#### Scenario: Corrección posterior

- GIVEN una transferencia `CONFIRMED`
- WHEN se solicita cancelarla
- THEN la operación se rechaza y cualquier corrección requiere operación compensatoria auditable

### Refresh y elegibilidad

El sistema MUST reconstruir snapshots append-only desde transferencias y movimientos confirmados. `DRAFT`, `REQUESTED` e `IN_TRANSIT` MUST bloquear revisión; `CANCELLED` MUST conservarse con contribución cero.

#### Scenario: Ciclo listo

- GIVEN al menos un suministro confirmado, cero pendientes e integridad válida
- WHEN se refresca el ciclo
- THEN crea una nueva versión de snapshot y pasa a `READY_FOR_REVIEW`

#### Scenario: Ciclo cerrado

- GIVEN un ciclo `CLOSED` o `CANCELLED`
- WHEN se intenta suministrar, devolver o refrescar
- THEN la operación se rechaza sin modificar historial

### Unidades, idempotencia y concurrencia

El sistema MUST mantener KG y PIECE como dimensiones separadas, exigir piezas enteras y MUST NOT convertir sin equivalencia oficial aplicable. Todo comando MUST ser transaccional, versionado e idempotente.

#### Scenario: Reintento seguro

- GIVEN una clave ya usada con el mismo payload
- WHEN se repite el comando
- THEN devuelve el resultado original sin duplicar ciclo, transferencia, vínculo, snapshot o movimiento

#### Scenario: Stock concurrente

- GIVEN dos confirmaciones que compiten por el mismo saldo
- WHEN el stock solo alcanza para una
- THEN una confirma y la otra recibe stock insuficiente sin saldo negativo

## Permisos

- `cedis.view`: lectura dentro del alcance.
- `cedis.dispatch`: suministros desde el CEDIS asignado.
- `cedis.receive_returns`: devoluciones hacia el CEDIS asignado.
- `cedis.reconcile`: refresh y conciliación.
- `cedis.close`: cierre coordinado.
- `cedis.view_costs`: costos y utilidad.

## Contratos relacionados

- `specs/.specs/03-api/branch-supply-cycles-api.md`.
- `specs/.specs/03-api/inventory-transfers-api.md`.
- `specs/modules/inventory/spec.md`.
- `specs/modules/point-of-sale-closing/spec.md`.
