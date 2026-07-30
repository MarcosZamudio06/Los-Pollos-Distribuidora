# Variables de Entorno

## Backend

```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pollo_distribucion
JWT_ACCESS_SECRET=change_me
JWT_REFRESH_SECRET=change_me
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
AUTH_SESSION_ABSOLUTE_TTL_SECONDS=604800
AUTH_SESSION_IDLE_TTL_SECONDS=86400
BCRYPT_SALT_ROUNDS=10
CORS_ORIGIN=http://localhost:3000
```

## Frontend

```env
VITE_API_URL=http://localhost:4000/api
```

## PostgreSQL

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=pollo_distribucion
```

## Reglas

- `.env` no debe subirse a Git.
- `.env.example` sí debe mantenerse actualizado.
- Los secretos productivos deben ser diferentes a los de desarrollo.
- La vigencia criptográfica del refresh token no debe superar la expiración absoluta de la sesión.
