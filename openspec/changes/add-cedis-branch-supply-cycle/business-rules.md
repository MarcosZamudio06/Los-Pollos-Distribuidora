# Reglas de negocio: CEDIS-sucursal

## Invariantes

1. `BranchSupplyCycle` coordina una sucursal, un CEDIS y una fecha; no es una ubicación ni un libro de inventario.
2. `distributionCenterLocationId` MUST referenciar una ubicación activa `DISTRIBUTION_CENTER`. `branchLocationId` MUST referenciar una ubicación activa `BRANCH` cuyo `parentId` sea el CEDIS.
3. CEDIS y sucursal MUST ser distintos. `DISTRIBUTION_CENTER` tiene `parentId=null`; el árbol de ubicaciones no permite ciclos.
4. Solo puede existir un ciclo no cancelado por sucursal y fecha.
5. Un ciclo puede vincular múltiples transferencias `SUPPLY` y `RETURN`; cada traspaso solo puede vincularse una vez.
6. `SUPPLY` MUST tener dirección CEDIS → sucursal. `RETURN` MUST tener dirección sucursal → CEDIS.
7. Los traspasos `DRAFT`, `REQUESTED` e `IN_TRANSIT` no cambian inventario; `CONFIRMED` genera exactamente `TRANSFER_OUT` y `TRANSFER_IN` mediante el módulo existente.
8. El ciclo MUST NOT persistir cantidades, balances, movimientos, conteos físicos, diferencias monetarias ni utilidad duplicados.
9. Un suministro o devolución pendiente bloquea la validación/cierre de la jornada.
10. Debe existir al menos un suministro confirmado para que la jornada sea elegible para cierre.
11. Un traspaso confirmado requiere un movimiento de salida y uno de entrada por partida, con producto y cantidades coincidentes.
12. Confirmar/cancelar un traspaso vinculado MUST invalidar una validación vigente del cierre `DRAFT` y aumentar su versión.
13. Un ciclo no puede cancelarse si tiene cierre no cancelado o traspasos no cancelados. Cancelar el ciclo no revierte inventario.
14. El cierre diario conserva exclusivamente las transiciones, snapshots, caja, ventas, conteos y diferencias ya definidas por `PointOfSaleDailyClose`.
15. Una devolución confirmada se contabiliza una sola vez como salida `TRANSFER_OUT` en la conciliación del cierre; no se resta adicionalmente mediante un campo del ciclo.
16. `ADMIN` tiene alcance global; `WAREHOUSE` opera desde CEDIS; `SELLER` solo consulta el ciclo de su sucursal. `COLLECTIONS`, `DRIVER` y `BILLING` no acceden.
17. Las cantidades en kg y piezas se mantienen separadas. No existe conversión sin equivalencia oficial aprobada.
18. Todas las operaciones críticas MUST ser transaccionales e idempotentes.

## Componentes actuales

- `InventoryBalance` y `InventoryMovement` siguen siendo la fuente de stock y trazabilidad.
- `InventoryTransfer` y `InventoryTransfersService` siguen creando y confirmando movimientos.
- `PointOfSaleDailyClose` y `PointOfSaleDailyCloseService` siguen calculando y cerrando la jornada.
- `RouteSettlement` permanece separado; las devoluciones de ruta no se convierten en ciclos CEDIS.
