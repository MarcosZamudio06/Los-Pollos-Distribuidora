# Module Spec — Auth

## Objetivo

Gestionar autenticación, sesión y autorización del sistema.

## Funcionalidades

- Login.
- Refresh token.
- Logout.
- Obtener usuario autenticado.
- Protección de rutas.
- Validación de permisos y políticas de alcance.

## Entidades involucradas

- User.
- Role.
- Permission.
- RolePermission.
- AuthSession.

## Endpoints

- POST /api/auth/login
- POST /api/auth/refresh
- POST /api/auth/logout
- GET /api/auth/me
- GET /api/permissions
- GET /api/roles
- GET /api/roles/:id
- PATCH /api/roles/:id/permissions
- GET /api/users/:id/access
- PATCH /api/users/:id/access-profile
- POST /api/users/:id/sessions/revoke
- GET /api/access-control/audit-logs

## Reglas de negocio

- No permitir login de usuarios inactivos.
- No devolver passwordHash.
- Access token debe expirar.
- Refresh token debe expirar.
- Cada login debe crear una sesión persistente independiente.
- Los refresh tokens deben persistirse únicamente como hash y rotarse en cada renovación.
- La reutilización de un refresh token rotado debe revocar la sesión comprometida.
- Logout debe revocar la sesión actual en el servidor.
- El cambio de contraseña debe incrementar la versión de sesión y revocar todas las sesiones del usuario.
- Las sesiones deben aplicar expiración absoluta y por inactividad.
- El access token debe mantenerse únicamente en memoria del cliente.
- El refresh token debe enviarse en cookie `HttpOnly`, `Secure` en producción y `SameSite=Strict`.
- Endpoints protegidos deben validar JWT.
- La autenticación es global por defecto. Una ruta solo puede omitirla con `@Public()`.
- Toda ruta no pública debe declarar explícitamente `@Authenticated()` o `@RequirePermissions(...)`; una ruta sin clasificación debe rechazarse.
- Las acciones restringidas deben validar permisos atómicos, no nombres de rol distribuidos.
- Los permisos se resuelven desde la sesión y la base de datos en cada validación de token; no se confía en permisos persistidos dentro del JWT.
- Las políticas de recurso validan adicionalmente ubicación operativa, propiedad, estado y versión cuando aplique.
- La interfaz puede ocultar controles con base en capacidades efectivas, pero el backend es la autoridad.
- Los cambios de perfil o permisos deben ser auditables y revocar o invalidar las sesiones afectadas antes de surtir efecto.
- Los roles representan perfiles de trabajo y agrupan permisos; un rol técnico no recibe permisos financieros por implicación.
- La primera versión solo administra perfiles canónicos; no permite crear, eliminar ni renombrar perfiles.
- Una mutación de perfil requiere versión esperada y motivo obligatorio.
- Un actor no puede conceder permisos que no posee.
- Cambiar permisos de un perfil incrementa la versión, incrementa `sessionVersion` de sus usuarios y revoca sus sesiones activas.
- Reasignar un perfil o revocar sesiones incrementa `sessionVersion` y revoca las sesiones activas del usuario.
- Debe permanecer al menos un usuario activo con `access_profiles.manage` y al menos uno con `users.manage`.
- La auditoría de acceso es append-only y no almacena tokens, hashes ni contraseñas.

## Permisos

- Login público.
- Me requiere autenticación.
- Logout requiere autenticación.
- Refresh requiere la cookie de refresh válida.
- Permisos CEDIS: `cedis.view`, `cedis.manage`, `cedis.dispatch`, `cedis.receive_supplies`, `cedis.request_returns`, `cedis.receive_returns`, `cedis.reconcile`, `cedis.close`, `cedis.view_costs`.
- `ADMIN` recibe todos los permisos CEDIS. `WAREHOUSE` recibe consulta, despacho, solicitud de devoluciones y recepción de suministros y devoluciones; `SELLER` recibe consulta, recepción de suministros y solicitud de devoluciones únicamente dentro de su sucursal. `cedis.request_returns` no concede recepción/completado en CEDIS; esa transición conserva `cedis.receive_returns`. `cedis.view_costs` no sustituye ni concede `costs.read`.
- Permisos de caja propia: `cash_shift.open_own` permite consultar terminales propias, consultar el turno actual y abrir un turno en la ubicación asignada; `cash_shift.close_own` permite cerrar únicamente el turno propio con el dispositivo registrado.
- `collections.receive_cash` permite registrar pagos `CASH` de cobranza en ubicación fija. `COLLECTIONS` recibe `collections.receive_cash`, `cash_shift.open_own` y `cash_shift.close_own`; `SELLER` conserva los dos permisos de turno propio; ningún rol operativo recibe por implicación `cash_shifts.administrative_close`, reapertura de turnos, movimientos de caja ni ventas POS adicionales.

## UI

- Pantalla login.
- Access token únicamente en memoria; ningún token se persiste en `localStorage` o almacenamiento accesible por JavaScript.
- Redirección según autenticación.
- Pantalla 403 para acceso denegado.

## Pruebas mínimas

- Login exitoso.
- Login con contraseña incorrecta.
- Usuario inactivo no puede entrar.
- Ruta no pública sin token falla.
- Ruta sin clasificación de acceso falla la prueba arquitectónica.
- Usuario sin permiso recibe 403.
- Un perfil técnico no puede ejecutar acciones financieras sensibles.
