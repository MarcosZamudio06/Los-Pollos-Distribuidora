# Runbook de despliegue cartográfico

Este runbook despliega primero la infraestructura cartográfica y después el
backend y el frontend. No genera datos durante el arranque normal de Docker.

## Precondiciones

- Docker Compose disponible en el host de despliegue.
- `MAP_ENVIRONMENT=production` y `MAP_DATA_DIR` como directorio absoluto,
  existente, persistente y fuera del repositorio.
- Volumen persistente de PostgreSQL administrado por el mismo host.
- Versiones y SHA-256 registrados por separado para Photon, OSRM, rendering y
  fonts; un nombre de archivo existente no es evidencia suficiente.
- `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` y los demás
  secretos productivos configurados; no se requieren URLs externas de Photon,
  OSRM, VROOM ni PostgreSQL.
- `VITE_MAP_STYLE_URL=/maps/styles/operations/style.json` en la imagen de
  producción.

## Almacenamiento persistente productivo

El checkout no es un volumen de datos. Provisiona la ruta fuera del repositorio
antes de ejecutar una preparación; el script no crea ni migra automáticamente
un directorio productivo:

```bash
sudo install -d -o pollos -g docker -m 0750 /srv/pollos-distribuidor/maps
export MAP_ENVIRONMENT=production
export MAP_DATA_DIR=/srv/pollos-distribuidor/maps
export COMPOSE_FILE=docker-compose.production.yml
```

La ruta debe estar en un filesystem persistente del NVMe (ext4 o XFS son las
opciones esperadas), ser escribible por el usuario de despliegue y no ser `/`,
`/tmp`, el checkout ni un symlink que resuelva a ellos. Para cambiarla,
provisiona y verifica una segunda ruta, prepara un candidato nuevo desde sus
fuentes verificadas, valida el smoke y cambia `MAP_DATA_DIR` en la configuración
del servicio; no muevas ni borres automáticamente la ruta anterior.

La raíz productiva mantiene esta separación:

```text
<MAP_DATA_DIR>/
  photon/ osrm/ rendering/                 # activos consumidos por Compose
  photon.previous/ osrm.previous/ rendering.previous/  # rollback inmediato
  history/<component>/                      # versiones históricas limitadas
  sources/<component>/<identity>/           # fuentes por provenance
  manifests/<component>/<identity>.json    # índice de manifests promovidos
```

Desarrollo puede conservar `./.map-data`; producción no usa ese fallback en
`docker-compose.production.yml`.

## Provenance reproducible

Cada promoción exige, de forma independiente por componente, `component`,
`datasetVersion`, `sourceUrl`, SHA-256, `preparedAt`, `artifactPaths` y la
versión/imagen de la herramienta. La identidad se deriva de los cuatro campos
de fuente; por ello cambiar URL, versión o checksum produce otra caché y otro
candidato. `MAP_DATA_VERSION` es únicamente una etiqueta de release del
backend: no sustituye los manifests de Photon, OSRM ni rendering.

Variables mínimas nuevas:

```text
PHOTON_DATASET_VERSION / PHOTON_DATA_SHA256
OSRM_DATASET_VERSION / OSRM_PBF_SHA256
RENDERING_DATASET_VERSION / RENDERING_PBF_SHA256
FONT_DATASET_VERSION / OPENMAPTILES_FONT_SHA256
```

En producción también se puede fijar el tamaño esperado de cada descarga con
`*_SOURCE_SIZE_BYTES`. Si no se fija, el preflight exige un `Content-Length`
remoto antes de descargar. Una fuente `latest` sin SHA-256, un checksum
incorrecto, un manifest incompleto o artefactos faltantes abortan antes de
promover; no se reutiliza `mexico.osm.pbf` por su nombre.

## Preflight de disco y retención

Antes de descargar, copiar a staging o iniciar un job Docker, el preflight
compara `df -Pk` contra:

```text
required = source
         + staging * MAP_STAGING_SAFETY_FACTOR
         + candidate
         + rollback
         + max(MAP_MIN_FREE_GB, filesystem_total * MAP_RESERVED_PERCENT)
         + MAP_RESERVED_HOST_GB
         + MAP_RESERVED_POSTGRES_GB
```

Los defaults conservadores son `8 GiB` mínimos, `10%` del filesystem, `4 GiB`
para Ubuntu/Docker/host, `4 GiB` para PostgreSQL y factor `1.25`. Si no hay
espacio suficiente, el comando termina con error antes de detener consumidores
o tocar datos activos y muestra `required`, `free`, `source`, `staging`,
`candidate`, `rollback` y reservas.

La promoción valida primero el candidato. Sólo después mueve el activo a
`<component>.previous`, conserva histórico y ejecuta cleanup limitado por
`MAP_MAX_HISTORY_VERSIONS`; nunca elimina `active` ni el rollback inmediato.
Un fallo de descarga, checksum, preprocessing o promoción deja el activo y el
rollback intactos. El lock compartido `.map-preprocessing.lock` sigue evitando
preparaciones concurrentes.

## Refresh side-by-side sin downtime del backend

`refresh-monthly.sh` prepara las tres fuentes en un transaction root separado:

```text
<MAP_DATA_DIR>/refreshes/<refresh-id>/
  candidates/photon/       # no es un mount activo
  candidates/osrm/         # no es un mount activo
  candidates/rendering/    # no es un mount activo
  promotions/*.state       # recuperación ante interrupción
  refresh.json              # estado y métricas de la transacción
```

Objetivo operativo: **0 downtime de backend durante la preparación pesada**.
Durante `PREPARING` y `VALIDATED` permanecen atendiendo la versión activa
Photon, OSRM y TileServer GL; el backend tampoco se detiene. La descarga,
checksum, extracción, Planetiler, manifests y smokes de candidatos suceden
antes de cualquier movimiento de `photon`, `osrm` o `rendering`.

Ejecutar el refresh productivo así:

```bash
export COMPOSE_FILE=docker-compose.production.yml
export MAP_ENVIRONMENT=production
export MAP_DATA_DIR=/srv/pollos-distribuidor/maps
./scripts/maps/refresh-monthly.sh
```

La validación usa `scripts/maps/validate-candidates.sh`: OSRM y rendering se
montan como `:ro` en contenedores temporales con `--network none`, sin publicar
puertos. Photon usa un mount aislado de candidato porque el índice puede crear
locks/runtime files durante el arranque; nunca monta el árbol `active`. OSRM
prueba una ruta, Photon prueba geocoding y TileServer prueba health/style. En
producción no se permite saltar esos smokes.

Después de `VALIDATED`, la ventana de switch es por componente:

1. `active -> <component>.previous` y `candidate -> active` mediante renames
   en el mismo filesystem.
2. Se recrea sólo el servicio correspondiente con
   `docker compose up -d --no-deps --force-recreate <service>`.
3. Se espera health y smoke del componente antes de continuar.
4. `VROOM` no se reinicia: consume OSRM por DNS/HTTP y no monta el dataset.
   Backend tampoco se recrea ni se detiene.

El container que estaba atendiendo conserva su bind mount anterior hasta que
su servicio es recreado; por eso la preparación no modifica nunca el árbol
activo. El manifest registra `PREPARING`, `VALIDATED`, `PROMOTING`, `ACTIVE`,
`ROLLED_BACK` o `FAILED`, además de duración de preparación, duración de switch
y `backendDowntimeSeconds`. El monitor de `/api/health/ready` debe registrar
cero downtime durante la fase pesada.

No borres `node.lock` manualmente: pertenece a OpenSearch y debe ser
administrado por Photon/OpenSearch.

## Guardrails de recursos

Los límites iniciales de CPU/RAM del runtime GIS y de los jobs de preparación,
el heap de Photon, el heap de Node y el lock contra preparaciones concurrentes
están documentados en
[`resource-limits.md`](./resource-limits.md). Los jobs pesados se ejecutan
secuencialmente con límites Docker; no aumentes varios límites sin medir el
dataset real de México y conservar el headroom del host.

## Preparar y verificar infraestructura de desarrollo

```bash
./scripts/maps/prepare-all.sh
docker compose --profile maps up -d \
  postgres photon osrm vroom tileserver migrate backend frontend
docker compose --profile maps ps
```

La preparación descarga cada fuente sólo después de validar su identidad y
SHA-256, ejecuta Planetiler `v0.10.2`, instala fonts OpenMapTiles `v2.0` y
escribe `${MAP_DATA_DIR}/rendering/manifest.json`. Si el manifest completo
coincide (incluyendo URL, versión, checksum y fonts), reutiliza los artefactos;
un archivo con el mismo nombre no basta. El `frontend` se incluye deliberadamente: el smoke
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

## Despliegue single-host de producción

`docker-compose.production.yml` es el contrato completo de Arquitectura A:
PostGIS, Photon, OSRM, VROOM, TileServer GL, backend y frontend comparten
`app_network`. Los cuatro proveedores y PostgreSQL se resuelven por DNS
interno Docker (`postgres`, `photon`, `osrm`, `vroom`); no se aceptan URLs
externas para completar el despliegue.

Los servicios internos no publican puertos al host. El frontend es el único
servicio publicado y queda ligado a `127.0.0.1` para que Caddy sea el punto de
entrada externo.

Ejecutar en este orden:

```bash
export COMPOSE_FILE=docker-compose.production.yml
export MAP_ENVIRONMENT=production
export MAP_DATA_DIR=/srv/pollos-distribuidor/maps

./scripts/maps/prepare-all.sh
docker compose config >/dev/null

# One-shot jobs. Stop the release if either command fails.
docker compose --profile migration run --rm migrate
docker compose --profile migration run --rm bootstrap

docker compose up -d postgres photon osrm vroom tileserver backend frontend
docker compose ps
./scripts/maps/verify-stack.sh
./scripts/maps/smoke-route.sh
```

`migrate` waits for the local PostGIS healthcheck and `bootstrap` waits for a
successful migration. Neither job runs as part of the long-lived backend
startup. Dataset preparation remains explicit; a refresh does not require
stopping Photon, OSRM, TileServer GL or backend during its heavy phase.

## Orden productivo

1. Preparar y health-checkear PostGIS, Photon, OSRM, VROOM y TileServer GL
   mediante el Compose single-host.
2. Ejecutar `docker compose -f docker-compose.production.yml config` con las
   variables productivas. El resultado debe contener solo DNS internos para
   PostgreSQL y los proveedores.
3. Ejecutar los jobs one-shot de migración y bootstrap.
4. Desplegar backend y frontend; `MAP_TILES_URL` permanece en
   `http://tileserver:8080` dentro de `app_network`.
5. Confirmar `GET /api/delivery-routing/technical-status` sin URLs internas.
6. Ejecutar el smoke cartográfico. El smoke de alta de sucursal se ejecuta
   únicamente en un entorno disposable/dev/test separado.
7. Habilitar gradualmente la UI; la captura manual debe continuar disponible
   si falla WebGL, style, tiles, sprites, glyphs o geocoding.

En producción, PostGIS, Photon, OSRM, VROOM y TileServer GL no publican puertos
al host. El frontend queda ligado únicamente a `127.0.0.1` para Caddy; Nginx
es el único punto de entrada browser-facing para `/maps/**`. Photon, OSRM y
VROOM solo son consumidos por NestJS.

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

Si un health/smoke falla después de un switch, el transaction manifest conserva
los estados y `promotions/*.state` permite restaurar cada componente promovido:

```bash
MAP_DATA_DIR=/srv/pollos-distribuidor/maps \
  MAP_ENVIRONMENT=production \
  COMPOSE_FILE=docker-compose.production.yml \
  ./scripts/maps/refresh-monthly.sh
```

La siguiente ejecución detecta una transacción en `PROMOTING`, restaura
`.previous`, recrea sólo los servicios afectados y verifica el rollback antes
de iniciar otra preparación. Un fallo antes de `PROMOTING` deja `active`
intacto. `.previous` no se limpia hasta que health, smoke y el manifest activo
son válidos. Nunca activar un fallback productivo a `tile.openstreetmap.org`.

## Evidencia operativa del refresh

- `refresh.json`: versiones, URLs, SHA-256, fingerprints, estados y duración
  por componente.
- `backend-availability.log`: muestras `OK`/`FAIL` de `/api/health/ready`
  durante la descarga y preparación.
- `promotions/*.state`: evidencia de un switch que debe recuperarse tras una
  interrupción del proceso.

El fixture `scripts/maps/test-zero-downtime-refresh.sh` demuestra active v1,
preparación/promoción de candidate v2, fallo de candidate v3, rollback a v2 y
ausencia de reinicio del backend sin modificar el dataset México productivo.
