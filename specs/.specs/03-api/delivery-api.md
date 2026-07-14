# API — Rutas y reparto

Define contratos para rutas, pedidos de reparto, evidencia, incidencias, devoluciones y cobros en ruta. La experiencia móvil del chofer forma parte del MVP, pero no se asume operación offline hasta decisión posterior. El flujo debe distinguir quién entregó y quién cobró, incluso cuando exista segunda vuelta de cobranza.

## Contrato de planeación geoespacial

La primera versión geoespacial planea una ruta para un solo repartidor y únicamente con ventas confirmadas. La ruta inicia y termina en la misma ubicación operativa de origen.

Proveedores internos:

- Photon self-hosted: búsqueda y geocodificación inversa.
- VROOM: orden óptimo de paradas para un vehículo, minimizando tiempo de conducción.
- OSRM con perfil `driving`: geometría vial final, distancia y duración.
- PostgreSQL con PostGIS: persistencia e indexación geoespacial.

Convenciones:

- Coordenadas WGS84 (`EPSG:4326`).
- GeoJSON y motores de ruta usan `[longitude, latitude]`.
- Distancias en metros y duraciones en segundos.
- `geometry` es un `GeoJSON LineString` del recorrido completo origen-paradas-origen.
- `optimizationStatus`: `NOT_OPTIMIZED` o `OPTIMIZED`.
- `mapAvailable=true` solo cuando existen geometría y coordenadas completas.
- Un plan expira 30 minutos después de crearse y solo puede consumirse una vez.
- La UI nunca consume Photon, VROOM u OSRM directamente; las URLs permanecen en la red interna del backend.

Fuera de alcance: paradas libres sin venta, GPS en vivo, recálculo por desvíos, instrucciones giro a giro, mapas offline, capacidades, ventanas horarias y optimización de varios vehículos.

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

- `driverId`, `scheduledDate`, `originLocationId` y al menos una parada son requeridos.
- El repartidor debe estar activo y tener rol `DRIVER`.
- El origen debe estar activo y tener coordenadas válidas.
- Cada parada corresponde a una venta confirmada, no cancelada y no asignada a otra ruta.
- Para `routeId`, el plan debe incluir todas las paradas actuales más las nuevas; la ruta debe estar `PENDING`, sin liquidación y pertenecer al mismo contexto validado.
- No aceptar ventas duplicadas ni coordenadas fuera de rango.
- VROOM recibe un vehículo con `start=end` en el origen.
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
- `originLocationId`.

Respuesta `data.items[]`:

- `id`, `name`, `driverId`, `driverName`, `status`, `scheduledDate`, `originLocationId`, `routeStockLocationId`.
- `startedAt`, `completedAt`, `ordersCount`, `pendingOrdersCount`, `routeSettlementId`, `createdAt`.
- `optimizationStatus`, `mapAvailable`, `distanceMeters`, `durationSeconds`, `optimizedAt`, `routingProfile`, `routingDataVersion`.
- `routeSettlementId` es condicional: `null` u omitido si la ruta aún no tiene liquidación; presente si ya existe `RouteSettlement` para la ruta.

## GET /api/delivery-routes/:id

Propósito: obtener ruta con pedidos asignados, evidencia y cobros resumidos.

Permisos: `ADMIN`; `DRIVER` solo ruta propia; `COLLECTIONS` para cobros y saldos.

Respuesta `data`:

- Encabezado de ruta.
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
- Debe enviarse exactamente uno entre `routePlanId` y `orders[]`; son mutuamente excluyentes.
- Si se envía `routePlanId`, el plan debe pertenecer al ADMIN actual, no estar expirado ni consumido, y coincidir con repartidor, fecha y origen.
- Antes de consumir el plan, revalidar en la misma operación el repartidor, origen, ventas, cuentas por cobrar y asignaciones concurrentes.
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
- La tolerancia exacta de devolución o diferencia queda pendiente de negocio.
