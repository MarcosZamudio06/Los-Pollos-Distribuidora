# Branch Supply Cycles Specification

## Purpose

Coordinar la jornada CEDIS-sucursal mediante transferencias de inventario vinculadas y snapshots derivados.

## Requirements

### Requirement: Ciclo único y autorizado

El sistema MUST mantener como máximo un ciclo no cancelado por sucursal y fecha. CEDIS y sucursal MUST estar activos y formar una jerarquía `DISTRIBUTION_CENTER` → `BRANCH` directa.

#### Scenario: Apertura concurrente

- GIVEN dos comandos para la misma sucursal y fecha
- WHEN se ejecutan concurrentemente
- THEN solo persiste un ciclo `OPEN`
- AND el otro comando recibe `BRANCH_SUPPLY_CYCLE_ALREADY_EXISTS`

### Requirement: Transferencias vinculadas

El sistema MUST admitir múltiples `SUPPLY` CEDIS → sucursal y `RETURN` sucursal → CEDIS. Cada comando MUST crear un `InventoryTransfer` `REQUESTED` y vincularlo una sola vez, sin movimientos.

#### Scenario: Suministro y devolución

- GIVEN un ciclo mutable y partidas válidas
- WHEN se registra cada operación
- THEN transferencia, vínculo, evento y versión se persisten atómicamente
- AND ningún balance cambia

### Requirement: Ciclo de vida delegado a inventario

El sistema MUST confirmar y cancelar transferencias mediante los contratos existentes de inventario. Confirmar MUST crear ambos movimientos; cancelar MUST limitarse a estados no confirmados.

#### Scenario: Confirmación concurrente

- GIVEN transferencias que compiten por stock limitado
- WHEN se confirman concurrentemente
- THEN solo confirman las que tengan stock disponible
- AND nunca existe saldo negativo ni efecto parcial

#### Scenario: Transferencia confirmada

- GIVEN una transferencia `CONFIRMED`
- WHEN se intenta cancelar
- THEN se rechaza sin alterar movimientos ni vínculo

### Requirement: Refresh derivado

El sistema MUST crear snapshots append-only desde transferencias y movimientos. Solo `CONFIRMED` contribuye; `DRAFT`, `REQUESTED` e `IN_TRANSIT` bloquean revisión; `CANCELLED` aporta cero.

#### Scenario: Elegibilidad

- GIVEN suministro confirmado, cero pendientes e integridad válida
- WHEN se refresca con versión vigente
- THEN crea una nueva versión y pasa a `READY_FOR_REVIEW`

#### Scenario: Integridad inválida

- GIVEN partidas y movimientos con totales diferentes
- WHEN se refresca o valida el cierre
- THEN se reporta `BRANCH_SUPPLY_CYCLE_INTEGRITY_ERROR`
- AND no se marca listo ni se corrigen fuentes

### Requirement: Estados terminales y cierre

El sistema MUST rechazar suministros, devoluciones y refresh en `CLOSED` o `CANCELLED`. El ciclo MUST cerrar y reabrir en la misma transacción que el cierre diario relacionado.

#### Scenario: Cierre coordinado

- GIVEN ciclo `READY_FOR_REVIEW` y cierre `REVIEWED` vigentes
- WHEN `ADMIN` cierra la jornada
- THEN ambos pasan a `CLOSED` atómicamente

### Requirement: Unidades, idempotencia y alcance

El sistema MUST mantener KG y PIECE separados, MUST NOT convertir sin equivalencia/redondeo aprobados y MUST exigir idempotencia y versión en comandos. Lecturas y mutaciones MUST respetar permiso y ubicación.

#### Scenario: Reintento con deriva

- GIVEN una clave ya aplicada
- WHEN se repite con payload distinto
- THEN responde `IDEMPOTENCY_CONFLICT`
- AND no crea ciclo, transferencia, vínculo, snapshot o movimiento adicional
