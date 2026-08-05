# Modelo de dominio y relaciones Prisma

## `BranchSupplyCycle`

| Campo | Tipo / regla |
|---|---|
| `id` | `String @id @default(cuid())` |
| `distributionCenterLocationId` | FK obligatoria a `OperationalLocation` de tipo `DISTRIBUTION_CENTER` |
| `branchLocationId` | FK obligatoria a `OperationalLocation` |
| `businessDate` | `DateTime @db.Date` |
| `pointOfSaleDailyCloseId` | FK opcional al único cierre de la sucursal/fecha |
| `status` | `BranchSupplyCycleStatus`, default `OPEN` |
| `version` | `Int`, default `1` |
| `notes` | `String?` |
| `openedByUserId` | FK obligatoria a `User` |
| `reviewedByUserId`, `closedByUserId` | FK opcionales a `User` |
| `cancelledByUserId` | FK opcional a `User` |
| `cancelledAt` | `DateTime?` |
| `cancellationReason` | `String?`, obligatorio al cancelar |
| `reopenedByUserId`, `reopenedAt`, `reopeningReason` | Auditoría de reapertura |
| `createdAt`, `updatedAt` | Auditoría estándar |

Relaciones:

- `distributionCenterLocation` y `branchLocation` usan relaciones Prisma nombradas distintas hacia `OperationalLocation`.
- `openedBy`, `reviewedBy`, `closedBy`, `cancelledBy` y `reopenedBy` usan relaciones Prisma nombradas distintas hacia `User`.
- `transfers: BranchSupplyCycleTransfer[]`.
- `pointOfSaleDailyClose` es opcional y conserva el vínculo con el cierre de la sucursal.
- `items` y `events` conservan snapshots y auditoría append-only.

## `BranchSupplyCycleTransfer`

| Campo | Tipo / regla |
|---|---|
| `id` | `String @id @default(cuid())` |
| `branchSupplyCycleId` | FK obligatoria |
| `inventoryTransferId` | FK obligatoria y `@unique` |
| `role` | `SUPPLY` o `RETURN` |
| `linkedByUserId` | FK obligatoria a `User` |
| `linkedAt` | `DateTime @default(now())` |

Relaciones:

- `branchSupplyCycle` → `BranchSupplyCycle`.
- `inventoryTransfer` → `InventoryTransfer`.
- `linkedBy` → `User`.

## Extensiones existentes

- `PointOfSaleDailyClose.branchSupplyCycleId String?` y relación opcional a `BranchSupplyCycle`.
- `InventoryTransfer.branchSupplyCycleTransfer BranchSupplyCycleTransfer?`.
- `OperationalLocation.distributionCenterSupplyCycles` y `branchSupplyCycles` con nombres de relación explícitos.
- `User` conserva relaciones de apertura, revisión, cierre, cancelación, reapertura y vínculo de transferencias.

## Restricciones

- `distributionCenterLocationId <> branchLocationId`.
- `version >= 1`.
- Índice parcial único de ciclo por `(distributionCenterLocationId, branchLocationId, businessDate)` cuando `status <> 'CANCELLED'`.
- Índice único de `pointOfSaleDailyCloseId` cuando no es nulo.
- Todas las FK nuevas usan `ON DELETE RESTRICT`.
- No se agregan columnas de cantidad, costo, utilidad o saldo al ciclo.

## `OperationalLocation` CEDIS

- Un CEDIS es `DISTRIBUTION_CENTER` y siempre tiene `parentId=null`.
- Una sucursal CEDIS es `BRANCH` con `parentId` apuntando al CEDIS activo.
- La relación padre/hija no permite ciclos directos ni transitivos.
- La consulta de sucursales CEDIS solo devuelve hijas `BRANCH` activas directas.

## Estados

`OPEN`, `READY_FOR_REVIEW`, `CLOSED`, `CANCELLED`. El ciclo no replica los estados de `PointOfSaleDailyClose` ni de `InventoryTransfer`; expone esos estados en sus proyecciones.
