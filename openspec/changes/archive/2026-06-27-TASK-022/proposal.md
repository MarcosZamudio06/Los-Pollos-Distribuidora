# Proposal: TASK-022 — Implementar Users backend

## Intent

Habilitar administración backend de usuarios internos solo para ADMIN, con seguridad consistente entre Users y Auth: gestión completa, desactivación lógica, protección del último ADMIN activo y contraseñas temporales seguras sin exponer `passwordHash`.

## Scope

### In Scope
- Endpoints ADMIN: `GET /api/users`, `GET /api/users/:id`, `POST /api/users`, `PATCH /api/users/:id`, `PATCH /api/users/:id/password`, `DELETE /api/users/:id`.
- Baja lógica con `isActive=false`, `deactivatedAt`, `deactivatedByUserId` y `deactivationReason` opcional; sin borrado físico.
- Listado de usuarios activos por defecto; inactivos solo con filtro explícito `status=inactive|all` o `includeInactive=true`.
- Cambio de `roleId` solo por ADMIN, prohibiendo dejar al sistema sin al menos un ADMIN activo y bloqueando auto-democión del último ADMIN.
- Password temporal creada por ADMIN con política mínima (recomendado: 10+ caracteres), hash obligatorio y `mustChangePassword=true` con cambio forzado en primer login.
- Bloqueo inmediato de login y endpoints protegidos para usuarios inactivos.

### Out of Scope
- UI de administración de usuarios.
- RBAC nuevo, recuperación de contraseña, MFA o políticas avanzadas fuera de `mustChangePassword`.

## Capabilities

### New Capabilities
- `admin-user-management`: CRUD administrativo de usuarios con email único, ocultamiento de credenciales y baja lógica segura.
- `user-access-status-enforcement`: rechazo de autenticación y acceso protegido para usuarios inactivos y exigencia de cambio de contraseña inicial.

### Modified Capabilities
- None.

## Approach

Implementar el módulo Users y sus contratos ADMIN alineados con `specs/modules/usuarios/spec.md`, reutilizando Auth/guards para validar `isActive` y `mustChangePassword`, y centralizando invariantes de último ADMIN y email único en capa de dominio/servicio.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/users/**` | New/Modified | Endpoints, DTOs, servicio y reglas de negocio de usuarios |
| `backend/src/auth/**` | Modified | Login, guards y validación de `isActive` / `mustChangePassword` |
| `backend/prisma/schema.prisma` | Modified | Campos de desactivación y password temporal si faltan |
| `backend/test/**` | Modified | Cobertura de seguridad, filtros y último ADMIN |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Romper acceso administrativo por regla de último ADMIN | Med | Casos límite y validaciones transaccionales |
| Inconsistencia entre Users y Auth | Med | Criterios compartidos para login, guards y desactivación |

## Rollback Plan

Revertir endpoints/validaciones de Users y Auth del cambio, restaurar comportamiento previo de acceso y mantener usuarios existentes activos; si hubo migración de campos, revertirla solo con resguardo de auditoría.

## Dependencies

- TASK-021 completada.

## Success Criteria

- [ ] ADMIN puede crear, consultar, editar, cambiar password y desactivar usuarios sin exponer `passwordHash`.
- [ ] Un usuario inactivo no puede iniciar sesión ni acceder a endpoints protegidos.
- [ ] El sistema rechaza email duplicado, filtros inactivos no explícitos y cualquier cambio que deje sin ADMIN activo.
