# Plan de implementación: alta de sucursales y mapas desacoplados

## Estado del documento

- Estado: rebaselineado contra `main` y la implementación actual; cada fase
  conserva un estado verificable (`COMPLETED`, `PARTIAL` o `PENDING`).
- Alcance principal: registrar una nueva sucursal operativa y asociarla a un CEDIS.
- Motor cartográfico frontend: MapLibre GL JS.
- Geocodificación inicial: Photon self-hosted mediante el backend.
- Ruteo inicial: OSRM mediante el backend.
- Optimización inicial: VROOM mediante el backend.
- Proveedor de estilos y tiles: TileServer GL self-hosted con PMTiles de México.
- Fuente y generación: snapshot de Geofabrik México procesado por Planetiler
  con el perfil OpenMapTiles.
- Style: OSM Bright versionado, servido same-origin por `/maps/`.

## Objetivo

Construir una UI administrativa que permita registrar una sucursal como una
`OperationalLocation` de tipo `BRANCH`, vinculada a un `DISTRIBUTION_CENTER`
activo, con sus datos de identidad, dirección y coordenadas geográficas.

La UI deberá dejar la sucursal disponible para el flujo operativo de suministro
CEDIS, pero el alta no deberá crear inventario, ciclos de suministro,
transferencias ni movimientos de stock.

## Alcance

### Incluido

- Registro del nombre de la sucursal.
- Registro de código opcional.
- Selección de un CEDIS padre activo.
- Registro de dirección.
- Registro manual de latitud y longitud.
- Selección de coordenadas mediante mapa.
- Búsqueda de dirección mediante geocodificación.
- Geocodificación inversa después de seleccionar o mover un punto.
- Fallback manual cuando el mapa o el geocodificador no estén disponibles.
- Validación frontend y backend de la jerarquía y las coordenadas.
- Invalidación de catálogos CEDIS después del alta.
- Navegación al detalle de la sucursal o al dashboard CEDIS.
- Configuración canónica del style mediante `VITE_MAP_STYLE_URL` en el frontend.
- Adaptadores backend reemplazables para geocodificación, ruteo y optimización.

### Fuera de alcance

- Crear automáticamente un CEDIS.
- Crear usuarios o asignarlos a la sucursal.
- Crear un balance inicial de inventario.
- Abrir un `BranchSupplyCycle` durante el alta.
- Crear un `InventoryTransfer` durante el alta.
- Crear precios, productos o equivalencias.
- Implementar CFDI, SAT, PAC o facturación fiscal.
- GPS en vivo, navegación giro a giro o rutas offline.
- Integrar hardware especializado.
- Elegir o contratar un proveedor comercial sin una decisión posterior.

## Estado actual verificado

### Dominio y API de ubicaciones

El sistema ya cuenta con `OperationalLocation` y con las reglas de jerarquía
CEDIS-sucursal.

Fuentes:

- `backend/prisma/schema.prisma:485-526` — modelo `OperationalLocation`.
- `backend/src/modules/locations/locations.controller.ts:26-103` — CRUD de ubicaciones.
- `backend/src/modules/locations/locations.service.ts:141-246` — creación,
  actualización y desactivación.
- `backend/src/modules/locations/dto/create-location.dto.ts:26-73` — DTO y
  validaciones de entrada.
- `specs/.specs/03-api/locations-api.md:1-121` — contrato canónico.

Reglas confirmadas:

- Una sucursal debe ser de tipo `BRANCH`.
- Una sucursal debe tener como padre directo un CEDIS activo.
- Un CEDIS es una raíz de tipo `DISTRIBUTION_CENTER`.
- `code` es opcional, pero debe ser único si se envía.
- `latitude` y `longitude` son opcionales, pero deben enviarse juntas.
- Latitud válida: `[-90, 90]`.
- Longitud válida: `[-180, 180]`.
- La creación requiere rol `ADMIN` y permiso `cedis.manage`.
- La desactivación es lógica y conserva la trazabilidad histórica.

### Geocodificación y mapas existentes

El backend ya expone geocodificación mediante NestJS:

- `GET /api/geocoding/search`.
- `GET /api/geocoding/reverse`.

El contrato canónico indica que Photon es self-hosted y que el navegador no
debe conocer sus URLs internas:

- `backend/src/modules/delivery/geocoding.controller.ts:11-39`.
- `backend/src/modules/delivery/routing-providers.service.ts:41-94`.
- `specs/.specs/03-api/delivery-api.md:5-27,52-84`.
- `specs/modules/routes-delivery/spec.md:49-70`.

`main` ya utiliza MapLibre para los mapas de rutas y Fleet en:

- `frontend/src/features/rutas-reparto/components/RoutePlannerMap.tsx`.
- `frontend/src/features/rutas-reparto/components/DriverRouteMap.tsx`.
- `frontend/src/features/fleet/components/FleetLiveMap.tsx`.

La configuración pública canónica es
`frontend/src/lib/maps/mapConfig.ts`: `VITE_MAP_STYLE_URL` se valida, se
resuelve y se entrega a MapLibre. No se reinstala MapLibre, no se agrega
Leaflet y no se crea una migración de renderer en esta rama.

### Infraestructura geoespacial

El perfil Docker de mapas ya contiene:

- Photon en `http://photon:2322`.
- OSRM en `http://osrm:5000`.
- VROOM en `http://vroom:3000`.
- PostGIS para persistencia espacial.
- TileServer GL privado para style, sprites, glyphs, TileJSON y PMTiles.

Fuentes:

- `docker/maps/README.md`.
- `docker-compose.yml:58-72`.
- `docker-compose.production.yml:56-67`.

TileServer GL se accede únicamente mediante el proxy same-origin `/maps/` del
frontend. Photon, OSRM y VROOM permanecen privados y solo son consumidos por
NestJS.

## Flujo funcional de alta

```text
ADMIN autorizado
      |
      v
GET /locations?type=DISTRIBUTION_CENTER&isActive=true
      |
      v
Formulario de nueva sucursal
      |
      +--> captura manual de dirección y coordenadas
      |
      +--> mapa MapLibre: clic o marcador arrastrable
      |
      +--> búsqueda/reversa mediante /api/geocoding/*
      |
      v
POST /api/locations con type=BRANCH y parentId=CEDIS
      |
      v
Invalidar catálogos y confirmar alta
      |
      v
GET /locations/:cedisId/branches incluye la nueva sucursal
```

El mapa será un asistente de ubicación, no la fuente de verdad. El backend
seguirá validando la jerarquía, el código y el rango de coordenadas.

## Diseño de la UI

### Ruta y acceso

Ruta propuesta:

```text
/admin/locations/branches/new
```

Protección:

- `RoleRoute` con rol `ADMIN`.
- `PermissionRoute` con `PERMISSIONS.cedisManage`.
- La API seguirá protegiendo la operación con `ADMIN` y `cedis.manage`.

Archivos frontend relacionados:

- `frontend/src/app/router.tsx`.
- `frontend/src/app/routeLoaders.ts`.
- `frontend/src/components/layout/routeAccess.ts`.
- `frontend/src/components/layout/navigation.ts`.
- `frontend/src/features/auth/permissions.ts`.

### Estructura visual

```text
┌──────────────────────────────────────────────────────────────┐
│ Nueva sucursal                                               │
│ Crea una ubicación que será abastecida desde un CEDIS        │
├──────────────────────────────┬───────────────────────────────┤
│ Identidad                    │ Abastecimiento                │
│ Nombre                       │ CEDIS padre                   │
│ Código opcional              │ CEDIS seleccionado            │
│                              │ Estado: lista para operar     │
├──────────────────────────────┴───────────────────────────────┤
│ Ubicación                                                    │
│ Dirección / Buscar dirección                                 │
│                                                              │
│                         MAPA                                 │
│                  marcador arrastrable                        │
│                                                              │
│ Latitud                              Longitud                │
├──────────────────────────────────────────────────────────────┤
│ Cancelar                                      Crear sucursal │
└──────────────────────────────────────────────────────────────┘
```

La composición será de dos columnas en escritorio y una columna en móvil. La
lista de campos continuará siendo utilizable aunque el mapa no cargue. Todos
los encabezados generados para la UI serán blancos, conforme a la convención
del proyecto.

### Campos

| Campo | Requerido por UI | Regla | Payload |
|---|---:|---|---|
| Nombre | Sí | Texto no vacío | `name` |
| Código | No | Único si se captura | `code` |
| Tipo | Implícito | No editable; siempre `BRANCH` | `type` |
| CEDIS padre | Sí | CEDIS activo | `parentId` |
| Dirección | No por contrato actual | Texto editable | `address` |
| Latitud | No por contrato actual | Debe acompañar longitud | `latitude` |
| Longitud | No por contrato actual | Debe acompañar latitud | `longitude` |

No convertir dirección o coordenadas en obligatorias sin actualizar primero
`specs/.specs/03-api/locations-api.md` y el contrato backend. La UI debe
recomendar capturar ubicación para que la sucursal sea utilizable en mapas y
rutas, pero el API actual permite crearla sin coordenadas.

### Estados de interfaz

- Inicializando catálogo de CEDIS.
- Cargando configuración del mapa.
- Mapa disponible.
- Mapa no disponible; captura manual habilitada.
- Buscando dirección.
- Sin resultados de búsqueda.
- Error temporal de geocodificación (`503`).
- Coordenadas incompletas.
- Coordenadas fuera de rango.
- CEDIS sin selección.
- Código duplicado (`409`).
- Usuario sin permiso (`403`).
- Guardando.
- Alta confirmada.

Los errores se mostrarán junto al campo afectado y también mediante un mensaje
global cuando el problema no corresponda a un campo específico. La UI no debe
perder las coordenadas capturadas si falla la geocodificación inversa.

## Contratos HTTP

### Listar CEDIS activos

```http
GET /api/locations?type=DISTRIBUTION_CENTER&isActive=true&page=1&limit=100
Authorization: Bearer <token>
```

La respuesta se consume como `data.items[]`. No se debe crear un endpoint
`cedis-candidates` mientras este filtro sea suficiente.

### Crear sucursal

```http
POST /api/locations
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "name": "Sucursal Centro",
  "code": "SUC-CENTRO",
  "type": "BRANCH",
  "parentId": "cedis-location-id",
  "address": "Av. Principal 123, Col. Centro",
  "latitude": 19.432608,
  "longitude": -99.133209
}
```

Respuesta esperada: `201 Created`, con la ubicación creada en `data`.

Errores que la UI debe traducir a estados operativos:

| HTTP | Situación |
|---:|---|
| `400` | Nombre, jerarquía o coordenadas inválidas |
| `403` | Falta de rol o permiso `cedis.manage` |
| `404` | CEDIS inexistente, inactivo o fuera de alcance |
| `409` | Código duplicado |

### Confirmar relación CEDIS-sucursal

```http
GET /api/locations/:cedisId/branches
Authorization: Bearer <token>
```

La consulta debe incluir la sucursal activa recién creada como hija directa del
CEDIS seleccionado.

## Flujo de suministro posterior

El alta no ejecuta suministro. El flujo existente continuará así:

### Crear ciclo

```http
POST /api/cedis/branch-supply-cycles
```

```json
{
  "distributionCenterLocationId": "cedis-location-id",
  "branchLocationId": "branch-location-id",
  "businessDate": "2026-08-11",
  "notes": "Primer ciclo de la sucursal"
}
```

Permiso: `cedis.dispatch`. Roles actuales: `ADMIN` y `WAREHOUSE`.

### Solicitar suministro

```http
POST /api/cedis/branch-supply-cycles/:cycleId/supplies
```

```json
{
  "expectedVersion": 1,
  "notes": "Suministro inicial",
  "items": [
    {
      "productId": "product-id",
      "unit": "KG",
      "quantityKg": 100
    }
  ]
}
```

Este endpoint crea el `InventoryTransfer` CEDIS → sucursal cuando hay stock
suficiente, productos activos y unidades compatibles.

### Consultar recepción

```http
GET /api/cedis/incoming-supplies?businessDate=2026-08-11&branchLocationId=branch-location-id&status=PENDING
```

### Recibir suministro

```http
POST /api/cedis/incoming-supplies/:transferId/receive
Idempotency-Key: <uuid>
```

La UI de alta no llamará estos endpoints. Como criterio de integración se
verificará que la sucursal creada pueda ser seleccionada posteriormente por el
flujo CEDIS.

## Arquitectura de mapas y proveedores

### Separación de responsabilidades

| Capa | Responsabilidad | Conoce proveedores concretos |
|---|---|---:|
| Dominio de sucursal | Nombre, padre, dirección y coordenadas | No |
| Servicio de ubicación | `GET/POST /locations` | No |
| Geocoding port | Buscar y resolver etiquetas | No |
| Photon adapter | Adaptar Photon al port | Sí |
| Routing port | Construir rutas | No |
| OSRM adapter | Adaptar OSRM al port | Sí |
| Optimization port | Ordenar paradas | No |
| VROOM adapter | Adaptar VROOM al port | Sí |
| MapLibre renderer | Renderizar mapa y marcador | Solo MapLibre |

MapLibre será el motor fijo de la primera implementación, pero no será el
contrato de negocio. Si en el futuro un proveedor comercial exige su propio
SDK o renderer, se agregará un renderer alternativo sin modificar la UI de
alta ni el dominio. No se asumirá que los tiles o estilos de Google Maps son
intercambiables con MapLibre; se respetarán las condiciones técnicas y de
licencia del proveedor seleccionado.

### Interfaces propuestas

Los contratos de `GeocodingProvider`, `RoutingProvider` y
`RouteOptimizationProvider` viven en
`backend/src/modules/geospatial/contracts/`; la configuración cartográfica del
navegador no es un puerto backend.

Los tipos finales deben reutilizar los tipos de rutas existentes en lugar de
introducir `unknown` en el código de aplicación. El bloque anterior expresa
los límites de los puertos, no el contrato definitivo de cada módulo.

### Configuración pública y secretos

La única fuente pública del style es:

```text
VITE_MAP_STYLE_URL=/maps/styles/operations/style.json
        -> runtimeMapConfig
        -> resolveMapStyle()
        -> MapLibre
```

El backend no expone un endpoint de configuración de style ni una segunda URL
de style. Nunca debe devolver al navegador:

- `PHOTON_URL`.
- `OSRM_URL`.
- `VROOM_URL`.
- URLs internas de Docker.
- Tokens privados.
- Credenciales de proveedores.

Variables operativas:

```text
MAP_TILES_URL=http://tileserver:8080

GEOCODING_PROVIDER=photon
GEOCODING_TIMEOUT_MS=5000
PHOTON_URL=http://photon:2322

ROUTING_PROVIDER=osrm
OSRM_URL=http://osrm:5000

ROUTE_OPTIMIZATION_PROVIDER=vroom
VROOM_URL=http://vroom:3000
ROUTING_TIMEOUT_MS=10000
```

`backend/src/config/env.validation.ts` deberá validar nombres de proveedores,
URLs obligatorias por capacidad y valores numéricos. Las variables internas no
deben pasar al bundle Vite.

## Proveedor aprobado de estilos y tiles

La decisión ya está cerrada para esta implementación:

- Renderer: MapLibre GL JS.
- TileServer: `maptiler/tileserver-gl:v5.6.0`, sin puerto de host en producción.
- Dataset: snapshot de México de Geofabrik, con URL, fecha y SHA-256 en el
  manifest generado.
- Generador: `ghcr.io/onthegomap/planetiler:v0.10.2` con perfil OpenMapTiles.
- Salida: `mexico.pmtiles`.
- Schema: OpenMapTiles v3.16.
- Style: OSM Bright en el commit
  `563b249f7ae71528b1f1e327cb9c019d0dda4c50`.
- Fonts: OpenMapTiles fonts v2.0, preparados fuera del arranque normal.
- Atribución visible: `© OpenMapTiles © OpenStreetMap contributors`.

El browser consume exclusivamente `/maps/**` same-origin y `/api/**`. No se
permite dependencia productiva de `tile.openstreetmap.org`, Photon, OSRM, VROOM
ni `tileserver:8080`. Si style, glyphs, sprites o tiles fallan, la UI conserva
la captura manual y muestra `MapUnavailableState`.

## Plan por fases

### Fase 0: especificaciones y decisiones — COMPLETED

Archivos a actualizar o crear:

- `specs/.specs/04-ui/locations.md` — especificación de la pantalla de alta.
- `specs/.specs/03-api/locations-api.md` — solo si cambia el contrato actual.
- `specs/.specs/03-api/delivery-api.md` — puertos y proveedor Photon inicial.
- `specs/.specs/04-ui/routes-delivery.md` — renderer desacoplado de Leaflet.
- `specs/modules/routes-delivery/spec.md` — geospatial provider-neutral.
- `docs/open-decisions.md` — proveedor de estilos y tiles.
- `specs/.specs/07-workflows/task/action.md` — TASK activa y trazable.

Actividades:

1. Documentar que la creación persiste únicamente una `BRANCH`.
2. Documentar que la sucursal queda vinculada a un CEDIS activo.
3. Documentar que el mapa no es requisito para la captura manual.
4. Documentar la ausencia de efectos de inventario durante el alta.
5. Reconciliar el renderer de rutas y Fleet ya consolidado en `main` como
   MapLibre.
6. Registrar la decisión aprobada de TileServer GL, Planetiler, OpenMapTiles,
   OSM Bright y Geofabrik.

Gate superado: los specs son provider-neutral, MapLibre ya está en `main` y el
proveedor productivo está aprobado.


### Fase 2: puertos y adaptadores backend — COMPLETED

Crear un módulo geoespacial o separar progresivamente el actual:

```text
backend/src/modules/geospatial/
├── contracts/
│   ├── geocoding-provider.ts
│   ├── routing-provider.ts
│   └── route-optimization-provider.ts
├── providers/
│   ├── photon-geocoding.provider.ts
│   ├── osrm-routing.provider.ts
│   └── vroom-route-optimization.provider.ts
└── geospatial.module.ts
```

Archivos existentes a modificar:

- `backend/src/modules/delivery/routing-providers.service.ts`.
- `backend/src/modules/delivery/geocoding.controller.ts`.
- `backend/src/modules/delivery/delivery.module.ts`.
- `backend/src/modules/delivery/routing-technical-status.service.ts`.
- `backend/src/config/env.validation.ts`.
- `.env.example`.
- `docker-compose.yml`.
- `docker-compose.production.yml`.

Actividades:

1. Extraer Photon, OSRM y VROOM a adaptadores independientes.
2. Registrar tokens DI por capacidad.
3. Mantener `/api/geocoding/search` y `/api/geocoding/reverse`.
4. Mantener respuestas normalizadas y campos OSM opcionales.
5. Separar fallas de geocodificación, ruteo y optimización.
6. Mantener la configuración del style fuera de NestJS; usar
   `MAP_TILES_URL` únicamente para estado técnico interno.
7. Cubrir timeouts, `503`, ausencia de resultados y errores de configuración.
8. Registrar proveedor, operación, latencia y resultado sin direcciones completas.

El módulo y los adaptadores Photon/OSRM/VROOM ya existen y se conservan. La
configuración backend duplicada de style fue retirada y el estado técnico
agrega `MapTiles` sin devolver URLs internas.

### Fase 3: fundación frontend de mapas — COMPLETED

MapLibre GL JS ya es dependencia del frontend y `main` ya lo utiliza en rutas y
Fleet. Esta fase no reinstala MapLibre, no agrega Leaflet y no migra desde cero
los mapas existentes.

Crear:

```text
frontend/src/features/maps/
├── types.ts
├── mapsService.ts
├── hooks.ts
├── LazyMapCanvas.tsx
├── MapLibreCanvas.tsx
├── MapUnavailableState.tsx
└── __tests__/
```

Responsabilidades:

- Cargar MapLibre de forma diferida.
- Mantener el mapa fuera del bundle inicial cuando la ruta no lo necesita.
- Importar el CSS de MapLibre dentro del chunk correspondiente.
- Crear y destruir la instancia correctamente.
- Configurar el style canónico y attribution desde runtime.
- Exponer eventos en `{ latitude, longitude }`.
- Convertir internamente a `[longitude, latitude]`.
- Manejar error de WebGL, style, tiles, glyphs y sprites.
- Respetar `prefers-reduced-motion`.
- No depender de un wrapper React adicional salvo que exista una necesidad
  comprobada.

### Fase 4: alta manual de sucursal — COMPLETED

Crear:

- `frontend/src/features/cedis/CedisBranchCreatePage.tsx`.
- `frontend/src/features/cedis/BranchLocationForm.tsx`.
- `frontend/src/features/cedis/branchLocationValidation.ts`.
- `frontend/src/features/cedis/__tests__/cedisBranchCreatePage.test.tsx`.

Modificar:

- `frontend/src/features/cedis/types.ts`.
- `frontend/src/features/cedis/cedisService.ts`.
- `frontend/src/features/cedis/hooks.ts`.
- `frontend/src/features/cedis/queryKeys.ts`.
- `frontend/src/features/cedis/index.ts`.
- `frontend/src/app/router.tsx`.
- `frontend/src/app/routeLoaders.ts`.
- `frontend/src/components/layout/navigation.ts`.

Actividades:

1. Crear tipos para `CedisLocation` y `CreateBranchLocationPayload`.
2. Consultar CEDIS activos usando el filtro actual de `/locations`.
3. Implementar validación espejo del DTO backend.
4. Enviar siempre `type: "BRANCH"`.
5. Mostrar la relación `CEDIS → sucursal` como contexto operativo.
6. Mantener captura manual como fuente de verdad e integrar el picker sin
   hacer que el mapa sea requisito.
7. Presentar errores `400`, `403`, `404` y `409`.
8. Invalidar ubicaciones, CEDIS y ramas después de `201 Created`.
9. No llamar ciclos, inventario ni transferencias.

Gate superado: el alta conserva captura manual y no crea ciclos, inventario ni
transferencias.

### Fase 5: picker MapLibre y geocodificación — PARTIAL

Crear:

- `frontend/src/features/maps/BranchLocationPicker.tsx`.
- `frontend/src/features/maps/__tests__/BranchLocationPicker.test.tsx`.

Actividades:

1. Inicializar el mapa con `MapClientConfig`.
2. Colocar el marcador al hacer clic.
3. Permitir arrastrar el marcador.
4. Actualizar latitud y longitud de manera atómica.
5. Ejecutar reverse geocoding después de `click` o `dragend`.
6. Mostrar la dirección propuesta sin reemplazar texto editado sin confirmación.
7. Buscar con debounce y cancelar solicitudes obsoletas.
8. Aplicar un resultado solo cuando el usuario lo seleccione.
9. Mantener el estado manual si el geocoder devuelve `503`.
10. Mostrar attribution visible en todo momento.
11. Mantener la experiencia de campos completa sin WebGL.

Implementado en código: el proveedor está aprobado, el picker reutiliza la
configuración canónica de `main`, conserva attribution y mantiene fallback
manual cuando WebGL, style, tiles, glyphs, sprites o geocoding fallan. Falta
ejecutar el smoke real contra TileServer GL a través del frontend Nginx para
cerrar el gate operativo. El contrato estático y el smoke HTTP de alta se
mantienen separados de esa evidencia runtime.

### Fase 6: infraestructura, seguridad y rollout — PARTIAL

Archivos probables:

- `docker/maps/README.md`.
- `docker/maps/*` para el servidor de estilos/tiles elegido.
- `docker/frontend/Dockerfile`.
- `docker-compose.yml`.
- `docker-compose.production.yml`.
- `.env.example`.
- Runbook de despliegue de mapas.

Actividades:

1. Agregar TileServer GL self-hosted aprobado con `mexico.pmtiles`.
2. Mantenerlo sin puertos públicos innecesarios.
3. Versionar datasets y estilos.
4. Configurar caché y healthchecks.
5. Agregar CSP explícita para workers, conexiones, imágenes, glyphs y sprites.
6. Validar attribution y licencias.
7. Crear smoke test de style, sprite, glyph y tile.
8. Exponer estado técnico agregado sin URLs internas.
9. Desplegar infraestructura antes del frontend.
10. Medir latencia, errores y disponibilidad por proveedor mediante estado
    técnico agregado y smoke rendering.
11. Ejecutar el smoke de alta por HTTP solo en una instalación
    disposable/dev/test, sin crear inventario.

Orden de despliegue:

```text
Infraestructura de mapas
  -> configuración backend
  -> backend y endpoints
  -> frontend MapLibre
  -> smoke de alta de sucursal
  -> habilitación gradual
```

### Fase 7: renderer de rutas — ABSORBIDA POR MAIN

La migración de rutas de Leaflet a MapLibre ya forma parte de `main` mediante
`RoutePlannerMap`, `DriverRouteMap` y el mapa de Fleet. No se reimplementa en
esta rama. Cualquier trabajo futuro se limita a una regresión o paridad
demostrada por una prueba fallida.

## Pruebas y criterios de aceptación

### Pruebas backend

- `POST /locations` rechaza sucursal sin CEDIS activo.
- `POST /locations` rechaza coordenada sin su pareja.
- `POST /locations` rechaza coordenadas fuera de rango.
- `POST /locations` rechaza código duplicado.
- Usuario sin `cedis.manage` recibe `403`.
- Alta válida devuelve `201`.
- Alta válida no crea balances, movimientos, transferencias ni ciclos.
- `backend/test/branch-location-registration.e2e-spec.ts` crea una sucursal
  nueva, prueba el flujo posterior CEDIS -> sucursal y verifica el balance
  recibido.
- `VITE_MAP_STYLE_URL` solo acepta un style público HTTP(S) sin credenciales o
  `/maps/**` same-origin; no expone URLs internas ni secretos.
- Photon, OSRM y VROOM fallan de forma independiente.
- Los errores de proveedores son observables y no generan persistencia parcial.

### Pruebas frontend

- ADMIN con `cedis.manage` puede abrir la ruta.
- Usuario no autorizado recibe `403`.
- El catálogo solo muestra CEDIS activos.
- El payload fija `type: "BRANCH"`.
- Se valida nombre vacío.
- Se valida CEDIS no seleccionado.
- Se valida coordenada incompleta.
- Se validan rangos de latitud y longitud.
- Se presenta correctamente un conflicto de código.
- El mapa actualiza el marcador con clic.
- El arrastre actualiza los campos manuales.
- Una búsqueda seleccionada actualiza dirección y coordenadas.
- Una reversa fallida conserva las coordenadas.
- Un mapa no disponible no bloquea el guardado manual.
- Las consultas CEDIS se invalidan después del alta.
- La interfaz funciona en móvil, teclado y lector de pantalla.
- Los encabezados generados son blancos.

### Prueba de integración operativa

```text
Crear sucursal
  -> aparece en GET /locations/:cedisId/branches
  -> aparece en el dashboard CEDIS
  -> se puede crear BranchSupplyCycle posteriormente
  -> se puede solicitar InventoryTransfer mediante supplies
  -> se puede recibir mediante incoming-supplies
```

### Comandos de validación

```bash
OPENSSL_CONF=/dev/null npm --prefix backend test -- --runInBand
OPENSSL_CONF=/dev/null npm --prefix backend run build
OPENSSL_CONF=/dev/null npm --prefix backend exec tsc -- --noEmit
npm --prefix frontend test -- --run
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
VITE_MAP_STYLE_URL=/maps/styles/operations/style.json npm --prefix frontend run build
VITE_MAP_STYLE_URL=/maps/styles/operations/style.json ./scripts/maps/verify-rendering-contract.sh
```

## Entregas recomendadas

El cambio completo excede el presupuesto recomendado de 400 líneas por revisión.
Se recomienda una cadena de feature branch, aunque la estrategia final debe
confirmarse antes de implementar.

| Entrega | Resultado |
|---|---|
| PR 1 | Specs, decisiones y contrato de proveedores |
| PR 2 | Infraestructura de mapas, Docker y CSP |
| PR 3 | Puertos/adaptadores backend y configuración pública |
| PR 4 | Alta manual de sucursal y autorización |
| PR 5 | Fundación MapLibre y picker geográfico |
| PR 6 | Estilos/tiles, CSP, observabilidad y rollout |
| PR 7 | Absorbida por `main`; solo regresiones si existe evidencia |

Estimación preliminar:

- Alta manual y pruebas: `300-450` líneas.
- Adaptadores y configuración backend: `300-450` líneas.
- Fundación y picker MapLibre: `350-550` líneas.
- Infraestructura, seguridad y documentación: `200-350` líneas.
- Migración de rutas: `400-700` líneas adicionales.

## Riesgos y decisiones pendientes

- Verificar en cada despliegue que el snapshot de Geofabrik y su SHA-256
  correspondan al manifest publicado.
- Mantener actualizados los avisos de licencia, sprites, glyphs y fonts cuando
  cambie el commit del style.
- Validar la CSP y el proxy same-origin en el entorno productivo real.
- Ejecutar `verify-stack.sh`, `verify-rendering.sh` y el smoke de alta contra
  un entorno disposable antes de habilitar el alta. Sin Docker, dataset o red,
  la fase permanece `PARTIAL`; no se infiere `PASS` desde pruebas estáticas.
- No acoplar el dominio a Photon, Google Maps, Mapbox, OSRM o VROOM.

## Referencias

- `specs/.specs/03-api/locations-api.md`.
- `specs/.specs/03-api/delivery-api.md`.
- `specs/.specs/03-api/branch-supply-cycles-api.md`.
- `specs/.specs/04-ui/routes-delivery.md`.
- `specs/modules/routes-delivery/spec.md`.
- `backend/src/modules/locations/locations.controller.ts`.
- `backend/src/modules/locations/locations.service.ts`.
- `backend/src/modules/delivery/routing-providers.service.ts`.
- `frontend/src/features/cedis/cedisService.ts`.
- `frontend/src/features/cedis/hooks.ts`.
- `frontend/src/features/rutas-reparto/deliveryService.ts`.
- `frontend/src/features/rutas-reparto/components/RoutePlannerMap.tsx`.
- `docker/maps/README.md`.
- `docs/audit/plan.md`, AUD-016 — dependencia pendiente e independiente sobre
  `backend start`.
