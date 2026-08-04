# Tasks: BranchSupplyCycle CEDIS-sucursal

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Estimated changed lines | 900-1,300 de implementación, pruebas y migración |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 datos/permisos; PR 2 dominio/API; PR 3 cierre/reportes; PR 4 frontend/E2E |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Objetivo | Base sugerida |
|---|---|---|
| 1 | Prisma, permisos, constraints y backfill | main |
| 2 | Módulo backend CEDIS y comandos de traspaso | PR 1 |
| 3 | Integración de cierre diario y reportes | PR 2 |
| 4 | UI CEDIS, navegación, dashboard y E2E | PR 3 |

## Phase 1: Spec Gate and Foundation

- [ ] 1.1 Resolver el conflicto documental: localizar o sustituir la referencia ausente a `specs/.specs/01-architecture/ai-rules.md`.
- [ ] 1.2 Escribir pruebas RED de unicidad, FK, tipos de ubicación e índices parciales antes de modificar Prisma.
- [ ] 1.3 Agregar enums/modelos Prisma, migración SQL y permisos sin alterar saldos existentes.
- [ ] 1.4 Validar backfill con mapa explícito sucursal → CEDIS y reporte de ambigüedades.

## Phase 2: Domain and API

- [ ] 2.1 Crear `branch-supply-cycles` con DTOs, controller, service, alcance e idempotencia.
- [ ] 2.2 Extender `InventoryTransfersService` para crear/vincular supply/return sin duplicar lógica de balances.
- [ ] 2.3 Implementar estados, cancelación y bloqueantes de traspaso/cierre.
- [ ] 2.4 Cubrir endpoints, errores, concurrencia y formulas con Jest.

## Phase 3: Existing Workflow Integration

- [ ] 3.1 Extender `PointOfSaleDailyCloseService` para asociación, invalidación y finalización atómica.
- [ ] 3.2 Extender `LocationsService`, `ReportsService` y dashboard con alcance y frescura.
- [ ] 3.3 Verificar que las devoluciones se contabilicen solo como `TRANSFER_OUT` en la conciliación.

## Phase 4: Frontend and Verification

- [ ] 4.1 Crear feature CEDIS y extender router, navegación, permisos y layout.
- [ ] 4.2 Extender inventario, cierre diario y dashboard reutilizando sus servicios/componentes actuales.
- [ ] 4.3 Ejecutar pruebas backend, E2E, builds y pruebas UI; verificar que solo el cambio OpenSpec se modifique durante la documentación.
