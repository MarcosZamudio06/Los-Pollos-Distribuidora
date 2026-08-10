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
- operationalLocationId.
- cedisLocationId opcional.
- isActive.

## Reglas

- Email único.
- Password requerido al crear.
- Password nunca debe devolverse.
- No eliminar usuario físicamente.
- No permitir que un usuario se desactive a sí mismo si es único ADMIN activo.
- `operationalLocationId` conserva el punto de venta o ubicación operativa
  principal del empleado.
- `cedisLocationId` es opcional y, cuando se captura, debe referenciar un CEDIS
  activo de tipo `DISTRIBUTION_CENTER`; no sustituye la ubicación principal ni
  concede permisos adicionales por sí mismo.

## Permisos

- `users.manage` permite administrar usuarios.
- `access_profiles.manage` permite administrar perfiles y sus permisos.
- Los perfiles iniciales incluyen `cedis.view`, `cedis.manage`,
  `cedis.dispatch`, `cedis.receive_supplies`, `cedis.receive_returns`, `cedis.reconcile`, `cedis.close` y
  `cedis.view_costs`.
- `ADMIN` recibe todos los permisos CEDIS; `WAREHOUSE` recibe consulta,
  abastecimiento y recepción de devoluciones; `SELLER` recibe únicamente
  consulta dentro de su sucursal y no recibe costos por implicación del rol.
- La asignación de ubicación permite `DISTRIBUTION_CENTER`, `WAREHOUSE`,
  `MIXED` y `BRANCH` para `WAREHOUSE`, conserva ubicaciones operativas de venta
  para `SELLER` y no permite asignar un CEDIS a un vendedor por defecto.
- La administración técnica no concede automáticamente autorizaciones financieras.
- Cambiar un perfil o sus permisos debe conservar actor, valores anterior y nuevo, fecha y motivo cuando corresponda.
- El cambio de perfil se realiza únicamente mediante `/users/:id/access-profile`, con `expectedRoleId` y motivo.
- El cambio de perfil valida que la ubicación asignada sea compatible con el nuevo rol; `WAREHOUSE` puede operar en CEDIS, almacén, ubicación mixta o sucursal, y `SELLER` no puede recibir un CEDIS.
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
- Al registrar un empleado de punto de venta, permitir seleccionar un CEDIS
  adicional sin perder la asignación del punto de venta.
- Editar usuario.
- Cambiar estado.
- Asignar perfil y revisar permisos efectivos.
- Revisar y revocar sesiones activas.

## Pruebas mínimas

- Crear usuario.
- Rechazar email duplicado.
- Desactivar usuario.
- No devolver passwordHash.
