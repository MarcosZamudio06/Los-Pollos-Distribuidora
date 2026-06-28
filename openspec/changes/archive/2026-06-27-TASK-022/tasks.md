# Tasks: TASK-022 — Implementar Users backend

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 650-900 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 persistencia/Auth → PR 2 servicio Users → PR 3 API/verificación |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Persistir estado User y bloquear acceso inactivo/password pendiente | PR 1 | Stacked-to-main; target `main`; incluye pruebas Auth/Prisma. |
| 2 | Implementar reglas de negocio `UsersService` y DTOs | PR 2 | Stacked-to-main; target `main` después de mergear PR 1; incluye unit tests. |
| 3 | Exponer endpoints ADMIN y verificación final | PR 3 | Stacked-to-main; target `main` después de mergear PR 2; incluye controller tests y `npm --prefix backend test`. |

## Phase 1: Preparación y persistencia RED/GREEN

- [x] 1.1 Releer `specs/.specs/07-workflows/task/action.md`, `specs/modules/usuarios/spec.md` y `openspec/changes/TASK-022/design.md`; detener si hay conflicto.
- [x] 1.2 RED: extender `backend/src/prisma/schema.contract.spec.ts` para `mustChangePassword` default false y campos de baja nullable.
- [x] 1.3 GREEN: modificar `backend/prisma/schema.prisma` y crear `backend/prisma/migrations/<generated>_add_user_access_fields/migration.sql` no destructiva.

## Phase 2: Auth enforcement RED/GREEN/REFACTOR

- [x] 2.1 RED: extender `backend/src/modules/auth/auth.service.spec.ts` y `backend/src/modules/auth/jwt-auth.guard.spec.ts` para usuarios inactivos y `mustChangePassword`.
- [x] 2.2 GREEN: actualizar `backend/src/modules/auth/auth.service.ts`, `backend/src/modules/auth/auth.types.ts`, `backend/src/modules/auth/jwt-auth.guard.ts` y `backend/src/modules/auth/auth.module.ts`.
- [x] 2.3 REFACTOR: mantener excepciones y respuestas Auth consistentes sin crear rutas fuera de TASK-022.

## Phase 3: Users service RED/GREEN/REFACTOR

- [x] 3.1 RED: crear `backend/src/modules/users/users.service.spec.ts` para email único, hash, sanitización, filtros, último ADMIN y baja lógica.
- [x] 3.2 GREEN: crear `backend/src/modules/users/users.module.ts`, `backend/src/modules/users/users.service.ts` y DTOs en `backend/src/modules/users/dto/`.
- [x] 3.3 REFACTOR: centralizar `toUserResponse()` y transacciones de último ADMIN en `backend/src/modules/users/users.service.ts`.
- [x] 3.4 Remediación WU2: endurecer protección del último ADMIN con transacción serializable, validar estrictamente `includeInactive` y mapear carreras `P2002` de email duplicado a conflicto.

## Phase 4: Users API RED/GREEN/REFACTOR

- [x] 4.1 RED: crear `backend/src/modules/users/users.controller.spec.ts` para endpoints ADMIN-only, validación DTO, wrapper y ausencia de `passwordHash`.
- [x] 4.2 GREEN: crear `backend/src/modules/users/users.controller.ts` e importar `UsersModule` en `backend/src/app.module.ts`.
- [x] 4.3 REFACTOR: verificar rutas `GET/POST/PATCH/DELETE /api/users` y mensajes sin exponer credenciales.

## Phase 5: Verificación

- [x] 5.1 Ejecutar `npm --prefix backend test` y corregir solo archivos del alcance TASK-022.
- [x] 5.2 Confirmar que no se tocó frontend, `.env.example`, secretos ni artefactos apply/verify.
