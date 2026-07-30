# Module Spec — Usuarios

## Objetivo

Administrar usuarios internos del sistema.

## Funcionalidades

- Crear usuario.
- Editar usuario.
- Desactivar usuario.
- Listar usuarios.
- Asignar perfil de acceso.
- Consultar capacidades efectivas.
- Cambiar contraseña.

## Entidades

- User.
- Role.
- Permission.
- RolePermission.

## Campos

- name.
- email.
- password.
- roleId.
- isActive.

## Reglas

- Email único.
- Password requerido al crear.
- Password nunca debe devolverse.
- No eliminar usuario físicamente.
- No permitir que un usuario se desactive a sí mismo si es único ADMIN activo.

## Permisos

- `users.manage` permite administrar usuarios.
- `access_profiles.manage` permite administrar perfiles y sus permisos.
- La administración técnica no concede automáticamente autorizaciones financieras.
- Cambiar un perfil o sus permisos debe conservar actor, valores anterior y nuevo, fecha y motivo cuando corresponda.
- El cambio de perfil se realiza únicamente mediante `/users/:id/access-profile`, con `expectedRoleId` y motivo.
- El cambio de perfil revoca todas las sesiones activas del usuario.
- `/users/:id/sessions/revoke` permite cerrar sesiones activas con motivo y auditoría.
- La respuesta de acceso incluye el perfil efectivo, permisos y sesiones activas sin exponer hashes ni tokens.

## API sugerida

- GET /api/users
- GET /api/users/:id
- POST /api/users
- PATCH /api/users/:id
- PATCH /api/users/:id/password
- DELETE /api/users/:id
- GET /api/users/:id/access
- PATCH /api/users/:id/access-profile
- POST /api/users/:id/sessions/revoke

## UI

Pantalla de usuarios con:

- Tabla.
- Crear usuario.
- Editar usuario.
- Cambiar estado.
- Asignar perfil y revisar permisos efectivos.
- Revisar y revocar sesiones activas.

## Pruebas mínimas

- Crear usuario.
- Rechazar email duplicado.
- Desactivar usuario.
- No devolver passwordHash.
