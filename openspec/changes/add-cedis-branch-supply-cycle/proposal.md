# Proposal: Ciclo de suministro CEDIS-sucursal

## Intent

Implementar un módulo backend `cedis` que abra ciclos y coordine múltiples suministros y devoluciones entre un CEDIS y una sucursal. El ciclo reutiliza `InventoryTransfersService`; no crea inventario, movimientos ni un cierre diario paralelo.

## Scope

### In Scope

- Contratos bajo `/api/cedis/branch-supply-cycles` para abrir, consultar, suministrar, devolver, refrescar y cancelar ciclos.
- Creación transaccional de `InventoryTransfer` `REQUESTED` y su vínculo como `SUPPLY` o `RETURN`.
- Reutilización de los comandos existentes de inventario para confirmar y cancelar transferencias.
- Snapshots append-only derivados de transferencias y movimientos confirmados.
- Idempotencia, control de versión, concurrencia, stock insuficiente, productos/ubicaciones inactivas y unidades KG/PIECE.
- Coordinación con `PointOfSaleDailyClose` para bloquear, cerrar y reabrir de forma consistente.

### Out of Scope

- Reservas de stock para transferencias pendientes.
- Conversión kilo-pieza mientras no exista política de redondeo aprobada.
- Reversa automática de transferencias confirmadas.
- Inventario, caja, ventas, utilidades o cierres paralelos.
- Devoluciones de ruta, que permanecen bajo `RouteSettlement` y `ROUTE_STOCK`.

## Capabilities

### New Capabilities

- `branch-supply-cycles`: Coordina la jornada CEDIS-sucursal y sus transferencias vinculadas.

### Modified Capabilities

- None. Las integraciones requeridas con inventario y cierre diario se especifican dentro de la nueva capacidad y en los specs canónicos correspondientes.

## Approach

`BranchSupplyCycle` conserva identidad, estado, versión, auditoría y proyecciones derivadas. `BranchSupplyCycleTransfer` vincula cada `InventoryTransfer` una sola vez. Los saldos y movimientos permanecen exclusivamente en inventario; el cierre diario conserva conciliación, caja, ventas y diferencias.

Crear suministro/devolución no confirma recepción: produce una transferencia `REQUESTED`. La confirmación ocurre mediante `/api/inventory-transfers/:id/confirm` cuando el destino recibe físicamente el producto. `refresh` reconstruye snapshots y elegibilidad; nunca confirma ni corrige operaciones.

## Dependencies

- `specs/modules/branch-supply-cycles/spec.md`.
- `specs/.specs/03-api/branch-supply-cycles-api.md`.
- Jerarquía CEDIS/sucursal y permisos CEDIS ya implementados.
- `InventoryTransfersService`, Prisma/PostgreSQL y cierre diario existentes.

## Success Criteria

- [ ] Un ciclo único por sucursal/fecha admite múltiples suministros y devoluciones.
- [ ] Crear/vincular no cambia stock; confirmar genera exactamente salida/entrada mediante inventario.
- [ ] Reintentos, carreras y stock insuficiente no dejan efectos parciales ni duplicados.
- [ ] Refresh produce snapshots coherentes sin conversiones o fórmulas inventadas.
- [ ] Ciclos cerrados/cancelados preservan historia y rechazan mutaciones operativas.
