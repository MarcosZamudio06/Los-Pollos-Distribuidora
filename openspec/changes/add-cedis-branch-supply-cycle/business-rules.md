# Reglas de negocio: CEDIS-sucursal

## Invariantes

1. El ciclo coordina una sucursal, un CEDIS y una fecha; no es una ubicación ni una fuente de stock.
2. Solo existe un ciclo no cancelado por sucursal y fecha.
3. CEDIS activo `DISTRIBUTION_CENTER`; sucursal activa `BRANCH` hija directa; ubicaciones distintas.
4. Un ciclo admite múltiples `SUPPLY` y `RETURN`; cada transferencia se vincula una sola vez.
5. `SUPPLY` usa CEDIS → sucursal; `RETURN` usa sucursal → CEDIS.
6. Crear suministro/devolución produce `InventoryTransfer` `REQUESTED`; no cambia balances ni movimientos.
7. `DRAFT`, `REQUESTED` e `IN_TRANSIT` son pendientes y no cambian inventario.
8. Solo `CONFIRMED` genera `TRANSFER_OUT` y `TRANSFER_IN` mediante `InventoryTransfersService`.
9. `DRAFT`, `REQUESTED` e `IN_TRANSIT` pueden cancelarse con motivo; `CONFIRMED` requiere corrección compensatoria.
10. Confirmar/cancelar un traspaso vinculado incrementa la versión, devuelve el ciclo a `OPEN` e invalida una validación vigente del cierre `DRAFT`.
11. Refresh deriva snapshots desde partidas y movimientos; nunca confirma, cancela ni repara fuentes.
12. Solo se alcanza `READY_FOR_REVIEW` con suministro confirmado, cero pendientes e integridad válida.
13. `CLOSED` y `CANCELLED` rechazan suministros, devoluciones y refresh.
14. El cierre diario sigue siendo el único agregado de conciliación; cierre/reapertura sincroniza ambos agregados atómicamente.
15. Una devolución confirmada participa una sola vez como `TRANSFER_OUT` en la sucursal.
16. KG y PIECE permanecen separados. Conversión exige equivalencia oficial aplicable y política de redondeo aprobada.
17. Productos/ubicaciones deben estar activos al crear y confirmar; su desactivación posterior no borra historia.
18. Toda mutación es transaccional, versionada, idempotente y respetuosa del alcance operativo.

## Fuentes de verdad

- `InventoryBalance`: existencia por producto y ubicación.
- `InventoryMovement`: trazabilidad de entradas/salidas.
- `InventoryTransfer` y partidas: solicitud, dirección, cantidades y estado.
- `BranchSupplyCycleItem`: proyección append-only reconstruible, nunca autoridad de stock.
- `PointOfSaleDailyClose`: ventas, caja, conteos, diferencias y cierre de jornada.
- `RouteSettlement`: devoluciones de ruta; no se convierten en ciclos CEDIS.
