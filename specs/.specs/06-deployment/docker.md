# Docker

## docker-compose.yml (desarrollo)

Debe levantar para desarrollo local:

- PostgreSQL.
- Backend NestJS.
- Frontend React.
- Nginx opcional para producción.

PostgreSQL solo puede publicar su puerto en la interfaz loopback del host.

## docker-compose.production.yml

Debe implementar el contrato single-host de Arquitectura A y levantar en la
misma red privada `app_network`:

- PostgreSQL/PostGIS.
- Photon.
- OSRM con perfil `driving`.
- VROOM conectado al DNS interno `osrm`.
- TileServer GL.
- Backend NestJS.
- Frontend Nginx.

`DATABASE_URL`, `PHOTON_URL`, `OSRM_URL`, `VROOM_URL` y `MAP_TILES_URL` deben
resolverse mediante DNS interno Docker (`postgres`, `photon`, `osrm`, `vroom`
y `tileserver`). El Compose productivo no debe depender de esos endpoints
externos ni aceptar `localhost` como sustituto.

La conexión del backend a este PostGIS privado usa `DATABASE_SSL=false`; TLS
externo termina en el gateway del host y no convierte el servicio local en una
dependencia administrada.

PostgreSQL debe usar un volumen persistente. Photon, OSRM y TileServer GL deben
usar el `MAP_DATA_DIR` persistente preparado explícitamente antes del arranque.
Los servicios internos no publican puertos al host; únicamente el frontend se
publica en `127.0.0.1` para Caddy.

## Backend Dockerfile

Debe:

- Instalar dependencias.
- Generar Prisma Client.
- Compilar TypeScript.
- Iniciar aplicación.

No debe ejecutar migraciones al arrancar. El mismo artefacto de imagen se usa
en un job único y explícito que ejecuta `npm run migrate:deploy` antes de
desplegar nuevas réplicas.

## Frontend Dockerfile

Debe:

- Instalar dependencias.
- Compilar Vite.
- Servir build con Nginx o servidor estático.

## PostgreSQL

En desarrollo y producción debe usar un volumen persistente:

```text
postgres_data:/var/lib/postgresql/data
```

El volumen local no es un respaldo; la operación productiva debe conservar el
procedimiento de respaldo y restauración del host.

## Red

Todos los servicios deben compartir una red interna.

## Comandos esperados

```bash
docker compose up -d
docker compose down
docker compose logs -f backend
docker compose run --rm migrate
```

En producción el servicio `migrate` usa el perfil `migration` para evitar que
un `up` normal vuelva a ejecutar una migración:

```bash
docker compose -f docker-compose.production.yml config
docker compose -f docker-compose.production.yml --profile migration run --rm migrate
docker compose -f docker-compose.production.yml --profile migration run --rm bootstrap
docker compose -f docker-compose.production.yml up -d \
  postgres photon osrm vroom tileserver backend frontend
```

## Compose por empresa (MTE)

La configuración de producción conserva un proyecto Compose independiente por
empresa; cada proyecto aísla red y volúmenes sin cambiar los servicios de
negocio. El frontend y el backend usan los mismos digests inmutables en todos
los proyectos. El despliegue por empresa usa `up --no-build` y nunca construye
una imagen por slug.

El Caddy del proyecto/host publica solo los dominios de esa empresa. Para el
ERP enruta HTTP y el upgrade de `/api/socket.io` a su frontend; el frontend
mantiene el proxy interno existente hacia su backend. Para Object Storage
preserva `Host`, path y query de URLs firmadas. En el dominio ERP, Caddy elimina
el `Content-Security-Policy` recibido de Nginx y emite exactamente uno con el
Object Storage host de esa empresa. Las demás directivas CSP conservan los
valores aprobados; el frontend no se reconstruye por empresa.

En los harnesses MTE que mantengan servicios Compose iniciados con `run
--detach`, se debe pasar `--use-aliases` para preservar el DNS de servicio
requerido por los contenedores persistentes. No se cambia el bootstrap
productivo para acomodar fixtures de prueba.
