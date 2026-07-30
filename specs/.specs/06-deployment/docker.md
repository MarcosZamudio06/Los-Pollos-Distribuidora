# Docker

## docker-compose.yml (desarrollo)

Debe levantar para desarrollo local:

- PostgreSQL.
- Backend NestJS.
- Frontend React.
- Nginx opcional para producción.

PostgreSQL solo puede publicar su puerto en la interfaz loopback del host.

## docker-compose.production.yml

Debe levantar los servicios de aplicación sin crear una instancia PostgreSQL ni
un volumen de datos. `DATABASE_URL` debe apuntar a PostgreSQL administrado o a un
clúster externo con alta disponibilidad y debe exigir TLS.

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

En desarrollo debe usar volumen:

```text
postgres_data:/var/lib/postgresql/data
```

El volumen local no es un respaldo y no puede utilizarse como estrategia de
durabilidad productiva.

## Red

Todos los servicios deben compartir una red interna.

## Comandos esperados

```bash
docker compose up -d
docker compose down
docker compose logs -f backend
docker compose exec backend npx prisma migrate deploy
```
