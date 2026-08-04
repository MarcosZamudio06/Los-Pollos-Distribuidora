# Modelo de dominio y relaciones Prisma

## `BranchSupplyCycle`

| Campo | Tipo / regla |
|---|---|
| `id` | `String @id @default(cuid())` |
| `cedisLocationId` | FK obligatoria a `OperationalLocation` |
| `branchLocationId` | FK obligatoria a `OperationalLocation` |
| `businessDate` | `DateTime @db.Date` |
| `status` | `BranchSupplyCycleStatus`, default `ACTIVE` |
| `version` | `Int`, default `1` |
| `notes` | `String?` |
| `createdByUserId` | FK obligatoria a `User` |
| `cancelledByUserId` | FK opcional a `User` |
| `cancelledAt` | `DateTime?` |
| `cancellationReason` | `String?`, obligatorio al cancelar |
| `createdAt`, `updatedAt` | Auditoría estándar |

Relaciones:

- `cedisLocation` y `branchLocation` usan relaciones Prisma nombradas distintas hacia `OperationalLocation`.
- `createdBy` y `cancelledBy` usan relaciones Prisma nombradas distintas hacia `User`.
- `transfers: BranchSupplyCycleTransfer[]`.
- `dailyCloses: PointOfSaleDailyClose[]` para conservar cierres cancelados históricos.

## `BranchSupplyCycleTransfer`

| Campo | Tipo / regla |
|---|---|
| `id` | `String @id @default(cuid())` |
| `branchSupplyCycleId` | FK obligatoria |
| `inventoryTransferId` | FK obligatoria y `@unique` |
| `kind` | `SUPPLY` o `RETURN` |
| `linkedByUserId` | FK obligatoria a `User` |
| `linkedAt` | `DateTime @default(now())` |

Relaciones:

- `branchSupplyCycle` → `BranchSupplyCycle`.
- `inventoryTransfer` → `InventoryTransfer`.
- `linkedBy` → `User`.

## Extensiones existentes

- `PointOfSaleDailyClose.branchSupplyCycleId String?` y relación opcional a `BranchSupplyCycle`.
- `InventoryTransfer.branchSupplyCycleTransfer BranchSupplyCycleTransfer?`.
- `OperationalLocation.cedisSupplyCycles` y `branchSupplyCycles` con nombres de relación explícitos.
- `User.createdBranchSupplyCycles`, `cancelledBranchSupplyCycles` y `linkedBranchSupplyCycleTransfers`.

## Restricciones

- `cedisLocationId <> branchLocationId`.
- `version >= 1`.
- Índice parcial único de ciclo por `(branchLocationId, businessDate)` cuando `status <> 'CANCELLED'`.
- Índice parcial único de cierre por `branchSupplyCycleId` cuando el cierre no está `CANCELLED`.
- Todas las FK nuevas usan `ON DELETE RESTRICT`.
- No se agregan columnas de cantidad, costo, utilidad o saldo al ciclo.

## Estados

`ACTIVE`, `COMPLETED`, `CANCELLED`. El ciclo no replica los estados de `PointOfSaleDailyClose` ni de `InventoryTransfer`; expone esos estados en sus proyecciones.
