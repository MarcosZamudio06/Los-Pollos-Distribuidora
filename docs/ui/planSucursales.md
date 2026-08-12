# Plan de implementación: alta de sucursales y mapas desacoplados

## Estado del documento

- Estado: planificado, no implementado.
- Alcance principal: registrar una nueva sucursal operativa y asociarla a un CEDIS.
- Motor cartográfico frontend: MapLibre GL JS.
- Geocodificación inicial: Photon self-hosted mediante el backend.
- Ruteo inicial: OSRM mediante el backend.
- Optimización inicial: VROOM mediante el backend.
- Proveedor de estilos y tiles: pendiente de selección; se priorizará una opción abierta o self-hosted.

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
- Configuración reemplazable de renderer, estilos, tiles, geocodificación y rutas.
- Migración posterior de los mapas de rutas actuales de Leaflet a MapLibre.

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

El frontend actualmente utiliza Leaflet y React Leaflet en:

- `frontend/src/features/rutas-reparto/components/RoutePlannerMap.tsx`.
- `frontend/src/features/rutas-reparto/components/DriverRouteMap.tsx`.

Las URLs de tiles de OpenStreetMap están hardcodeadas en esos componentes.
El cambio a MapLibre deberá retirar ese acoplamiento antes de declarar migrado
el frontend cartográfico completo.

### Infraestructura geoespacial

El perfil Docker de mapas ya contiene:

- Photon en `http://photon:2322`.
- OSRM en `http://osrm:5000`.
- VROOM en `http://vroom:3000`.
- PostGIS para persistencia espacial.

Fuentes:

- `docker/maps/README.md`.
- `docker-compose.yml:58-72`.
- `docker-compose.production.yml:56-67`.

El stack actual no contiene un servidor de estilos o tiles para MapLibre. Esta
es una dependencia real que debe resolverse antes de activar el mapa en
producción.

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
│ Crea una ubicación que será abastecida desde un CEDIS         │
├──────────────────────────────┬───────────────────────────────┤
│ Identidad                    │ Abastecimiento                 │
│ Nombre                       │ CEDIS padre                    │
│ Código opcional              │ CEDIS seleccionado             │
│                              │ Estado: lista para operar      │
├──────────────────────────────┴───────────────────────────────┤
│ Ubicación                                                     │
│ Dirección / Buscar dirección                                 │
│                                                              │
│                         MAPA                                  │
│                  marcador arrastrable                        │
│                                                              │
│ Latitud                              Longitud                 │
├──────────────────────────────────────────────────────────────┤
│ Cancelar                                      Crear sucursal  │
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
| Map style port | Entregar configuración browser-safe | No |
| MapLibre renderer | Renderizar mapa y marcador | Solo MapLibre |

MapLibre será el motor fijo de la primera implementación, pero no será el
contrato de negocio. Si en el futuro un proveedor comercial exige su propio
SDK o renderer, se agregará un renderer alternativo sin modificar la UI de
alta ni el dominio. No se asumirá que los tiles o estilos de Google Maps son
intercambiables con MapLibre; se respetarán las condiciones técnicas y de
licencia del proveedor seleccionado.

### Interfaces propuestas

```ts
export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type GeocodingResult = Coordinates & {
  label: string;
  providerId?: string;
  providerType?: string;
};

export interface GeocodingProvider {
  search(input: {
    query: string;
    proximity?: Coordinates;
    limit: number;
  }): Promise<GeocodingResult[]>;

  reverse(point: Coordinates): Promise<GeocodingResult>;
}

export interface RoutingProvider {
  buildRoute(points: Coordinates[]): Promise<unknown>;
}

export interface RouteOptimizationProvider {
  optimize(input: unknown): Promise<unknown>;
}

export type MapClientConfig = {
  renderer: "maplibre";
  available: boolean;
  styleUrl: string;
  revision: string;
  attribution: Array<{ label: string; url?: string }>;
  defaultViewport: Coordinates & { zoom: number };
  capabilities: {
    geocoding: boolean;
    routing: boolean;
    optimization: boolean;
  };
};

export interface MapStyleConfigProvider {
  getClientConfig(): Promise<MapClientConfig>;
}
```

Los tipos finales deben reutilizar los tipos de rutas existentes en lugar de
introducir `unknown` en el código de aplicación. El bloque anterior expresa
los límites de los puertos, no el contrato definitivo de cada módulo.

### Configuración pública y secretos

Se propone agregar:

```http
GET /api/maps/config
Authorization: Bearer <token>
```

La respuesta solo podrá contener datos seguros para el navegador:

- Renderer.
- URL pública o same-origin del style JSON.
- Revisión del estilo.
- Atribución.
- Viewport por defecto.
- Capacidades disponibles.

Nunca deberá devolver:

- `PHOTON_URL`.
- `OSRM_URL`.
- `VROOM_URL`.
- URLs internas de Docker.
- Tokens privados.
- Credenciales de proveedores.

Este endpoint es nuevo y solo se implementará si la configuración runtime es
necesaria. No es necesario para la persistencia de sucursales.

Variables propuestas:

```text
MAP_RENDERING_ENABLED=true
MAP_STYLE_PROVIDER=self-hosted
MAP_STYLE_PUBLIC_URL=/maps/styles/operations/style.json
MAP_STYLE_REVISION=mexico-2026-08
MAP_DEFAULT_LATITUDE=19.1738
MAP_DEFAULT_LONGITUDE=-96.1342
MAP_DEFAULT_ZOOM=11

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

## Proveedor inicial de estilos y tiles

El stack existente no resuelve estilos ni tiles. Antes de construir el picker
MapLibre se realizará un spike técnico con estas alternativas:

- PMTiles servido desde almacenamiento estático o CDN.
- Martin o Tegola para vector tiles.
- TileServer GL para servir style JSON y recursos asociados.
- Proveedor comercial compatible con MapLibre, si existe una decisión legal y
  presupuestal posterior.

Criterios de selección:

- Cobertura de México.
- Style JSON completo con sprites y glyphs.
- Compatibilidad con MapLibre.
- Versionado de datasets y estilos.
- Atribución visible de OpenStreetMap y otras fuentes.
- Caché y rendimiento en móvil.
- Healthcheck y smoke test.
- Licencia compatible con uso empresarial.
- Endpoint público controlado o same-origin.
- Posibilidad de sustitución sin cambiar la UI.

Producción no deberá depender directamente de `tile.openstreetmap.org`: el
servicio público no ofrece SLA para este uso. Desarrollo puede utilizar una
fuente temporal únicamente con atribución y sin convertirla en dependencia
operativa.

## Plan por fases

### Fase 0: especificaciones y decisiones

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
5. Resolver la contradicción actual que fija React Leaflet en UI.
6. Definir criterios de proveedor de estilos antes de instalar infraestructura.

Gate: no implementar el renderer productivo mientras los specs mantengan una
dependencia obligatoria de React Leaflet o mientras no exista un proveedor de
style/tiles aprobado.

### Fase 1: normalización del gestor de paquetes

El repositorio contiene `package-lock.json` y scripts Docker/CI basados en npm,
pero `AGENTS.md` exige pnpm. MapLibre no debe introducir una tercera variante
de instalación.

Archivos probables:

- `package.json` raíz.
- `frontend/package.json`.
- `backend/package.json`.
- `pnpm-workspace.yaml`.
- `pnpm-lock.yaml`.
- `docker/frontend/Dockerfile`.
- `docker/backend/Dockerfile`.
- `.github/workflows/quality-gate.yml`.
- `README.md` y documentación de validación.

Actividades:

1. Fijar la versión de pnpm mediante `packageManager`.
2. Migrar scripts raíz a `pnpm --dir`.
3. Generar lockfile reproducible.
4. Actualizar Docker y CI para usar pnpm.
5. Eliminar lockfiles npm solo después de verificar paridad.

AUD-016, relativo a `backend start`, queda fuera de este cambio. Debe
corregirse en una tarea separada junto con AUD-017 y su smoke `build + start +
/health/ready`.

### Fase 2: puertos y adaptadores backend

Crear un módulo geoespacial o separar progresivamente el actual:

```text
backend/src/modules/geospatial/
├── contracts/
│   ├── geocoding-provider.ts
│   ├── routing-provider.ts
│   ├── route-optimization-provider.ts
│   └── map-style-config-provider.ts
├── providers/
│   ├── photon-geocoding.provider.ts
│   ├── osrm-routing.provider.ts
│   └── vroom-route-optimization.provider.ts
├── map-config.controller.ts
├── map-config.service.ts
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
6. Agregar `/api/maps/config` solo con información browser-safe.
7. Cubrir timeouts, `503`, ausencia de resultados y errores de configuración.
8. Registrar proveedor, operación, latencia y resultado sin direcciones completas.

### Fase 3: fundación frontend de mapas

Agregar `maplibre-gl` mediante pnpm y conservar Leaflet temporalmente para no
romper las rutas existentes.

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
- Configurar style URL y attribution desde runtime.
- Exponer eventos en `{ latitude, longitude }`.
- Convertir internamente a `[longitude, latitude]`.
- Manejar error de WebGL, style, tiles, glyphs y sprites.
- Respetar `prefers-reduced-motion`.
- No depender de un wrapper React adicional salvo que exista una necesidad
  comprobada.

### Fase 4: alta manual de sucursal

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
6. Implementar captura manual antes de integrar el mapa.
7. Presentar errores `400`, `403`, `404` y `409`.
8. Invalidar ubicaciones, CEDIS y ramas después de `201 Created`.
9. No llamar ciclos, inventario ni transferencias.

Gate: esta fase puede liberarse sin proveedor cartográfico, utilizando captura
manual de dirección y coordenadas.

### Fase 5: picker MapLibre y geocodificación

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

Gate: requiere proveedor de estilo/tiles aprobado, style JSON válido, recursos
de glyphs/sprites disponibles y CSP definida.

### Fase 6: infraestructura, seguridad y rollout

Archivos probables:

- `docker/maps/README.md`.
- `docker/maps/*` para el servidor de estilos/tiles elegido.
- `docker/frontend/Dockerfile`.
- `docker-compose.yml`.
- `docker-compose.production.yml`.
- `.env.example`.
- Runbook de despliegue de mapas.

Actividades:

1. Agregar el servicio de estilos/tiles self-hosted aprobado.
2. Mantenerlo sin puertos públicos innecesarios.
3. Versionar datasets y estilos.
4. Configurar caché y healthchecks.
5. Agregar CSP explícita para workers, conexiones, imágenes, glyphs y sprites.
6. Validar attribution y licencias.
7. Crear smoke test de style, sprite, glyph y tile.
8. Exponer estado técnico agregado sin URLs internas.
9. Desplegar infraestructura antes del frontend.
10. Medir latencia, errores y disponibilidad por proveedor.

Orden de despliegue:

```text
Infraestructura de mapas
  -> configuración backend
  -> backend y endpoints
  -> frontend MapLibre
  -> smoke de alta de sucursal
  -> habilitación gradual
```

### Fase 7: migración de rutas de Leaflet

Esta fase es necesaria para que MapLibre sea el motor cartográfico definitivo
del frontend, pero puede entregarse después de la alta de sucursales.

Componentes a migrar:

- `frontend/src/features/rutas-reparto/components/RoutePlannerMap.tsx`.
- `frontend/src/features/rutas-reparto/components/DriverRouteMap.tsx`.
- `frontend/src/features/rutas-reparto/components/RouteStopInfoMarker.tsx`.

Paridad requerida:

- GeoJSON de la ruta.
- Marcador de origen.
- Marcadores numerados.
- Marcadores arrastrables donde aplique.
- Segmento seleccionado.
- Flechas de dirección.
- Ajuste de viewport.
- Accesibilidad de lista alternativa.
- Fallback textual para rutas históricas sin geometría.

Solo después de la paridad se eliminarán:

- `leaflet`.
- `react-leaflet`.
- `@types/leaflet`.
- CSS y URLs de tiles hardcodeadas de Leaflet.

## Pruebas y criterios de aceptación

### Pruebas backend

- `POST /locations` rechaza sucursal sin CEDIS activo.
- `POST /locations` rechaza coordenada sin su pareja.
- `POST /locations` rechaza coordenadas fuera de rango.
- `POST /locations` rechaza código duplicado.
- Usuario sin `cedis.manage` recibe `403`.
- Alta válida devuelve `201`.
- Alta válida no crea balances, movimientos, transferencias ni ciclos.
- `/maps/config` no expone URLs internas ni secretos.
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
OPENSSL_CONF=/dev/null pnpm --dir backend test -- --runInBand
OPENSSL_CONF=/dev/null pnpm --dir backend run build
OPENSSL_CONF=/dev/null pnpm --dir backend exec tsc -- --noEmit
pnpm --dir frontend test
pnpm --dir frontend run typecheck
pnpm --dir frontend run lint
pnpm --dir frontend run build
```

## Entregas recomendadas

El cambio completo excede el presupuesto recomendado de 400 líneas por revisión.
Se recomienda una cadena de feature branch, aunque la estrategia final debe
confirmarse antes de implementar.

| Entrega | Resultado |
|---|---|
| PR 1 | Specs, decisiones y contrato de proveedores |
| PR 2 | Estandarización de pnpm, Docker y CI |
| PR 3 | Puertos/adaptadores backend y configuración pública |
| PR 4 | Alta manual de sucursal y autorización |
| PR 5 | Fundación MapLibre y picker geográfico |
| PR 6 | Estilos/tiles, CSP, observabilidad y rollout |
| PR 7 | Migración de mapas de rutas y retiro de Leaflet |

Estimación preliminar:

- Alta manual y pruebas: `300-450` líneas.
- Adaptadores y configuración backend: `300-450` líneas.
- Fundación y picker MapLibre: `350-550` líneas.
- Infraestructura, seguridad y documentación: `200-350` líneas.
- Migración de rutas: `400-700` líneas adicionales.

## Riesgos y decisiones pendientes

- Seleccionar servidor de estilos/tiles y confirmar cobertura de México.
- Confirmar licencia y attribution del estilo, tiles, glyphs y sprites.
- Resolver la migración de npm a pnpm antes de añadir dependencias nuevas.
- Definir si `/api/maps/config` será autenticado o público con un manifiesto sin
  datos sensibles; la recomendación inicial es autenticado para mantener una
  superficie coherente con la aplicación.
- Definir CSP final según los dominios del proveedor elegido.
- Mantener compatibilidad con rutas históricas mientras Leaflet coexiste.
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
