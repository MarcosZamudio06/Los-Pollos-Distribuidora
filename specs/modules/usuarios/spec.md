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

## API sugerida

- GET /api/users
- GET /api/users/:id
- POST /api/users
- PATCH /api/users/:id
- PATCH /api/users/:id/password
- DELETE /api/users/:id

## UI

Pantalla de usuarios con:

- Tabla.
- Crear usuario.
- Editar usuario.
- Cambiar estado.
- Asignar perfil y revisar permisos efectivos.

## Pruebas mínimas

- Crear usuario.
- Rechazar email duplicado.
- Desactivar usuario.
- No devolver passwordHash.
