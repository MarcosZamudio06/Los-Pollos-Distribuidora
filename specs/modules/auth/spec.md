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
- RefreshToken si se decide persistir tokens.

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
- Endpoints protegidos deben validar JWT.
- Acciones restringidas deben validar rol.

## Permisos

- Login público.
- Me requiere autenticación.
- Logout requiere autenticación.
- Refresh requiere refreshToken válido.

## UI

- Pantalla login.
- Guardado seguro de token en cliente.
- Redirección según autenticación.
- Pantalla 403 para acceso denegado.

## Pruebas mínimas

- Login exitoso.
- Login con contraseña incorrecta.
- Usuario inactivo no puede entrar.
- Ruta protegida sin token falla.
- Usuario sin rol correcto recibe 403.
