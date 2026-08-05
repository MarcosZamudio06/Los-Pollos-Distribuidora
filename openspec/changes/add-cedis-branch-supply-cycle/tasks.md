# Tasks: BranchSupplyCycle CEDIS-sucursal

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Estimated changed lines | 900-1,300 de implementación, pruebas y migración |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 datos/permisos; PR 2 dominio/API; PR 3 cierre/reportes; PR 4 frontend/E2E |
| Delivery strategy | exception-ok (autorización explícita del usuario) |
| Chain strategy | size:exception |

Decision needed before apply: Resolved — implementación autorizada como una unidad revisable.
Chained PRs recommended: Yes, excepted by explicit user authorization.
Chain strategy: size:exception
400-line budget risk: High — accepted by maintainer.

### Suggested Work Units

| Unit | Objetivo | Base sugerida |
|---|---|---|
| 1 | Prisma, permisos, constraints y backfill | main |
| 2 | Módulo backend CEDIS y comandos de traspaso | PR 1 |
| 3 | Integración de cierre diario y reportes | PR 2 |
| 4 | UI CEDIS, navegación, dashboard y E2E | PR 3 |

## Phase 1: Spec Gate and Foundation

- [x] 1.1 Resolver el conflicto documental: `specs/.specs/01-architecture/ai-rules.md` existe y los specs CEDIS quedaron alineados.
- [x] 1.2 Agregar pruebas de contrato para enums/modelos, FK, tipos de ubicación e índices parciales de la base CEDIS.
- [x] 1.3 Agregar enums/modelos Prisma, migración SQL y siete permisos CEDIS sin alterar saldos existentes.
- [ ] 1.4 Validar backfill con mapa explícito sucursal → CEDIS y reporte de ambigüedades.
- [x] 1.5 Alinear el índice activo a `branchLocationId + businessDate` y agregar evento `TRANSFER_STATE_CHANGED` con migración no destructiva.

## Phase 2: Domain and API

- [x] 2.1 Crear `backend/src/modules/cedis` con DTOs, controller `/api/cedis/branch-supply-cycles`, service, alcance e idempotencia.
- [x] 2.2 Extraer operaciones de `InventoryTransfersService` reutilizables con `TransactionClient`; crear/vincular `SUPPLY`/`RETURN` como `REQUESTED` sin movimientos.
- [x] 2.3 Proteger confirmación/cancelación vinculada, productos/ubicaciones activas, versión, invalidación y estados terminales.
- [x] 2.4 Implementar refresh de snapshots, integridad y elegibilidad.
- [ ] 2.5 Implementar la cancelación complementaria del ciclo fuera de los endpoints mínimos.
- [ ] 2.6 Cubrir contratos, errores, múltiples transferencias, idempotencia, stock y concurrencia con Jest/Supertest/PostgreSQL.

## Phase 3: Existing Workflow Integration

- [ ] 3.1 Extender `PointOfSaleDailyCloseService` para asociación, bloqueantes, cierre y reapertura atómicos.
- [ ] 3.2 Extender `LocationsService`, `ReportsService` y dashboard con alcance y frescura.
- [ ] 3.3 Verificar que las devoluciones se contabilicen solo como `TRANSFER_OUT` en la conciliación.

## Phase 4: Frontend and Verification

- [ ] 4.1 Crear feature CEDIS y extender router, navegación, permisos y layout.
- [ ] 4.2 Extender inventario, cierre diario y dashboard reutilizando sus servicios/componentes actuales.
- [ ] 4.3 Ejecutar pruebas backend, E2E, builds y pruebas UI; verificar que solo el cambio OpenSpec se modifique durante la documentación.

## Approved implementation slice: CEDIS hierarchy and permissions

- [x] 5.1 Add CEDIS location hierarchy validation, parent-cycle protection, coordinate DTO validation, scoped reads, and active direct-branch query.
- [x] 5.2 Add CEDIS permissions, idempotent seed defaults, CEDIS/branch seed mapping, and hierarchy migration contract.
- [x] 5.3 Sincronizar catálogos frontend y documentación de jerarquía/permisos sin implementar todavía el flujo `BranchSupplyCycle`.
- [x] 5.4 Add unit, controller, permission, seed, and schema contract coverage for the approved slice.
