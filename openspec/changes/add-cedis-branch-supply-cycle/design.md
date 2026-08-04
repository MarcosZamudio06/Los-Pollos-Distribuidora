# Design: BranchSupplyCycle CEDIS-sucursal

## Technical Approach

Crear una capacidad nueva que agregue coordinación, no inventario. `BranchSupplyCycle` identifica CEDIS, sucursal y fecha; `BranchSupplyCycleTransfer` vincula cada `InventoryTransfer` confirmado o pendiente y clasifica `SUPPLY` o `RETURN`. Las cantidades se leen de `InventoryTransferItem` y los movimientos siguen siendo creados por `InventoryTransfersService`.

El cierre diario continúa siendo el único agregado de conciliación de sucursal. Al abrirlo se enlaza el ciclo de la misma sucursal y fecha; al confirmar/cancelar traspasos se invalida la validación vigente del cierre en `DRAFT`. El ciclo solo pasa a `COMPLETED` dentro de la transacción que lleva el cierre a `CLOSED`.

Gap previo: no existe `BranchSupplyCycle` en Prisma, backend, frontend ni `openspec/specs/`; tampoco existe `specs/.specs/01-architecture/ai-rules.md` aunque `openspec/config.yaml` lo referencia. La implementación futura debe detenerse si aparece una regla canónica contradictoria.

## Architecture Decisions

| Decisión | Alternativas rechazadas | Razón |
|---|---|---|
| CEDIS se modela con `OperationalLocation` `WAREHOUSE` o `MIXED` | Agregar enum `CEDIS` | Evita romper el catálogo y respeta la jerarquía sucursal-almacén aún abierta. |
| Vínculo separado ciclo-traspaso | Copiar partidas/cantidades en el ciclo | El traspaso y sus movimientos siguen siendo la única fuente de verdad. |
| Un ciclo puede tener varios cierres históricos, pero uno no cancelado | Copiar totales del cierre al ciclo | Conserva reaperturas/cancelaciones sin duplicar conciliación. |
| Finalización coordinada con el cierre | Endpoint independiente `complete` | Impide que ciclo y cierre queden en estados incompatibles. |
| CEDIS usa permisos + alcance de ubicación | Crear un RBAC paralelo | Reutiliza `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard` y `@RequirePermissions`. |

El detalle de campos, relaciones Prisma, índices parciales y restricciones está en [domain-model.md](domain-model.md). La decisión importante es que el ciclo solo guarda identidad, estado, auditoría y vínculos; nunca cantidades ni saldos.

## Data Flow

```text
CEDIS UI
  -> BranchSupplyCyclesController
  -> BranchSupplyCyclesService
       -> LocationsService (activo/tipo/alcance)
       -> InventoryTransfersService (crear/confirmar/cancelar/movimientos)
       -> PointOfSaleDailyCloseService (vínculo/validación/transición)
       -> Prisma/PostgreSQL

DailyClosePage -> PointOfSaleDailyCloseService (único cierre)
ReportsService -> lecturas derivadas del ciclo + frescura existente
```

## Reuse vs Extension

| Componente actual | Acción futura | Uso explícito |
|---|---|---|
| `backend/prisma/schema.prisma` | Extender | Modelos, enums, relaciones e índice parcial. |
| `InventoryTransfersService` | Reutilizar y extender | Mantener balance/movimientos/idempotencia; aceptar contexto de ciclo. |
| `LocationsService` | Reutilizar y extender | Validar tipos, actividad y dependencias de desactivación. |
| `PointOfSaleDailyCloseService` | Reutilizar y extender | Seguir calculando, validando y cerrando; asociar ciclo e invalidar versión. |
| `ReportsService` | Extender | Consultas derivadas por rol, sin mutaciones. |
| `frontend/src/features/inventario/components/InventoryTransferView.tsx` y `productService.ts` | Reutilizar y extender | Mostrar vínculo y dirigir operación CEDIS sin duplicar formularios base. |
| `frontend/src/features/cierre-diario/DailyClosePage.tsx`, `DailyCloseDetailTabs.tsx`, `dailyCloseService.ts` | Extender | Mostrar ciclo y devoluciones; no crear otro cierre. |
| `frontend/src/features/dashboard/DashboardPage.tsx`, `frontend/src/components/layout/navigation.ts`, `routeAccess.ts` | Extender | Card, navegación y protección por rol. |
| `frontend/src/features/cedis/*` | Crear | Lista, detalle, tipos, servicio, hooks y pruebas de la nueva superficie. |

## File Changes (future apply)

| Archivo | Acción futura |
|---|---|
| `backend/prisma/schema.prisma` | Agregar modelos, enums y relaciones. |
| `backend/prisma/migrations/*branch_supply_cycle*/migration.sql` | Crear tablas, FK, índices y restricciones. |
| `backend/src/modules/branch-supply-cycles/**` | Crear módulo Nest, DTOs, controller, service y pruebas. |
| `backend/src/common/authorization/permissions.ts` | Agregar permisos y defaults. |
| `backend/src/modules/inventory/**` | Extender contexto y filtros del traspaso. |
| `backend/src/modules/locations/**` | Bloquear desactivación con ciclos activos. |
| `backend/src/modules/point-of-sale-daily-close/**` | Enlazar, invalidar y completar ciclo. |
| `backend/src/modules/reports/**` | Exponer resumen CEDIS. |
| `frontend/src/features/cedis/**` | Crear UI del módulo. |
| `frontend/src/features/{inventario,cierre-diario,dashboard}/**` | Extender vistas existentes. |

La navegación también extenderá `frontend/src/app/router.tsx` y `frontend/src/components/layout/Sidebar.tsx` solo mediante la matriz central existente; no habrá guard ni sidebar paralelo.

## Testing Strategy

Unit tests cubrirán estados, fórmulas, dirección de transferencias y permisos. Contratos/controller cubrirán wrappers, idempotencia y errores. E2E cubrirá ciclo → suministros → devoluciones → cierre. La prueba de migración verificará índices parciales y backfill no destructivo.

## Migration / Rollout

Añadir tablas y FK opcionalmente, sembrar permisos, desplegar lecturas, desplegar comandos y finalmente ejecutar backfill con mapa aprobado. No inferir CEDIS desde `parentId`; no modificar `InventoryBalance`, `InventoryMovement` ni cierres históricos durante backfill.

## Open Questions

- [ ] Confirmar el mapa operativo de ubicaciones CEDIS antes del backfill.
- [ ] Confirmar si algún CEDIS puede ser `BRANCH` además de `WAREHOUSE`/`MIXED`.
- [ ] Resolver la ausencia de `specs/.specs/01-architecture/ai-rules.md` antes de aplicar código.
