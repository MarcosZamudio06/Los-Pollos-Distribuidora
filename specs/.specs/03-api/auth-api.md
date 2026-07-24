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
    "refreshToken": "jwt",
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

Errores:

- 401 si credenciales inválidas.
- 403 si usuario inactivo.

## POST /api/auth/refresh

Descripción:

Renovar access token.

Body:

```json
{
  "refreshToken": "jwt"
}
```

## POST /api/auth/logout

Descripción:

Cerrar sesión o invalidar refresh token.

Requiere autenticación.

## GET /api/auth/me

Descripción:

Obtener usuario autenticado.

Requiere autenticación.

Para usuarios con ubicación operativa asignada, `data.user.operationalLocationId`
identifica la ubicación desde la que deben operar el POS. El campo se omite si
la cuenta no tiene una asignación vigente.
