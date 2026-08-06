# Matriz de permisos: CEDIS-sucursal

## Permisos canónicos

| Permiso                 | Riesgo    | Uso                                                    |
| ----------------------- | --------- | ------------------------------------------------------ |
| `cedis.view`            | standard  | Consultar ciclos dentro del alcance.                   |
| `cedis.manage`          | critical  | Administrar jerarquía/configuración CEDIS.             |
| `cedis.dispatch`        | sensitive | Abrir ciclos y crear suministros desde CEDIS asignado. |
| `cedis.receive_returns` | sensitive | Crear/recibir devoluciones hacia CEDIS asignado.       |
| `cedis.reconcile`       | critical  | Ejecutar refresh y validar integridad.                 |
| `cedis.close`           | critical  | Cancelar ciclo y coordinar cierre.                     |
| `cedis.view_costs`      | sensitive | Consultar costos/utilidad.                             |

No se crean permisos `branch_supply_cycles.*`; duplicarían el dominio de autorización ya implementado.

## Matriz por rol

| Acción                           |                            ADMIN |                                  WAREHOUSE |                        SELLER | Otros |
| -------------------------------- | -------------------------------: | -----------------------------------------: | ----------------------------: | ----: |
| Listar/ver detalle               |                           Global |                             CEDIS asignado | Sucursal asignada, sin costos |    No |
| Abrir ciclo                      |                               Sí |        CEDIS asignado con `cedis.dispatch` |                            No |    No |
| Crear suministro                 |                               Sí |        CEDIS asignado con `cedis.dispatch` |                            No |    No |
| Crear devolución                 |                               Sí | CEDIS asignado con `cedis.receive_returns` |                            No |    No |
| Confirmar/cancelar transferencia |        Reglas inventario + ciclo |    Reglas inventario + ubicación receptora |                            No |    No |
| Refresh                          |                               Sí |                 Solo con `cedis.reconcile` |                            No |    No |
| Cancelar ciclo                   |                    `cedis.close` |                             No por default |                            No |    No |
| Cerrar/reabrir jornada           | Reglas de cierre + `cedis.close` |                                         No |                            No |    No |
| Ver costos/utilidad              |               `cedis.view_costs` |                         `cedis.view_costs` |                            No |    No |

## Alcance

- `ADMIN` tiene alcance global.
- `WAREHOUSE.operationalLocationId` debe coincidir con el CEDIS del ciclo.
- `SELLER.operationalLocationId` debe coincidir con la sucursal y solo puede leer.
- El backend aplica alcance sobre el ciclo; ignora intentos del cliente de sustituir ubicaciones derivadas.
- Confirmar requiere alcance sobre la ubicación receptora además del permiso de inventario correspondiente.

## Auditoría

Apertura, vínculo, confirmación/cancelación vinculada, refresh, cancelación, cierre y reapertura conservan actor, timestamp y versión. Los motivos son obligatorios en cancelación/reapertura. Las proyecciones sin `cedis.view_costs` omiten costo y utilidad desde backend.
