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

## Permisos

- Login público.
- Me requiere autenticación.
- Logout requiere autenticación.
- Refresh requiere la cookie de refresh válida.

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
