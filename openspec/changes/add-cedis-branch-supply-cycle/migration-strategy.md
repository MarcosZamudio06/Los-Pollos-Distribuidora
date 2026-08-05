# Estrategia de migración: CEDIS-sucursal

## Estado actual

La migración `20260804120000_add_branch_supply_cycle` ya creó modelos, enums, snapshots, eventos, FK, triggers e índices. Las migraciones posteriores ya protegen la jerarquía `DISTRIBUTION_CENTER` → `BRANCH`. No debe recrearse esta base.

## Alineación pendiente

1. Sustituir el índice parcial activo `(distributionCenterLocationId, branchLocationId, businessDate)` por `(branchLocationId, businessDate)` para cumplir unicidad por sucursal/fecha.
2. Agregar `TRANSFER_STATE_CHANGED` a `BranchSupplyCycleEventType` para auditar confirmación/cancelación vinculada.
3. Mantener `ITEM_SNAPSHOT_CREATED` para refresh y compatibilidad con snapshots existentes.
4. Validar que eventos e items continúen append-only y todas las FK usen `ON DELETE RESTRICT`.
5. No modificar `InventoryBalance`, `InventoryMovement`, ventas, pagos ni cierres históricos.

La migración debe ejecutar un preflight antes de cambiar el índice. Si detecta más de un ciclo activo para la misma sucursal/fecha, detiene el despliegue y genera un reporte; no cancela ciclos automáticamente.

## Permisos

Reutilizar de forma idempotente los permisos canónicos ya existentes:

- `cedis.view`
- `cedis.manage`
- `cedis.dispatch`
- `cedis.receive_returns`
- `cedis.reconcile`
- `cedis.close`
- `cedis.view_costs`

No crear permisos paralelos `branch_supply_cycles.*`.

## Backfill

El backfill histórico solo usa un mapa aprobado sucursal → CEDIS y fechas explícitas.

1. Crear/reutilizar ciclo por sucursal/fecha.
2. Vincular cierre solo con sucursal y fecha exactas.
3. Vincular transferencias solo con dirección inequívoca y sin vínculo previo.
4. Registrar traspasos ambiguos, ciclos sin suministro y conflictos de unicidad.
5. No crear movimientos, cambiar balances ni fabricar snapshots de fuentes incompletas.

## Rollout

1. Aplicar alineación de índice/enum y verificar constraints.
2. Desplegar núcleo transaccional reutilizable de inventario.
3. Desplegar lecturas CEDIS.
4. Desplegar apertura, suministro, devolución, refresh y cancelación.
5. Activar protección de confirmación/cancelación vinculada.
6. Integrar validación/cierre diario.

## Rollback

Detener comandos nuevos y conservar lectura/historial. No revertir movimientos o balances. Antes de retirar estructuras nuevas, exportar dependencias y confirmar que ningún ciclo, vínculo, snapshot o evento activo las usa.
