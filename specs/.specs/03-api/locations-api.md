# API — Ubicaciones operativas

Define contratos para administrar `OperationalLocation`, la abstracción usada por inventario, ventas, compras, traspasos, rutas y configuración operativa. La jerarquía CEDIS-sucursal está cerrada: un CEDIS es una raíz `DISTRIBUTION_CENTER` y una sucursal directa es `BRANCH` con su `parentId`.

## GET /api/locations

Propósito: listar ubicaciones operativas activas o históricas.

Permisos: `ADMIN`, `WAREHOUSE`; `SELLER` y `DRIVER` solo lectura cuando el flujo lo requiera.

Query:

- `page`, `limit`, `search`.
- `type`: `BRANCH`, `WAREHOUSE`, `DISTRIBUTION_CENTER`, `MIXED`, `EXTERNAL_POINT_OF_SALE`, `ROUTE_STOCK`.
- `parentId`.
- `isActive`.
- `inventoryStorageOnly=true` for inventory-transfer selectors; this scope
  returns only active `OperationalLocation` records whose `type` belongs to the
  canonical inventory-storage allowlist, including `ROUTE_STOCK`.
- When `type` and `inventoryStorageOnly=true` are combined, the filters are
  intersected; a non-canonical type returns no records.

Respuesta `data.items[]`:

- `id`, `name`, `code`, `type`, `parentId`, `address`, `latitude`, `longitude`, `isActive`.
- `createdAt`, `updatedAt`.

Validaciones:

- `ADMIN` ve el catálogo global. `SELLER`, `DRIVER` y `COLLECTIONS` solo ven su ubicación asignada. `WAREHOUSE` ve el CEDIS asignado y sus sucursales directas activas.
- With `inventoryStorageOnly=true`, `WAREHOUSE` also sees active `ROUTE_STOCK`
  locations associated with a delivery route originating at the assigned CEDIS
  or one of its active direct branches; route-planning records are excluded.
- Un `DISTRIBUTION_CENTER` tiene `parentId=null`; un `BRANCH` requiere como padre un CEDIS activo. `ROUTE_STOCK` y `EXTERNAL_POINT_OF_SALE` conservan su relación operativa compatible con su sucursal.

## GET /api/locations/:id

Propósito: obtener una ubicación operativa.

Permisos: `ADMIN`, `WAREHOUSE`; los demás roles operativos solo pueden leer su ubicación asignada.

Respuesta `data`: campos de la ubicación y, si aplica, resumen de uso operativo.

## GET /api/locations/:id/branches

Propósito: listar exclusivamente las sucursales activas directas del CEDIS solicitado.

Permisos: `cedis.view`; solo `ADMIN` y `WAREHOUSE`. `WAREHOUSE` requiere que `id` sea su CEDIS asignado. Un identificador inexistente, inactivo o que no sea `DISTRIBUTION_CENTER` no revela datos.

Respuesta `data.items[]`: ubicaciones `BRANCH` activas con `parentId=id`, ordenadas por nombre. No incluye nietos, otros tipos ni sucursales de otro CEDIS.

## POST /api/locations

Propósito: crear ubicación operativa.

Permisos: `ADMIN`.

Body importante:

```json
{
  "name": "Almacén Principal",
  "code": "ALM-001",
  "type": "EXTERNAL_POINT_OF_SALE",
  "parentId": "string opcional",
  "address": "Dirección operativa",
  "latitude": 19.183,
  "longitude": -96.134
}
```

Respuesta `data`: ubicación creada.

Validaciones:

- `name` requerido.
- `type` requerido.
- `code` único si existe.
- `type` limitado a `BRANCH`, `WAREHOUSE`, `DISTRIBUTION_CENTER`, `MIXED`, `EXTERNAL_POINT_OF_SALE`, `ROUTE_STOCK`.
- Latitud y longitud se envían juntas; sus rangos son `[-90, 90]` y `[-180, 180]` respectivamente.
- El padre debe existir, estar activo y no crear ciclos. Un CEDIS no tiene padre; una sucursal requiere un CEDIS activo como padre.
- `EXTERNAL_POINT_OF_SALE` representa una pollería externa a matriz y debe operar como ubicación de inventario, venta y cierre diario.
- `ROUTE_STOCK` representa inventario cargado a una ruta y no debe reutilizarse entre rutas activas distintas.

### Reglas específicas para `type=BRANCH`

Estas reglas aplican únicamente cuando el body de `POST /api/locations` solicita
una sucursal; el endpoint conserva sus demás tipos de ubicación autorizados.

- La solicitud debe persistir exactamente una `OperationalLocation` de tipo
  `BRANCH`.
- `parentId` debe identificar directamente un `DISTRIBUTION_CENTER` activo.
- El alta no requiere un renderer cartográfico, una búsqueda de geocodificación
  ni coordenadas; la captura manual puede continuar sin mapa. Si se envían
  coordenadas, latitud y longitud deben enviarse juntas y dentro de rango.
- El alta no crea ni modifica `InventoryBalance`, `InventoryMovement`,
  `InventoryTransfer`, `BranchSupplyCycle`, reservas ni saldos iniciales.
- El alta tampoco crea operaciones de suministro; esos comandos pertenecen a
  los contratos CEDIS posteriores y deben ejecutarse explícitamente.

#### Scenario: crear sucursal sin efectos de inventario

- GIVEN un CEDIS activo y una solicitud autorizada con `type=BRANCH`
- WHEN `POST /api/locations` responde `201 Created`
- THEN persiste una única `OperationalLocation` hija directa del CEDIS
- AND no persiste balances, movimientos, transferencias ni ciclos como efecto
  de la creación

## PATCH /api/locations/:id

Propósito: actualizar datos administrativos de una ubicación.

Permisos: `ADMIN`.

Validaciones:

- No cambiar estructura de forma que rompa referencias históricas.
- No convertir una ubicación inactiva en origen o destino de nuevas operaciones sin reactivación explícita.
- No permitir ciclos, cambios de tipo incompatibles ni coordenadas sin su par.

## DELETE /api/locations/:id

Propósito: desactivar ubicación operativa.

Permisos: `ADMIN`.

Respuesta `data`: ubicación con `isActive=false`.

Validaciones:

- No eliminar físicamente.
- No desactivar si existen operaciones abiertas que dependan de esa ubicación, como traspasos en tránsito o rutas activas.
- Una ubicación inactiva no debe usarse en nuevas ventas, compras, ajustes o traspasos.
- No desactivar una ubicación con `PointOfSaleDailyClose` en `DRAFT` o `REVIEWED`.
- No desactivar una ubicación `ROUTE_STOCK` si la ruta asociada sigue activa o tiene liquidación abierta.
- No desactivar un CEDIS o sucursal con `BranchSupplyCycle` que no esté `CLOSED` o `CANCELLED`. Al desactivar un CEDIS, la protección también cubre sus sucursales directas.
- No desactivar una ubicación que conserve hijos activos; tampoco cambiar un CEDIS a otro tipo mientras tenga hijos activos.

## Uso en cierres diarios

- `GET /api/locations` permite a `SELLER`, `WAREHOUSE` y `COLLECTIONS` consultar puntos externos dentro de su alcance operativo.
- En `GET /api/locations`, `SELLER` solo recibe su ubicación operativa asignada; si no tiene asignación, recibe una lista vacía. `ADMIN` conserva el catálogo activo para seleccionar una ubicación compatible.
- Crear un cierre diario requiere una ubicación activa de tipo `EXTERNAL_POINT_OF_SALE` o una ubicación equivalente autorizada por negocio.
- Cambiar el tipo de una ubicación no puede invalidar cierres, ventas, movimientos o pagos históricos.
- Los cierres diarios siguen limitados a los tipos autorizados para punto de venta; `DISTRIBUTION_CENTER` no es una ubicación de cierre de punto de venta.
