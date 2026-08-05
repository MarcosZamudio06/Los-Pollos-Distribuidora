# Matriz de permisos: CEDIS-sucursal

## Permisos nuevos

| Permiso | Riesgo | Descripción |
|---|---|---|
| `branch_supply_cycles.read` | standard | Consultar ciclos y resumen autorizado. |
| `branch_supply_cycles.manage` | sensitive | Crear ciclos, suministros, devoluciones y vínculos. |
| `branch_supply_cycles.cancel` | critical | Cancelar ciclos con motivo y versión. |
| `cedis.view` | standard | Consultar jerarquía y operación CEDIS autorizada. |
| `cedis.manage` | critical | Administrar configuración y jerarquía CEDIS. |
| `cedis.dispatch` | sensitive | Despachar inventario desde CEDIS. |
| `cedis.receive_returns` | sensitive | Recibir devoluciones autorizadas. |
| `cedis.reconcile` | critical | Conciliar operación CEDIS. |
| `cedis.close` | critical | Cerrar operación CEDIS. |
| `cedis.view_costs` | sensitive | Consultar costos/utilidad CEDIS. |

## Matriz por rol

| Acción | ADMIN | WAREHOUSE | SELLER | COLLECTIONS | DRIVER | BILLING |
|---|---:|---:|---:|---:|---:|---:|
| Listar ciclos | Sí, global | Sí, CEDIS asignado | Sí, sucursal asignada | No | No | No |
| Ver detalle | Sí, global | Sí, CEDIS asignado | Sí, sucursal asignada | No | No | No |
| Crear ciclo | Sí | Sí, CEDIS asignado | No | No | No | No |
| Crear suministro | Sí | Sí, CEDIS asignado | No | No | No | No |
| Crear devolución | Sí | Sí, CEDIS asignado | No | No | No | No |
| Vincular traspaso pendiente | Sí | Sí, CEDIS asignado | No | No | No | No |
| Confirmar/cancelar traspaso | Reglas actuales + ciclo | Reglas actuales + ciclo | No | No | No | No |
| Cancelar ciclo | Sí, con permiso crítico | No por default | No | No | No | No |
| Validar cierre diario | Reglas actuales | Proyección inventario | Su sucursal | Proyección autorizada | No | No |
| Revisar/cerrar/reabrir cierre | Reglas actuales de `ADMIN` | No | No | No | No | No |
| Ver costos/utilidad | Según `costs.read` | Según `costs.read` | No | No | No | No |

## Alcance

- `ADMIN` puede elegir ubicaciones activas compatibles.
- `WAREHOUSE` debe tener `operationalLocationId` igual al CEDIS del ciclo.
- `SELLER` debe tener `operationalLocationId` igual a la sucursal del ciclo.
- `GET /api/locations/:cedisId/branches` exige `cedis.view`; solo `ADMIN` o `WAREHOUSE` asignado al CEDIS puede usarlo. `SELLER` conserva el permiso para capacidades futuras, pero no consulta este endpoint.
- El backend debe aplicar alcance aunque el frontend o query envíe otra ubicación.
- `branch_supply_cycles.manage` no concede permisos de inventario fuera de las reglas actuales.
- `branch_supply_cycles.cancel` no permite cancelar cierres ni revertir movimientos.

## UI

La navegación CEDIS se muestra a `ADMIN`, `WAREHOUSE` y `SELLER`, pero las acciones se filtran además por permiso y alcance. `COLLECTIONS`, `DRIVER` y `BILLING` reciben 403/ruta oculta y no deben recibir datos parciales.

## Auditoría

Crear, vincular, confirmar, cancelar, reabrir y completar conservan actor, timestamp, versión y motivo cuando aplique. Las proyecciones de `SELLER` no contienen costos, utilidad ni datos sensibles de otras sucursales.
