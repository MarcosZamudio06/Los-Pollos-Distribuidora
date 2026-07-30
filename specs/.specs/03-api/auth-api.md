# API — Autenticación

## POST /api/auth/login

Descripción:

Iniciar sesión.

Body:

```json
{
  "email": "admin@example.com",
  "password": "password"
}
```

Respuesta 200:

```json
{
  "success": true,
  "message": "Sesión iniciada correctamente",
  "data": {
      "accessToken": "jwt",
    "user": {
      "id": "string",
      "name": "Administrador",
      "email": "admin@example.com",
      "role": "ADMIN",
      "operationalLocationId": "string"
    }
  }
}
```

El refresh token no forma parte del JSON. Se entrega mediante cookie `refresh_token`
con atributos `HttpOnly`, `SameSite=Strict`, `Path=/api/auth` y `Secure` en
producción.

Errores:

- 401 si credenciales inválidas.
- 403 si usuario inactivo.
- 429 si se excede el límite por cuenta o por IP. La respuesta no debe exponer
  el tracker interno y debe incluir `Retry-After`.

## POST /api/auth/refresh

Descripción:

Renovar access token.

La solicitud no recibe token en el body. Requiere la cookie `refresh_token`.
Cada renovación rota la cookie. La reutilización de una cookie previamente
rotada revoca la sesión y responde 401.

La respuesta contiene un access token nuevo y el usuario autenticado, pero no
expone el refresh token.

Responde 429 cuando se excede la política de renovación por IP, sin incluir la
cookie ni el token en logs o respuestas.

## POST /api/auth/logout

Descripción:

Cerrar sesión o invalidar refresh token.

Requiere autenticación.

Revoca la sesión identificada por el access token y elimina la cookie de
refresh. Un refresh token copiado antes del logout ya no puede renovar la
sesión.

## POST /api/auth/change-password

Descripción:

Cambiar la contraseña del usuario autenticado.

Requiere autenticación. Al completar el cambio incrementa la versión de sesión,
revoca todas las sesiones del usuario y elimina la cookie de refresh. El cliente
debe volver al login.

## GET /api/auth/me

Descripción:

Obtener usuario autenticado.

Requiere autenticación.

Para usuarios con ubicación operativa asignada, `data.user.operationalLocationId`
identifica la ubicación desde la que deben operar el POS. El campo se omite si
la cuenta no tiene una asignación vigente.
