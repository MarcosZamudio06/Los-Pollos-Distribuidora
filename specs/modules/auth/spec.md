# Module Spec — Auth

## Objetivo

Gestionar autenticación, sesión y autorización del sistema.

## Funcionalidades

- Login.
- Refresh token.
- Logout.
- Obtener usuario autenticado.
- Protección de rutas.
- Validación de roles.

## Entidades involucradas

- User.
- Role.
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
- Acciones restringidas deben validar rol.

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
- Ruta protegida sin token falla.
- Usuario sin rol correcto recibe 403.
