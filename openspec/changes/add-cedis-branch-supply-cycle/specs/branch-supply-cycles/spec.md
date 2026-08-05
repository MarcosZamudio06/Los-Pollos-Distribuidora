# Branch Supply Cycles Specification

## Purpose

Coordinar la jornada diaria de suministro entre un CEDIS y una sucursal mediante `BranchSupplyCycle`, sin reemplazar `InventoryTransfer`, `InventoryMovement` ni `PointOfSaleDailyClose`.

## Requirements

### Requirement: Ciclo único por sucursal y fecha

El sistema MUST mantener como máximo un ciclo no cancelado para cada sucursal y fecha de negocio. El ciclo MUST registrar CEDIS, sucursal, fecha, versión y estado.

#### Scenario: Ciclo nuevo

- GIVEN dos ubicaciones activas, distintas y compatibles
- WHEN un usuario autorizado crea el ciclo para una fecha sin ciclo activo
- THEN se crea en `OPEN` y se conserva el actor de apertura.

#### Scenario: Duplicado concurrente

- GIVEN dos solicitudes para la misma sucursal y fecha
- WHEN ambas superan la consulta inicial
- THEN PostgreSQL conserva un solo ciclo no cancelado y la otra solicitud recibe conflicto.

### Requirement: Traspasos vinculados sin inventario paralelo

El sistema MUST vincular múltiples traspasos de suministro y devolución. Las cantidades MUST derivarse de `InventoryTransferItem`; el ciclo MUST NOT crear balances ni movimientos propios.

#### Scenario: Suministro y devolución

- GIVEN un ciclo activo
- WHEN se crean y confirman suministros CEDIS → sucursal y devoluciones sucursal → CEDIS
- THEN cada traspaso genera sus movimientos mediante el dominio de inventario y queda vinculado al ciclo.

#### Scenario: Dirección inválida

- GIVEN un traspaso con origen/destino que no corresponden al ciclo
- WHEN se intenta vincularlo o confirmarlo
- THEN la API rechaza la operación sin modificar balances ni crear vínculo.

### Requirement: Integración con cierre diario único

El sistema MUST asociar el ciclo al `PointOfSaleDailyClose` de la misma sucursal y fecha. El cierre diario MUST seguir siendo el único agregado que concilia ventas, caja, conteos y diferencias.

#### Scenario: Cierre relacionado

- GIVEN un ciclo activo y un cierre `DRAFT` de la misma sucursal y fecha
- WHEN se crea o abre el otro agregado
- THEN ambos quedan asociados sin copiar totales ni crear un segundo cierre.

#### Scenario: Cierre bloqueado

- GIVEN un ciclo con suministro o devolución pendiente
- WHEN se valida o cierra la jornada
- THEN la operación queda bloqueada con un error de ciclo pendiente.

### Requirement: Finalización y reapertura coordinadas

El ciclo MUST pasar a `CLOSED` solo dentro de la transacción que cierra el cierre diario. Una reapertura auditada del cierre MUST devolverlo a `OPEN`.

#### Scenario: Cierre válido

- GIVEN ciclo elegible y cierre `REVIEWED` con versión validada vigente
- WHEN `ADMIN` cierra el cierre
- THEN el cierre pasa a `CLOSED` y el ciclo a `CLOSED` atómicamente.

#### Scenario: Reapertura

- GIVEN ciclo `CLOSED` y cierre `CLOSED`
- WHEN `ADMIN` reabre con motivo y versión válidos
- THEN el cierre vuelve a `DRAFT` y el ciclo a `OPEN`.

### Requirement: Alcance y auditoría

Las lecturas y mutaciones MUST respetar rol, permiso, ubicación y versión. Toda mutación crítica MUST aceptar `Idempotency-Key` y conservar actor, fecha y motivo cuando corresponda.

#### Scenario: Vendedor fuera de alcance

- GIVEN un `SELLER` asignado a otra sucursal
- WHEN consulta o muta un ciclo ajeno
- THEN recibe `FORBIDDEN` o `LOCATION_NOT_AUTHORIZED` sin filtrar datos.

### Non-goals

- No se agrega stock global o inventario del ciclo.
- No se agregan cierres, conteos, diferencias o utilidades paralelas.
- No se modifican automáticamente inventario, ventas o pagos al cancelar/reabrir el ciclo.

## Supporting Documents

- [Reglas de negocio](../../business-rules.md)
- [Contratos API](../../api-contracts.md)
- [Criterios de aceptación](../../acceptance-criteria.md)
- [Estados](../../state-diagram.md)
- [Fórmulas](../../reconciliation-formulas.md)
- [Migración](../../migration-strategy.md)
- [Permisos](../../permissions-matrix.md)
