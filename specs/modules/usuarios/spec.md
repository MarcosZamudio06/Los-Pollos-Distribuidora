# Module Spec — Usuarios

## Objetivo

Administrar usuarios internos del sistema.

## Funcionalidades

- Crear usuario.
- Editar usuario.
- Desactivar usuario.
- Listar usuarios.
- Asignar rol.
- Cambiar contraseña.

## Entidades

- User.
- Role.

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

- ADMIN: CRUD.
- Otros roles: sin acceso a administración de usuarios.

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
- Asignar rol.

## Pruebas mínimas

- Crear usuario.
- Rechazar email duplicado.
- Desactivar usuario.
- No devolver passwordHash.
