# Design: TASK-022 — Implementar Users backend

## Technical Approach

Implementar un `UsersModule` NestJS protegido por los guards/decoradores existentes de TASK-021 (`JwtAuthGuard`, `RolesGuard`, `@Roles('ADMIN')`). La capa de servicio concentrará validación de email único, sanitización, hash de contraseña temporal, baja lógica y protección del último ADMIN activo. Auth se ajustará para consultar el estado actual en BD y bloquear usuarios inactivos o con `mustChangePassword` en accesos no permitidos.

## Architecture Decisions

| Decisión | Opción elegida | Alternativas | Rationale |
|---|---|---|---|
| Protección ADMIN | `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('ADMIN')` en `UsersController` | Guard nuevo por módulo | Reusa el patrón ya probado en `common/guards/auth-rbac.guard.spec.ts` y evita RBAC paralelo. |
| Sanitización | `select`/mapper explícito `toUserResponse()` | Omitir campos después de traer entidad completa | Evita fugas accidentales de `passwordHash` desde Prisma y mantiene contrato estable. |
| Baja lógica | `isActive=false`, `deactivatedAt`, `deactivatedByUserId`, `deactivationReason?` | `delete()` físico | Respeta specs; la razón requiere migración porque el schema actual no la tiene. |
| Último ADMIN | Transacción Prisma con conteo de ADMIN activos antes de mutar rol/estado | Validación solo en controller | La regla es invariante de dominio y debe proteger edición, desactivación y delete lógico. |
| Password temporal | Mínimo 10 caracteres, `bcrypt.hash(..., 12)`, `mustChangePassword=true` | Política compleja/expiración | Cumple MVP; expiración no existe hoy en schema y queda fuera salvo migración futura explícita. |

## Data Flow

```text
HTTP /api/users ──→ JwtAuthGuard ──→ RolesGuard(ADMIN) ──→ UsersController
      │                                                        │
      └──── AuthService.verifyAccessToken(DB isActive)         ↓
                                                        UsersService
                                                            │
                                                     Prisma/PostgreSQL
                                                            │
                                                     UserResponse DTO
```

Para login/refresh/protected access: Auth carga el usuario vigente desde Prisma; si `isActive=false`, rechaza. Si `mustChangePassword=true`, login devuelve la marca y los guards bloquean endpoints normales, permitiendo solo rutas necesarias definidas por Auth.

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/src/modules/users/users.module.ts` | Create | Registra controller/service e importa dependencias de Auth/Prisma. |
| `backend/src/modules/users/users.controller.ts` | Create | Expone `GET`, `POST`, `PATCH`, `PATCH password`, `DELETE` bajo `users`, solo ADMIN. |
| `backend/src/modules/users/users.service.ts` | Create | Reglas de negocio, transacciones, hash y sanitización. |
| `backend/src/modules/users/dto/*.dto.ts` | Create | DTOs con `class-validator` para create/update/password/query/delete. |
| `backend/src/modules/users/users*.spec.ts` | Create | TDD unit/API para contratos Users. |
| `backend/src/app.module.ts` | Modify | Importar `UsersModule`. |
| `backend/src/modules/auth/auth.module.ts` | Modify | Exportar `AuthService`/`JwtAuthGuard` si Users los requiere. |
| `backend/src/modules/auth/auth.service.ts` | Modify | Incluir `mustChangePassword`; bloquear inactivos en login/refresh/access token. |
| `backend/src/modules/auth/auth.types.ts` | Modify | Agregar estado de cambio obligatorio al usuario autenticado/respuesta. |
| `backend/prisma/schema.prisma` | Modify | Agregar `mustChangePassword`, `deactivatedAt`, `deactivatedByUserId`, `deactivationReason?` y relación de auditoría. |
| `backend/prisma/migrations/*/migration.sql` | Create | Migración de campos de usuario. |

## Interfaces / Contracts

Endpoints devuelven el wrapper existente `{ success, message, data }`. `UserResponse` permitido: `id`, `name`, `email`, `roleId`, `role`, `isActive`, `mustChangePassword`, `createdAt`, `updatedAt`, `deactivatedAt`, `deactivatedByUserId`, `deactivationReason`. Nunca incluir `passwordHash`.

DTOs: `CreateUserDto { name, email, roleId, temporaryPassword }`, `UpdateUserDto { name?, email?, roleId? }`, `UpdateUserPasswordDto { temporaryPassword }`, `ListUsersQueryDto { status?: 'active'|'inactive'|'all', includeInactive?: boolean }`, `DeactivateUserDto { reason? }`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Email único, hash, sanitización, filtros, último ADMIN, baja lógica | RED first en `users.service.spec.ts` con Prisma mock y transacciones. |
| API | ADMIN-only, DTO validation, response wrapper, no `passwordHash` | Supertest controller spec con guards reales/mocks siguiendo Auth specs. |
| Auth | Inactive blocked; `mustChangePassword` propagated/enforced | Extender `auth.service.spec.ts` y guard tests. |
| E2E | App bootstrap con `UsersModule` | Mantener e2e existente; añadir solo si no requiere BD real. |

Comando obligatorio: `npm --prefix backend test`.

## Migration / Rollout

Requiere migración Prisma para campos faltantes. Valores iniciales: `mustChangePassword=false`, deactivación `null`. No migración destructiva ni borrado físico.

## Open Questions

- [ ] El endpoint de cambio de contraseña propio para completar `mustChangePassword` no está definido en TASK-022; el diseño solo deja la señal y enforcement base para Auth.
