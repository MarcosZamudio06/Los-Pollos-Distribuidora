# Modelo de dominio: CEDIS-sucursal

## BranchSupplyCycle

Identifica `distributionCenterLocationId`, `branchLocationId`, `businessDate`, cierre opcional, estado, versión y auditoría. Conserva totales derivados de la versión vigente para lectura; nunca autoriza movimientos.

Restricciones:

- Índice parcial único por `(branchLocationId, businessDate)` cuando `status <> CANCELLED`.
- CEDIS y sucursal distintos, activos y jerárquicamente compatibles.
- `version >= 1` y `pointOfSaleDailyCloseId` único cuando exista.
- Todas las FK usan `ON DELETE RESTRICT`.

Estados: `OPEN`, `READY_FOR_REVIEW`, `CLOSED`, `CANCELLED`.

## BranchSupplyCycleTransfer

| Campo | Regla |
|---|---|
| `branchSupplyCycleId` | Ciclo obligatorio. |
| `inventoryTransferId` | Transferencia obligatoria y única globalmente. |
| `role` | `SUPPLY` o `RETURN`. |
| `linkedByUserId`, `linkedAt` | Auditoría obligatoria. |

La base protege dirección exacta según rol. El vínculo nunca se elimina al confirmar o cancelar.

## BranchSupplyCycleItem

Snapshot append-only por ciclo, versión, producto y clave. Conserva nombre/SKU/unidad/precio/costo, equivalencia aplicada y cantidades entregadas/devueltas. Campos de ventas, diferencias o utilidad solo se llenan desde fuentes y fórmulas aprobadas del cierre; suministro/refresh no inventan esos valores.

- Único `(branchSupplyCycleId, cycleVersion, snapshotKey)`.
- Valores físicos/precio/costo no negativos; factor aplicado mayor a cero.
- No permite `UPDATE` ni `DELETE`.
- Sus totales son proyección reconstruible, no stock.

## BranchSupplyCycleEvent

Evento append-only por mutación y versión. Tipos actuales: `OPENED`, `TRANSFER_LINKED`, `ITEM_SNAPSHOT_CREATED`, `READY_FOR_REVIEW`, `CLOSED`, `CANCELLED`, `REOPENED`. Debe agregarse `TRANSFER_STATE_CHANGED` para invalidaciones por confirmación/cancelación sin reutilizar semánticas incorrectas.

- Único `(branchSupplyCycleId, cycleVersion)`.
- `idempotencyKey` usa namespace de operación/recurso y es único.
- `payload` conserva hash canónico, referencias y cambio de estado.
- No permite `UPDATE` ni `DELETE`.

## Relaciones existentes

- `InventoryTransfer.branchSupplyCycleTransfer` es opcional 1:1.
- `PointOfSaleDailyClose.branchSupplyCycle` es opcional 1:1.
- `OperationalLocation` relaciona ciclos como CEDIS y sucursal mediante relaciones nombradas.
- `Product` y `ProductUnitEquivalent` relacionan snapshots históricos.
