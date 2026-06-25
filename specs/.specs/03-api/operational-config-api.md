# API — Configuración operativa

Define contratos para parámetros operativos auditables. La configuración no puede cambiar invariantes estructurales del MVP.

## GET /api/operational-config

Propósito: listar parámetros operativos.

Permisos: `ADMIN`; lectura limitada para módulos que requieran configuración vigente.

Query:

- `page`, `limit`.
- `key`.
- `scope`: `GLOBAL`, `LOCATION`, `ROLE` según se defina.
- `locationId`.
- `isActive`.

Respuesta `data.items[]`:

- `id`, `key`, `value`, `valueType`, `scope`, `locationId`.
- `description`, `effectiveFrom`, `effectiveTo`, `isActive`.
- `createdByUserId`, `updatedByUserId`, `createdAt`, `updatedAt`.

## POST /api/operational-config

Propósito: crear parámetro operativo auditable.

Permisos: `ADMIN`.

Body importante:

```json
{
  "key": "REPORT_REFRESH_INTERVAL_SECONDS",
  "value": "60",
  "valueType": "NUMBER",
  "scope": "GLOBAL",
  "locationId": null,
  "description": "Intervalo máximo de actualización de reportes",
  "effectiveFrom": "2026-06-19",
  "isActive": true
}
```

Validaciones:

- `key`, `value`, `valueType`, `scope` y `effectiveFrom` requeridos.
- `locationId` requerido cuando el alcance sea por ubicación.
- `REPORT_REFRESH_INTERVAL_SECONDS` no debe superar 60.
- `DEFAULT_SALE_STOCK_LOCATION_STRATEGY` no elimina la obligación de registrar `locationId` en cada venta.
- `DRIVER_OFFLINE_POLICY` permanece bloqueado hasta decisión de negocio sobre operación offline.
- No permitir configurar la desactivación de inventario por ubicación, cuentas por cobrar para crédito, traspasos como dominio propio ni ticket interno como comprobante MVP.

## PATCH /api/operational-config/:id

Propósito: actualizar parámetro operativo con auditoría.

Permisos: `ADMIN`.

Validaciones:

- Conservar historial suficiente de usuario responsable, fecha de vigencia y cambio.
- No modificar decisiones estructurales mediante configuración.

## DELETE /api/operational-config/:id

Propósito: desactivar parámetro operativo.

Permisos: `ADMIN`.

Validaciones:

- No eliminar físicamente.
- No dejar flujos críticos sin configuración requerida si ya dependen de ella.
