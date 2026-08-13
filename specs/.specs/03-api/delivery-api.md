# API — Rutas y reparto

Define contratos para rutas, pedidos de reparto, evidencia, incidencias, devoluciones, cobros en ruta y operación geoespacial de flota. La experiencia móvil del chofer forma parte del MVP, pero no se asume operación offline hasta decisión posterior. El flujo debe distinguir quién entregó y quién cobró, incluso cuando exista segunda vuelta de cobranza.

## Contrato de planeación geoespacial

La primera versión geoespacial planea una ruta para un solo vehículo asignado a un solo repartidor y únicamente con ventas confirmadas. La ruta inicia y termina en la misma ubicación operativa de origen. `Vehicle` es una entidad operativa separada de `User` y del rol `DRIVER`.

Proveedores internos:

- Photon self-hosted: geocodificación directa (forward), búsqueda y geocodificación inversa.
- VROOM: orden óptimo de paradas para un vehículo, minimizando tiempo de conducción.
- OSRM con perfil `driving`: geometría vial final, distancia y duración.
- PostgreSQL con PostGIS: persistencia e indexación geoespacial.

Convenciones:

- Coordenadas WGS84 (`EPSG:4326`).
- GeoJSON y motores de ruta usan `[longitude, latitude]`.
- Distancias en metros y duraciones en segundos.
- `geometry` es un `GeoJSON LineString` del recorrido completo origen-paradas-origen.
- `VehiclePosition` usa un `GeoJSON Point` y una columna espacial PostGIS para conservar el historial de posiciones.
- Las zonas de entrega usan `GeoJSON Polygon` con coordenadas `[longitude, latitude]` y una columna espacial PostGIS para persistencia y consultas.
- `optimizationStatus`: `NOT_OPTIMIZED` o `OPTIMIZED`.
- `mapAvailable=true` solo cuando existen geometría y coordenadas completas.
- `DeliveryRoutePlanDraft` es temporal, expira 30 minutos después de crearse, solo puede consumirse una vez y conserva su entrada, resultado aprobado, hash, consumidor y ruta creada.
- Un reintento idempotente del consumo devuelve la misma ruta creada; no puede crear una segunda ruta ni consumir el borrador dos veces.
- Cada optimización corresponde a exactamente un vehículo y una ruta; VROOM no recibe ni optimiza múltiples vehículos.
- La UI nunca consume Photon, VROOM u OSRM directamente; las URLs permanecen en la red interna del backend.

Fuera de alcance: paradas libres sin venta, recálculo por desvíos, instrucciones giro a giro, mapas offline, capacidades, ventanas horarias, optimización de varios vehículos y tráfico en vivo. El tracking de posiciones de la ruta activa y la visualización administrativa de flota sí forman parte de este contrato; no constituyen navegación ni rerouting.

El navegador usa MapLibre GL JS únicamente como renderer. MapLibre no geocodifica, no ordena paradas, no calcula geometría, distancia o duración y no proporciona tráfico en vivo. `TrafficLayer` queda como capacidad futura condicionada a una fuente externa autorizada.

### GET /api/delivery-routing/technical-status

Propósito: exponer a ADMIN el estado técnico agregado de la arquitectura de routing y persistencia Fleet, sin convertir el endpoint en un catálogo de infraestructura interna.

Permisos: rol `ADMIN`.

La respuesta `data` incluye `status`, `checkedAt`, `routingDataVersion`, `dataset` (`version`, `preparedAt`, `ageDays`, `renewalRecommended`), `services` para `PostGIS`, `Photon`, `VROOM` y `OSRM` con `status` y `latencyMs`, `fleetPersistence.status`, `latestVehiclePositionAgeSeconds` (`number` o `null`) y `traffic` (`available` y `provider`). El último valor de Fleet es un agregado de persistencia y no contiene identificadores, coordenadas ni datos personales. Mientras no exista una fuente contratada y autorizada, `traffic` debe ser `{ "available": false, "provider": null }`; el estado técnico no fabrica segmentos.

El backend puede consultar Photon, VROOM y OSRM para este diagnóstico porque son proveedores internos de servidor; nunca devuelve sus URLs al navegador. La URL del estilo MapLibre (`VITE_MAP_STYLE_URL`) es una configuración exclusiva del frontend y no forma parte de este endpoint.

El contrato interno desacoplado `TrafficProvider` define `getTrafficSnapshot(bounds, observedAt)`, `getCapabilities()` y `healthCheck()`. La implementación por defecto es `NullTrafficProvider`, que no devuelve segmentos. No se expone todavía `GET /api/fleet/traffic`; si se habilita en una fase posterior sin proveedor disponible, deberá devolver explícitamente `available=false` y una colección vacía, nunca datos OSM estáticos etiquetados como tráfico vivo.

## Permisos geoespaciales y de flota

Los permisos son independientes de la entidad `User`, del rol `DRIVER` y de la asignación de una ruta:

- `fleet.view`: leer la vista global de flota, posiciones en vivo e históricas, eventos de geocerca y datos de heatmap persistidos.
- `fleet.manage`: crear y actualizar vehículos.
- `fleet.position.publish`: publicar posiciones del dispositivo para la ruta activa derivada de la sesión autenticada.
- `fleet.zones.manage`: crear y actualizar zonas de entrega y geocercas.
- `ADMIN` tiene los cuatro permisos.
- `DRIVER` tiene únicamente `fleet.position.publish` de este conjunto; nunca obtiene `fleet.view` global.

La autorización de cada endpoint se valida en backend. Tener rol `DRIVER` no permite leer la flota global ni publicar para otro conductor, vehículo o ruta.

## Contratos de Vehicle y rutas geoespaciales

### Vehicle

Representa el vehículo operativo, separado de `User` y de cualquier usuario con rol `DRIVER`.

Objeto de respuesta:

```json
{
  "id": "vehicle-id",
  "code": "UNIT-01",
  "displayName": "Reparto Centro",
  "plateNumber": "ABC-123",
  "homeLocationId": "location-id",
  "isActive": true,
  "createdAt": "2026-06-01T10:00:00.000Z",
  "updatedAt": "2026-06-19T12:10:00.000Z"
}
```

`code` es único. `plateNumber` es opcional y, cuando existe, es único. `homeLocationId` es opcional. No se define capacidad, telemetría de hardware ni relación de identidad entre vehículo y usuario.

### GET /api/vehicles

Propósito: listar vehículos operativos para los consumidores autorizados de flota.

Permisos: `fleet.view`.

Query opcional: `page`, `limit`, `search`, `isActive`.

Respuesta `data.items[]`: objetos `Vehicle` completos. Un usuario `DRIVER` no puede usar este endpoint por no tener `fleet.view`.

### POST /api/vehicles

Propósito: crear un vehículo operativo.

Permisos: `fleet.manage`.

Body:

```json
{
  "code": "UNIT-01",
  "displayName": "Reparto Centro",
  "plateNumber": "ABC-123",
  "homeLocationId": "location-id"
}
```

Validaciones:

- `code` y `displayName` son requeridos; `code` debe ser único.
- `plateNumber` es opcional, pero si se envía debe conservarse como identificador operativo único.
- `homeLocationId` es opcional y debe referir a una ubicación operativa válida cuando se envíe.
- Un vehículo nuevo inicia con `isActive=true`; no se crea una ruta implícita.

### PATCH /api/vehicles/:id

Propósito: actualizar datos operativos o desactivar un vehículo sin borrar su historial.

Permisos: `fleet.manage`.

Body parcial permitido: `code`, `displayName`, `plateNumber`, `homeLocationId`, `isActive`.

Validaciones:

- No borrar vehículos ni sus posiciones, rutas o incidencias históricas.
- No cambiar `isActive` a `false` en un vehículo con una ruta `IN_PROGRESS`; primero debe completarse o cancelarse la ruta.
- Un vehículo inactivo no puede seleccionarse para una nueva ruta geoespacial ni iniciar una ruta.

Una ruta histórica puede conservar `vehicleId=null`. Las rutas geoespaciales nuevas deben enviar y persistir `vehicleId`; no se crea un vehículo implícito a partir del `driverId`.

## Contratos de tracking, geocercas y analítica

### POST /api/fleet/positions

Propósito: recibir la posición GPS del navegador o dispositivo autenticado del `DRIVER` durante su ruta activa.

Permisos: `fleet.position.publish`; el actor efectivo debe ser un `DRIVER` autenticado con una ruta propia `IN_PROGRESS`.

El cliente obtiene la primera posición y las siguientes mediante la capacidad de geolocalización del navegador/dispositivo. El body **no acepta** `routeId`, `vehicleId` ni `driverId`; esos valores se derivan del JWT y de la asignación activa del backend.

Body:

```json
{
  "clientEventId": "client-event-id",
  "latitude": 19.1738,
  "longitude": -96.1342,
  "recordedAt": "2026-06-19T12:10:00.000Z",
  "accuracyMeters": 8.5,
  "speedKph": 29.5,
  "headingDegrees": 180
}
```

`clientEventId`, `latitude`, `longitude` y `recordedAt` son requeridos. `clientEventId` es único para evitar duplicados por reintentos. Los demás datos son opcionales y se validan por rango. En persistencia, `positionPoint` es `geometry(Point,4326)`; la respuesta lo serializa como GeoJSON `Point`. La respuesta `data` es:

```json
{
  "id": "position-id",
  "clientEventId": "client-event-id",
  "routeId": "route-id",
  "vehicleId": "vehicle-id",
  "driverId": "driver-id",
  "latitude": 19.1738,
  "longitude": -96.1342,
  "positionPoint": {
    "type": "Point",
    "coordinates": [-96.1342, 19.1738]
  },
  "accuracyMeters": 8.5,
  "speedKph": 29.5,
  "headingDegrees": 180,
  "recordedAt": "2026-06-19T12:10:00.000Z",
  "receivedAt": "2026-06-19T12:10:01.000Z"
}
```

Validaciones y privacidad:

- Rechazar si no existe una única ruta del `DRIVER` en `IN_PROGRESS`, si el vehículo está inactivo, si las coordenadas están fuera de rango o si la captura es inválida.
- Persistir cada posición histórica en PostGIS con WGS84 (`EPSG:4326`) y referencias derivadas a ruta, vehículo y conductor.
- No aceptar identificadores arbitrarios ni permitir que el cliente publique para otro `DRIVER`, vehículo o ruta.
- Detener la aceptación de posiciones cuando la ruta pasa a `COMPLETED` o `CANCELLED`; no aceptar GPS fuera de una ruta activa.
- Una reintención de red con el mismo `clientEventId` devuelve la misma posición y no debe duplicar el registro; el resultado debe permanecer asociado a la misma ruta derivada.
- Si un `clientEventId` ya usado llega con otro JWT o con una ruta/vehículo derivados distintos, responder `409 Conflict` sin revelar ni devolver la posición de otra asignación.

### GET /api/fleet/live

Propósito: obtener el snapshot administrativo de vehículos y rutas activas para el fleet map multi-vehículo/multi-ruta.

Permisos: `fleet.view`.

Query opcional: `routeId`, `vehicleId`, `from`, `to`, `includeZones`.

Respuesta `data`:

```json
{
  "vehicles": [
    {
      "vehicleId": "vehicle-id",
      "driverId": "driver-id",
      "routeId": "route-id",
      "routeStatus": "IN_PROGRESS",
      "positionPoint": {
        "type": "Point",
        "coordinates": [-96.1342, 19.1738]
      },
      "recordedAt": "2026-06-19T12:10:00.000Z",
      "lastPositionAt": "2026-06-19T12:10:00.000Z",
      "stale": false
    }
  ],
  "routes": [],
  "zones": []
}
```

El snapshot solo incluye datos de rutas `IN_PROGRESS` y posiciones persistidas; `stale` se calcula con la antigüedad de `lastPositionAt` y no significa tráfico. Un `DRIVER` no puede consultar este endpoint.

### GET /api/fleet/routes/:routeId/positions

Propósito: consultar posiciones históricas persistidas de una ruta.

Permisos: `fleet.view`.

Query: `from`, `to`, `page`, `limit`.

Respuesta `data.items[]`: `id`, `clientEventId`, `routeId`, `vehicleId`, `driverId`, `positionPoint` GeoJSON `Point`, `latitude`, `longitude`, `accuracyMeters`, `speedKph`, `headingDegrees`, `recordedAt` y `receivedAt`. El backend autoriza la ruta antes de devolver posiciones y nunca permite sustituir el `routeId` de la URL por un identificador enviado por el cliente.

### GET /api/delivery-zones

Propósito: listar zonas de entrega y geocercas.

Permisos: `fleet.view`.

Query opcional: `isActive`, `search`, `page`, `limit`.

Respuesta `data.items[]`:

```json
{
  "id": "zone-id",
  "name": "Centro",
  "originLocationId": "location-id",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[ -96.15, 19.18 ], [ -96.13, 19.18 ], [ -96.13, 19.16 ], [ -96.15, 19.16 ], [ -96.15, 19.18 ]]]
  },
  "isActive": true,
  "createdBy": "user-id",
  "updatedBy": "user-id",
  "createdAt": "2026-06-01T10:00:00.000Z",
  "updatedAt": "2026-06-01T10:00:00.000Z"
}
```

`geometry` se conserva como GeoJSON `Polygon` y `zoneGeometry` como `geometry(Polygon,4326)` en PostGIS. `zoneGeometry` es la representación de persistencia espacial; las respuestas JSON exponen la geometría canónica bajo `geometry`. `createdBy` y `updatedBy` se derivan del usuario autenticado; el cliente no puede falsificarlos. Desactivar no elimina eventos históricos.

### POST /api/delivery-zones

Propósito: crear una zona/geocerca operativa.

Permisos: `fleet.zones.manage`.

Body: `name`, `originLocationId` y `geometry` requeridos; `geometry` debe ser GeoJSON `Polygon`.

Validaciones:

- El polígono debe usar WGS84, coordenadas `[longitude, latitude]`, anillos cerrados, coordenadas dentro de rango y geometría válida no vacía.
- Persistir `geometry` y `zoneGeometry` en PostGIS e indexar `zoneGeometry` para consultas espaciales.
- Crear la zona sin generar eventos retroactivos ni posiciones.

### PATCH /api/delivery-zones/:id

Propósito: modificar una zona o desactivarla conservando su historial.

Permisos: `fleet.zones.manage`.

Body parcial permitido: `name`, `originLocationId`, `geometry`, `isActive`.

Al modificar `geometry`, actualizar `zoneGeometry`. Los `GeofenceEvent` existentes no se reescriben por cambios posteriores de la zona.

### GET /api/fleet/geofence-events

Propósito: consultar eventos de entrada y salida generados por el backend.

Permisos: `fleet.view`.

Query opcional: `routeId`, `vehicleId`, `zoneId`, `type`, `from`, `to`, `page`, `limit`.

Objeto `GeofenceEvent`:

```json
{
  "id": "geofence-event-id",
  "zoneId": "zone-id",
  "vehicleId": "vehicle-id",
  "routeId": "route-id",
  "positionId": "position-id",
  "type": "ENTER",
  "occurredAt": "2026-06-19T12:10:00.000Z"
}
```

`type` solo admite `ENTER` o `EXIT`. El backend compara posiciones consecutivas persistidas contra zonas activas y genera como máximo una transición por cruce. La identidad de reintento se deriva de `zoneId`, `positionId` y `type`, por lo que no se duplica el mismo evento. El cliente no puede crear, modificar ni eliminar eventos.

### GET /api/fleet/analytics/heatmap

Propósito: obtener heatmaps derivados de datos persistidos para análisis administrativo.

Permisos: `fleet.view`.

Query obligatorio: `metric`, `from` y `to`. En v1 `metric` admite únicamente `DELIVERIES` e `INCIDENTS`. `originLocationId`, `vehicleId` y `routeId` son filtros opcionales. El backend rechaza `from > to` y rangos mayores al máximo configurado.

`DELIVERIES` usa únicamente `DeliveryOrder.status=DELIVERED`, `deliveredAt` dentro del rango y coordenadas de parada válidas. `INCIDENTS` usa únicamente `DeliveryIncident` con coordenadas válidas y `occurredAt` dentro del rango. No se aceptan métricas económicas ni coordenadas enviadas por el cliente.

La respuesta es un `FeatureCollection` GeoJSON de `Point`. El backend agrega los registros en celdas PostGIS de resolución limitada y no devuelve puntos crudos sin límite:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-96.14, 19.17] },
      "properties": { "weight": 3, "count": 3, "metric": "DELIVERIES" }
    }
  ]
}
```

Los puntos, pesos y conteos deben derivarse de datos persistidos; la respuesta es para visualización histórica y no afirma tráfico en vivo. La UI solicita este endpoint únicamente cuando la capa de analítica está activa y conserva el periodo analizado visible.

## Socket.IO para fleet map

El backend expone Socket.IO en el namespace `/fleet` usando `path: /api/socket.io`. La conexión y cada evento se autorizan con JWT; solo clientes con `fleet.view` reciben el stream global. El socket no sustituye la autorización de los endpoints ni permite publicar GPS: la publicación continúa en `POST /api/fleet/positions`.

Los únicos cinco eventos `server -> client` de este contrato son:

1. `fleet.position.updated`: payload `VehiclePosition` persistido, con `routeId`, `vehicleId`, `driverId`, `positionPoint` y tiempos derivados.
2. `fleet.route.updated`: payload de `DeliveryRoute` después de iniciar, completar, cancelar o actualizar una ruta.
3. `fleet.incident.created`: payload `DeliveryIncident` persistido.
4. `fleet.geofence.entered`: payload `GeofenceEvent` persistido con `type=ENTER`.
5. `fleet.geofence.exited`: payload `GeofenceEvent` persistido con `type=EXIT`.

No se publican posiciones de rutas completadas o canceladas como eventos de tracking activo. Los clientes deben obtener el snapshot inicial mediante `GET /api/fleet/live` y tratar los eventos como actualizaciones de datos persistidos; no deben calcular rutas ni geocodificar en el navegador. Los cambios de zonas se consultan mediante `GET /api/delivery-zones`; no se agrega un sexto evento Socket.IO.

## GET /api/delivery-route-planning/eligible-sales

Propósito: listar ventas candidatas para una ruta.

Permisos: `ADMIN`.

Query:

- `page`, `limit`, `search`.
- `originLocationId` opcional.

Respuesta `data.items[]`:

- `saleId`, `saleNumber`, `customerId`, `customerName`.
- `accountReceivableId` cuando aplique.
- `suggestedDeliveryAddress`, derivada de la dirección de entrega del cliente y sin alterar el registro fuente.

Validaciones:

- Solo ventas `CONFIRMED` y no canceladas.
- Excluir ventas que ya pertenezcan a una ruta.
- La respuesta es informativa; creación y consumo del plan vuelven a validar elegibilidad.

## GET /api/geocoding/search

Propósito: buscar una dirección con Photon self-hosted.

Permisos: `ADMIN`.

Query:

- `q` requerido, de 3 a 200 caracteres.
- `latitude`, `longitude` opcionales para sesgo hacia el origen.
- `limit` opcional, máximo 10 y valor por defecto 5.

Reglas:

- Buscar con idioma español y `countrycode=MX`.
- Responder `data.items[]` con `label`, `latitude`, `longitude`, `osmType` y `osmId`.
- No guardar ni reemplazar direcciones de cliente o venta desde este endpoint.
- Photon no disponible o timeout: `503 Service Unavailable` con error identificable y reintentable.

## GET /api/geocoding/reverse

Propósito: obtener una etiqueta legible para un punto colocado o movido en el mapa.

Permisos: `ADMIN`.

Query:

- `latitude` entre `-90` y `90`.
- `longitude` entre `-180` y `180`.

Respuesta `data`: `label`, `latitude`, `longitude`, `osmType`, `osmId`.

La etiqueta normalizada se conserva como dato de planeación; no sobrescribe automáticamente la dirección comercial.

## POST /api/delivery-route-plans

Propósito: validar y calcular un borrador de ruta antes de crearla o agregar pedidos a una ruta mapeada.

Permisos: `ADMIN`.

Body importante:

```json
{
  "routeId": "string opcional para reoptimización",
  "driverId": "string",
  "vehicleId": "string",
  "scheduledDate": "2026-06-19",
  "originLocationId": "string",
  "stops": [
    {
      "saleId": "string",
      "accountReceivableId": "string opcional",
      "deliveryAddress": "Dirección seleccionada para la entrega",
      "latitude": 19.1738,
      "longitude": -96.1342,
      "geocoderOsmType": "N",
      "geocoderOsmId": "string opcional"
    }
  ]
}
```

Respuesta `data`:

```json
{
  "id": "route-plan-id",
  "vehicleId": "vehicle-id",
  "expiresAt": "2026-06-19T10:30:00.000Z",
  "orderedStops": [
    {
      "saleId": "string",
      "sequence": 1,
      "latitude": 19.1738,
      "longitude": -96.1342,
      "legDistanceMeters": 4300,
      "legDurationSeconds": 720
    }
  ],
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [-96.1421, 19.1802],
      [-96.1342, 19.1738],
      [-96.1421, 19.1802]
    ]
  },
  "distanceMeters": 8600,
  "durationSeconds": 1440,
  "routingProfile": "driving",
  "routingDataVersion": "string"
}
```

Validaciones:

- `driverId`, `vehicleId`, `scheduledDate`, `originLocationId` y al menos una parada son requeridos para una nueva planeación geoespacial.
- El repartidor debe estar activo y tener rol `DRIVER`.
- El vehículo debe estar activo y disponible; no puede tener otra ruta `IN_PROGRESS` y no puede confundirse con el `driverId`.
- El origen debe estar activo y tener coordenadas válidas.
- Cada parada corresponde a una venta confirmada, no cancelada y no asignada a otra ruta.
- Para `routeId`, el plan debe incluir todas las paradas actuales más las nuevas; la ruta debe estar `PENDING`, sin liquidación y pertenecer al mismo contexto validado.
- Para `routeId`, `vehicleId` debe coincidir con el vehículo de la ruta optimizada; una ruta histórica sin vehículo no puede recibir un plan geoespacial sin seleccionar un vehículo activo.
- No aceptar ventas duplicadas ni coordenadas fuera de rango.
- VROOM recibe exactamente un vehículo identificado por `vehicleId`, con `start=end` en el origen.
- Cualquier parada no asignada o inalcanzable responde `422 Unprocessable Entity` e identifica los `saleId` afectados; no crea borrador consumible.
- Timeout o indisponibilidad de VROOM u OSRM responde `503 Service Unavailable` y no crea ruta.

## Representación de `routeSettlementId`

`routeSettlementId` identifica la liquidación de ruta asociada a cobros, movimientos o vistas de reparto cuando dicha liquidación ya existe. Su presencia es condicional:

- No se envía en `POST /api/delivery-routes` ni en actualización de estados, evidencia o incidencias; esos endpoints no crean ni seleccionan la liquidación.
- Es `null` u omitido en respuestas de rutas, pedidos y cobros mientras la ruta no tenga una `RouteSettlement` abierta o cerrada.
- Es requerido en la respuesta de cualquier `Payment` o movimiento relacionado con ruta cuando el registro ya fue asociado a una liquidación existente.
- En el MVP, `Payment.accountReceivableId` sigue siendo requerido para todo cobro en ruta; `routeSettlementId` no sustituye la cuenta por cobrar ni habilita pagos distribuidos.
- La creación, apertura, cálculo o cierre de la liquidación se define en `route-settlements-api.md`; este archivo solo expone la referencia cuando aplica dentro de contratos de reparto.

## GET /api/delivery-routes

Propósito: listar rutas.

Permisos: `ADMIN`; `DRIVER` solo rutas propias; `COLLECTIONS` consulta de rutas con cobros; `WAREHOUSE` consulta si afecta devoluciones.

Query:

- `page`, `limit`.
- `driverId`, `status`, `scheduledDate`.
- `vehicleId`.
- `originLocationId`.

Respuesta `data.items[]`:

- `id`, `name`, `driverId`, `driverName`, `vehicleId`, `vehicleCode`, `status`, `scheduledDate`, `originLocationId`, `routeStockLocationId`.
- `startedAt`, `completedAt`, `ordersCount`, `pendingOrdersCount`, `routeSettlementId`, `createdAt`.
- `optimizationStatus`, `mapAvailable`, `distanceMeters`, `durationSeconds`, `optimizedAt`, `routingProfile`, `routingDataVersion`.
- `routeSettlementId` es condicional: `null` u omitido si la ruta aún no tiene liquidación; presente si ya existe `RouteSettlement` para la ruta.

## GET /api/delivery-routes/:id

Propósito: obtener ruta con pedidos asignados, evidencia y cobros resumidos.

Permisos: `ADMIN`; `DRIVER` solo ruta propia; `COLLECTIONS` para cobros y saldos.

Respuesta `data`:

- Encabezado de ruta, incluyendo `driverId`, `driverName`, `vehicleId` (nullable para rutas históricas o legacy no geoespaciales), `vehicleCode` cuando exista, `status`, `scheduledDate`, `originLocationId`, `startedAt` y `completedAt`.
- `orders[]`: `id`, `saleId`, `saleNumber`, `accountReceivableId`, `status`, `deliveryAddress`, `latitude`, `longitude`, `stopSequence`, `legDistanceMeters`, `legDurationSeconds`, `deliveredAt`, `deliveredByUserId`, `collectedByUserId`, `collectionPass`, `notes`.
- `optimizationStatus`, `mapAvailable`, `geometry`, `distanceMeters`, `durationSeconds`, `optimizedAt`, `routingProfile`, `routingDataVersion`.
- `evidenceSummary[]`: tipos capturados por pedido.
- `collectionsSummary`: montos esperados y cobrados por método, primera vuelta y segunda vuelta.
- `routeSettlementId` si existe liquidación asociada a la ruta; `null` u omitido si la liquidación todavía no ha sido abierta o calculada.

Notas:

- Cualquier monto cobrado visible por pedido debe derivarse de `Payment`, no de un campo persistido en `DeliveryOrder`.
- Para rutas optimizadas, `orders[]` se devuelve por `stopSequence` ascendente.
- Para rutas históricas sin geometría, `mapAvailable=false`, los campos geoespaciales pueden ser `null` u omitirse y el contrato textual permanece vigente.

## POST /api/delivery-routes

Propósito: crear ruta y asignar ventas confirmadas. La creación geoespacial consume un borrador calculado por `POST /api/delivery-route-plans`.

Permisos: `ADMIN`.

Headers para creación geoespacial:

- `Idempotency-Key` requerido.

Body geoespacial:

```json
{
  "name": "Ruta Centro",
  "driverId": "string",
  "vehicleId": "string",
  "scheduledDate": "2026-06-19",
  "originLocationId": "string",
  "routeStockLocationId": "string opcional o autogenerado",
  "routePlanId": "string"
}
```

Body legado compatible para una ruta no geoespacial:

```json
{
  "name": "Ruta Centro",
  "driverId": "string",
  "scheduledDate": "2026-06-19",
  "originLocationId": "string opcional",
  "routeStockLocationId": "string opcional o autogenerado",
  "orders": [
    {
      "saleId": "string",
      "accountReceivableId": "string opcional",
      "deliveryAddress": "Dirección de entrega"
    }
  ]
}
```

Respuesta `data`: ruta creada con pedidos.

Validaciones:

- `driverId` y `scheduledDate` requeridos.
- Para una creación geoespacial con `routePlanId`, `vehicleId` es requerido y debe coincidir con el vehículo persistido en `DeliveryRoutePlanDraft`.
- Debe enviarse exactamente uno entre `routePlanId` y `orders[]`; son mutuamente excluyentes.
- Si se envía `routePlanId`, el plan debe pertenecer al ADMIN actual, no estar expirado ni consumido, y coincidir con repartidor, fecha y origen.
- Antes de consumir el plan, revalidar en la misma operación el repartidor, vehículo, origen, ventas, cuentas por cobrar y asignaciones concurrentes.
- La creación geoespacial persiste atómicamente geometría, distancia, duración, secuencia y coordenadas exactamente del plan aprobado.
- Reutilizar `Idempotency-Key` con el mismo payload devuelve la ruta creada; reutilizarla con otro payload responde `409 Conflict`.
- La ruta debe crear o asociar una `OperationalLocation` de tipo `ROUTE_STOCK`.
- Solo ventas confirmadas pueden asignarse.
- No asignar ventas canceladas.
- Si la venta tiene saldo a crédito, el pedido debe poder relacionarse con `accountReceivableId`.
- `originLocationId` debe conservarse cuando la ruta salga de una ubicación operativa definida.
- `orders[]` puede contener ventas pagadas al entregar, ventas a crédito y ventas con cobranza posterior.
- Las ventas de canal `ROUTE` deben usar `routeStockLocationId` como ubicación operativa de descuento.
- Un plan expirado, consumido por otra operación o invalidado por concurrencia responde `409 Conflict` y no crea registros parciales.
- El body legado puede omitir `vehicleId` para conservar el flujo de rutas no geoespaciales; nunca permite crear una nueva ruta geoespacial sin vehículo. Las rutas históricas también pueden conservar `vehicleId=null`.

## POST /api/delivery-routes/:id/orders

Propósito: asignar ventas confirmadas adicionales a una ruta existente antes de que tenga liquidación asociada.

Permisos: `ADMIN`.

Body importante:

```json
{
  "orders": [
    {
      "saleId": "string",
      "accountReceivableId": "string opcional",
      "deliveryAddress": "Dirección de entrega"
    }
  ]
}
```

Para una ruta con `optimizationStatus=OPTIMIZED`, el body anterior no es suficiente. Debe enviarse:

```json
{
  "routePlanId": "string"
}
```

El plan debe haberse calculado con `routeId` e incluir todas las paradas existentes más las nuevas. La forma `orders[]` se conserva únicamente para rutas históricas con `optimizationStatus=NOT_OPTIMIZED`.

Respuesta `data`: ruta actualizada con pedidos.

Validaciones:

- La ruta debe existir.
- La ruta no debe estar `COMPLETED` ni `CANCELLED`.
- La ruta no debe tener `RouteSettlement` abierta o cerrada.
- Solo ventas confirmadas pueden asignarse.
- No asignar ventas canceladas.
- No asignar ventas duplicadas dentro de la misma ruta.
- No asignar ventas que ya pertenezcan a otra ruta.
- Si la venta tiene saldo a crédito, el pedido debe conservar `accountReceivableId`.
- `routeSettlementId` no se acepta en el body; la liquidación se abre/calcula mediante `route-settlements-api.md`.
- Una ruta optimizada debe reemplazar secuencia, geometría y métricas en la misma transacción que agrega los pedidos; nunca puede quedar con un mapa obsoleto.

## Contrato de `DeliveryIncident`

`DeliveryIncident` es la entidad trazable para incidencias operativas de flota y reparto. Una incidencia puede relacionarse con un pedido, pero una incidencia de vehículo, zona o ruta no requiere un pedido.

Objeto de respuesta:

```json
{
  "id": "incident-id",
  "type": "DELIVERY_DELAY",
  "status": "OPEN",
  "reason": "Cliente no localizado",
  "details": "Se intentó contacto en dos ocasiones",
  "routeId": "route-id",
  "deliveryOrderId": "delivery-order-id",
  "vehicleId": "vehicle-id",
  "driverId": "driver-id",
  "positionId": "position-id",
  "statusSnapshot": "NOT_DELIVERED",
  "latitude": 19.1738,
  "longitude": -96.1342,
  "zoneId": "zone-id",
  "returnedItems": [],
  "occurredAt": "2026-06-19T12:15:00.000Z",
  "reportedAt": "2026-06-19T12:15:02.000Z",
  "reportedByUserId": "driver-id",
  "evidence": [],
  "resolution": null,
  "resolvedAt": null,
  "resolvedByUserId": null,
  "createdAt": "2026-06-19T12:15:02.000Z",
  "updatedAt": "2026-06-19T12:15:02.000Z"
}
```

`type` admite `DELIVERY_DELAY`, `DELIVERY_FAILURE`, `VEHICLE_BREAKDOWN`, `SAFETY`, `GEOFENCE_EXCEPTION` y `OTHER`. `status` admite `OPEN`, `IN_REVIEW`, `RESOLVED` y `CANCELLED`. Cada incidencia debe asociarse a una `DeliveryOrder` o `DeliveryRoute`; `deliveryOrderId` y `routeId` se conservan según el contexto, y una incidencia de una ruta activa requiere `routeId` y `vehicleId`. `reportedByUserId`, `reason`, `statusSnapshot`, `occurredAt` y, cuando existan, `latitude`/`longitude` son parte de la trazabilidad. El backend conserva quién reportó, cuándo, desde qué posición y cómo se resolvió.

Las incidencias derivadas de `POST /api/delivery-orders/:id/incidents` deben crear o actualizar el `DeliveryIncident` correspondiente, sin perder el contrato existente de no entrega, devolución o rechazo parcial. `returnedItems` continúa siendo trazable mediante ese flujo, se expone cuando aplica y conserva los productos, unidades, cantidades y motivos devueltos. Las incidencias asociadas solo a una ruta, vehículo o zona son registros generados por el backend desde el flujo de tracking/geocercas; esta TASK no agrega otro endpoint público de creación. Las incidencias de flota pueden emitirse como `fleet.incident.created` y alimentar el heatmap desde datos persistidos.

## PATCH /api/delivery-routes/:id/status

Propósito: actualizar estado de ruta.

Permisos: `ADMIN`; `DRIVER` limitado a ruta propia según transición permitida.

Body importante:

```json
{
  "status": "IN_PROGRESS",
  "notes": "Inicio de ruta"
}
```

Validaciones:

- No completar ruta si existen pedidos pendientes sin estado final.
- Estados esperados: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.
- Al cambiar a `IN_PROGRESS`, `vehicleId` debe existir y el backend debe verificar atómicamente que el vehículo no tenga otra ruta `IN_PROGRESS`; un conflicto responde `409 Conflict` sin cambiar el estado.
- Al cambiar a `COMPLETED` o `CANCELLED`, el backend detiene la aceptación de GPS para esa ruta y emite `fleet.route.updated`; no se aceptan posiciones posteriores ni se agrega otro evento Socket.IO.

## PATCH /api/delivery-orders/:id/status

Propósito: actualizar estado de pedido dentro de una ruta.

Permisos: `ADMIN`; `DRIVER` limitado a pedido asignado.

Body importante:

```json
{
  "status": "DELIVERED",
  "notes": "Entregado a cliente",
  "deliveredAt": "2026-06-19T12:00:00.000Z"
}
```

Respuesta `data`: pedido actualizado.

Validaciones:

- Repartidor solo actualiza pedidos asignados a su usuario.
- Si `status=DELIVERED`, registrar `deliveredAt`.
- Soportar `PENDING`, `IN_ROUTE`, `DELIVERED`, `NOT_DELIVERED`, `CANCELLED`, `PARTIALLY_REJECTED`, `RETURNED`.
- Rechazo parcial, devolución o incidencia debe conservar nota o motivo.
- El pedido debe conservar `deliveredByUserId` y `collectedByUserId` cuando existan.
- No permitir confirmar una venta o devolución de ruta sin `routeStockLocationId` asociado a la ruta.

## POST /api/delivery-orders/:id/evidence

Propósito: capturar evidencia de entrega o incidencia.

Permisos: `ADMIN`; `DRIVER` limitado a pedido asignado.

Body importante:

```json
{
  "type": "PHOTO",
  "value": "referencia-o-url-interna",
  "capturedAt": "2026-06-19T12:05:00.000Z"
}
```

Respuesta `data`: evidencia registrada.

Validaciones:

- `type` requerido: `PHOTO`, `SIGNATURE`, `GEOLOCATION`, `NOTE`.
- `capturedAt` requerido.
- La combinación obligatoria de evidencia queda pendiente de negocio; no inventar obligatoriedad final.

## POST /api/delivery-orders/:id/collections

Propósito: registrar cobro recibido en ruta para una cuenta por cobrar.

Permisos: `DRIVER` limitado a pedido asignado; `ADMIN`; `COLLECTIONS` conforme a política.

Body importante:

```json
{
  "accountReceivableId": "string",
  "amount": 1200,
  "paymentMethod": "CASH",
  "reference": "Cobro en ruta",
  "paidAt": "2026-06-19T12:10:00.000Z"
}
```

Respuesta `data`:

- `payment`: `id`, `accountReceivableId`, `customerId`, `routeId`, `routeSettlementId`, `amount`, `paymentMethod`, `status`, `paidAt`.
- `deliveryOrder`: `id`, `status`, `derivedCollectedAmount`.
- `routeSettlementId` en `payment` es condicional: `null` u omitido si el cobro se registra antes de abrir la liquidación; presente si ya existe una liquidación de ruta y el pago queda asociado a ella.

Validaciones:

- `accountReceivableId` requerido.
- Solo registrar cobro si el pedido tiene saldo por cobrar y la política lo permite.
- El pago no puede exceder el saldo pendiente.
- Asociar pago a la ruta siempre y a `routeSettlementId` cuando ya exista liquidación para esa ruta.
- No aceptar `routeSettlementId` como sustituto de `accountReceivableId`; cada pago del MVP debe conservar `accountReceivableId` requerido.
- La API debe permitir marcar si el cobro corresponde a primera o segunda vuelta de cobranza.
- Contraentrega o cobro al entregar no se considera dinero recibido hasta persistir `Payment`.

## POST /api/delivery-orders/:id/incidents

Propósito: registrar no entrega, devolución, rechazo parcial o incidencia.

Permisos: `DRIVER` limitado a pedido asignado; `ADMIN`.

Body importante:

```json
{
  "status": "PARTIALLY_REJECTED",
  "reason": "Cliente rechazó parte del pedido",
  "returnedItems": [
    {
      "productId": "string",
      "unit": "KG",
      "quantityKg": 2.5,
      "quantityPieces": 0,
      "reason": "Rechazo parcial"
    }
  ]
}
```

Validaciones:

- `reason` requerido.
- Si afecta inventario, debe generar trazabilidad y movimiento con ubicación `ROUTE_STOCK` y motivo cuando corresponda.
- Persistir un `DeliveryIncident` trazable con `routeId`, `deliveryOrderId`, `vehicleId` y `driverId` derivados de la asignación; asociar `positionId` y `zoneId` cuando existan.
- El cliente no puede asignar arbitrariamente vehículo, conductor, ruta, posición o zona a la incidencia.
- La tolerancia exacta de devolución o diferencia queda pendiente de negocio.
