# Docker

## docker-compose.yml

Debe levantar:

- PostgreSQL.
- Backend NestJS.
- Frontend React.
- Nginx opcional para producción.

## Backend Dockerfile

Debe:

- Instalar dependencias.
- Generar Prisma Client.
- Compilar TypeScript.
- Ejecutar migraciones según ambiente.
- Iniciar aplicación.

## Frontend Dockerfile

Debe:

- Instalar dependencias.
- Compilar Vite.
- Servir build con Nginx o servidor estático.

## PostgreSQL

Debe usar volumen:

```text
postgres_data:/var/lib/postgresql/data
```

## Red

Todos los servicios deben compartir una red interna.

## Comandos esperados

```bash
docker compose up -d
docker compose down
docker compose logs -f backend
docker compose exec backend npx prisma migrate deploy
```
