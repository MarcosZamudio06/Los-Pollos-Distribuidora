# Runbook de despliegue cartográfico

Este runbook despliega primero la infraestructura cartográfica y después el
backend y el frontend. No genera datos durante el arranque normal de Docker.

## Precondiciones

- Docker Compose disponible en el host de despliegue.
- `MAP_DATA_DIR` dedicado, persistente y fuera del repositorio.
- Snapshot Geofabrik `mexico-260812` o una revisión posterior aprobada con su
  SHA-256 registrado.
- Variables privadas de Photon, OSRM y VROOM configuradas solo para NestJS.
- `VITE_MAP_STYLE_URL=/maps/styles/operations/style.json` en la imagen de
  producción.

## Preparar y verificar infraestructura

```bash
./scripts/maps/prepare-all.sh
docker compose --profile maps up -d \
  postgres photon osrm vroom tileserver migrate backend frontend
docker compose --profile maps ps
```

La preparación descarga el PBF, calcula su SHA-256, ejecuta Planetiler
`v0.10.2`, instala fonts OpenMapTiles `v2.0` y escribe
`.map-data/rendering/manifest.json`. Si el manifest coincide, reutiliza los
artefactos existentes. El `frontend` se incluye deliberadamente: el smoke
oficial no prueba TileServer por su URL interna, sino el camino
`frontend Nginx -> /maps/** -> TileServer GL`; Compose conserva la espera por
backend healthy.

Verificar siempre por el proxy del frontend:

```bash
docker compose --profile maps ps
./scripts/maps/verify-stack.sh
```

El comando anterior debe dejar disponible
`http://127.0.0.1:${FRONTEND_PORT:-3000}/maps/health`. Si ese endpoint falla,
la verificación falla aunque `tileserver` responda dentro de la red Docker.

El smoke deriva desde el style los sprites, glyphs y TileJSON y prueba el tile
XYZ `z=10, x=238, y=456` de Veracruz. También falla si una respuesta filtra
`photon`, `osrm`, `vroom`, `tileserver:8080` o `tile.openstreetmap.org`.

Para demostrar el alta HTTP de una sucursal nueva, usar únicamente una
instalación disposable/dev/test:

```bash
SMOKE_DISPOSABLE=true \
SMOKE_ENV=dev \
SMOKE_BASE_URL=http://127.0.0.1:${FRONTEND_PORT:-3000} \
SMOKE_ADMIN_EMAIL="${SMOKE_ADMIN_EMAIL}" \
SMOKE_ADMIN_PASSWORD="${SMOKE_ADMIN_PASSWORD}" \
./scripts/maps/smoke-branch-create.sh
```

El script no imprime el token ni la contraseña, no crea inventario y puede
desactivar lógicamente la sucursal creada con `SMOKE_CLEANUP=true` (valor por
defecto). Nunca debe ejecutarse contra producción.

## Orden productivo

1. Preparar y health-checkear TileServer GL y los proveedores privados.
2. Ejecutar `docker compose -f docker-compose.production.yml config` con las
   variables productivas.
3. Ejecutar migraciones y desplegar NestJS con `MAP_TILES_URL` interno.
4. Confirmar `GET /api/delivery-routing/technical-status` sin URLs internas.
5. Construir y desplegar Nginx con la URL same-origin del style.
6. Ejecutar el smoke cartográfico. El smoke de alta de sucursal se ejecuta
   únicamente en un entorno disposable/dev/test separado.
7. Habilitar gradualmente la UI; la captura manual debe continuar disponible
   si falla WebGL, style, tiles, sprites, glyphs o geocoding.

TileServer GL no publica puertos al host en producción. Nginx es el único punto
de entrada browser-facing para `/maps/**`; Photon, OSRM y VROOM solo son
consumidos por NestJS.

El estado técnico autenticado debe reportar `PostGIS`, `Photon`, `OSRM`,
`VROOM` y `MapTiles` como `up`. La respuesta no debe incluir URLs internas
de los proveedores.

## Seguridad y licencias

La imagen frontend envía una CSP explícita. `style-src 'unsafe-inline'` queda
limitado a la compatibilidad de los estilos generados por la aplicación y
MapLibre; no se habilitan comodines en `connect-src`, `img-src` o
`worker-src`. La atribución visible mínima es:

`© OpenMapTiles © OpenStreetMap contributors`

Mantener los notices de `docker/maps/licenses/` junto con el manifest de cada
dataset promovido.

## Rollback

Si el smoke falla, detener la habilitación del frontend y conservar la versión
anterior de la imagen. Restaurar el directorio de rendering anterior, verificar
su manifest y repetir el smoke antes de reabrir tráfico. Nunca activar un
fallback productivo a `tile.openstreetmap.org`.
