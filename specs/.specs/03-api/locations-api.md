# API — Ubicaciones operativas

Define contratos para administrar `OperationalLocation`, la abstracción usada por inventario, ventas, compras, traspasos, rutas y configuración operativa. No resuelve la decisión final de sucursal-almacén; solo conserva la estructura necesaria para operar por ubicación.

## GET /api/locations

Propósito: listar ubicaciones operativas activas o históricas.

Permisos: `ADMIN`, `WAREHOUSE`; `SELLER` y `DRIVER` solo lectura cuando el flujo lo requiera.

Query:

- `page`, `limit`, `search`.
- `type`: `BRANCH`, `WAREHOUSE`, `MIXED`, `EXTERNAL_POINT_OF_SALE`, `ROUTE_STOCK`.
- `parentId`.
- `isActive`.

Respuesta `data.items[]`:

- `id`, `name`, `code`, `type`, `parentId`, `address`, `isActive`.
- `createdAt`, `updatedAt`.

Validaciones:

- No asumir que toda sucursal tiene almacenes ni que todo almacén pertenece a una sucursal.
- `parentId` es opcional hasta cerrar la decisión de negocio.

## GET /api/locations/:id

Propósito: obtener una ubicación operativa.

Permisos: `ADMIN`, `WAREHOUSE`; lectura limitada para roles operativos.

Respuesta `data`: campos de la ubicación y, si aplica, resumen de uso operativo.

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
  "address": "Dirección operativa"
}
```

Respuesta `data`: ubicación creada.

Validaciones:

- `name` requerido.
- `type` requerido.
- `code` único si existe.
- `type` limitado a `BRANCH`, `WAREHOUSE`, `MIXED`, `EXTERNAL_POINT_OF_SALE`, `ROUTE_STOCK`.
- `EXTERNAL_POINT_OF_SALE` representa una pollería externa a matriz y debe operar como ubicación de inventario, venta y cierre diario.
- `ROUTE_STOCK` representa inventario cargado a una ruta y no debe reutilizarse entre rutas activas distintas.

## PATCH /api/locations/:id

Propósito: actualizar datos administrativos de una ubicación.

Permisos: `ADMIN`.

Validaciones:

- No cambiar estructura de forma que rompa referencias históricas.
- No convertir una ubicación inactiva en origen o destino de nuevas operaciones sin reactivación explícita.

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

## Uso en cierres diarios

- `GET /api/locations` permite a `SELLER`, `WAREHOUSE` y `COLLECTIONS` consultar puntos externos dentro de su alcance operativo.
- Crear un cierre diario requiere una ubicación activa de tipo `EXTERNAL_POINT_OF_SALE` o una ubicación equivalente autorizada por negocio.
- Cambiar el tipo de una ubicación no puede invalidar cierres, ventas, movimientos o pagos históricos.
- El modelo final de jerarquía matriz-sucursal-almacén permanece abierto; este tipo no obliga a usar `parentId`.
