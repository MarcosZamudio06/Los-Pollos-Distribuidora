# Estrategia de migración: CEDIS-sucursal

## Esquema

1. Crear `BranchSupplyCycleStatus` (`ACTIVE`, `COMPLETED`, `CANCELLED`) y `BranchSupplyCycleTransferKind` (`SUPPLY`, `RETURN`).
2. Crear `BranchSupplyCycle` con CEDIS, sucursal, fecha, versión, auditoría y motivo de cancelación.
3. Crear `BranchSupplyCycleTransfer` con vínculo único a `InventoryTransfer`, clasificación y auditoría.
4. Agregar `PointOfSaleDailyClose.branchSupplyCycleId` nullable.
5. Agregar FK `ON DELETE RESTRICT`, índices por ubicación/fecha/estado y restricciones de versión/ubicaciones distintas.
6. Crear por SQL el índice parcial único de ciclo `(branchLocationId, businessDate)` para estados distintos de `CANCELLED`.
7. Crear por SQL el índice parcial que limite a un cierre no cancelado por ciclo.

## Permisos

Insertar de forma idempotente:

- `branch_supply_cycles.read`
- `branch_supply_cycles.manage`
- `branch_supply_cycles.cancel`

Asignar defaults a roles canónicos sin eliminar asignaciones personalizadas.

## Backfill

El backfill requiere un archivo/configuración de mapeo aprobado `branchLocationId -> cedisLocationId`. No usa `parentId`, nombre, código ni proximidad como inferencia automática.

Para cada pareja y fecha:

1. Crear o reutilizar ciclo activo de forma idempotente.
2. Vincular un cierre existente solo si coincide exactamente sucursal y fecha.
3. Vincular traspasos confirmados solo si su dirección coincide y no tienen vínculo previo.
4. Registrar ambigüedades, ciclos sin suministro y traspasos no clasificables en un reporte de revisión.
5. No crear ni actualizar `InventoryBalance`, `InventoryMovement`, ventas, pagos, conteos o snapshots.

## Rollout

1. Aplicar tablas, columnas nullable, constraints y permisos.
2. Desplegar lecturas y respuestas compatibles.
3. Desplegar comandos de ciclo y validaciones de traspaso.
4. Desplegar asociación/integración de cierre diario.
5. Desplegar UI y dashboard.
6. Ejecutar backfill aprobado y revisar el reporte.
7. Activar bloqueo de cierre por pendientes después de validar datos.

## Rollback

Detener comandos nuevos y ocultar UI; mantener lectura e historial. Si es imprescindible revertir, exportar ciclos y vínculos, eliminar primero dependencias nuevas y después tablas/columnas nuevas. No revertir movimientos ni balances generados por traspasos confirmados.

## Verificaciones

- Migración aplicable sobre una base con y sin cierres existentes.
- Reejecución sin duplicar permisos, ciclos ni vínculos.
- Índices parciales presentes en PostgreSQL.
- Backfill sin ambigüedades modificando inventario.
