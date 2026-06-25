# API — Políticas comerciales

Define contratos para condiciones comerciales administrables. Las políticas pueden configurar crédito, bloqueo, términos de pago y condiciones por tipo de cliente, pero no pueden desactivar reglas estructurales como cuentas por cobrar para ventas a crédito.

## GET /api/commercial-policies

Propósito: listar políticas comerciales.

Permisos: `ADMIN`; lectura limitada para `SELLER` y `COLLECTIONS` cuando el flujo lo requiera.

Query:

- `page`, `limit`, `search`.
- `customerType`: `RETAIL`, `WHOLESALE`, `INSTITUTIONAL`.
- `isActive`.

Respuesta `data.items[]`:

- `id`, `name`, `description`, `customerType`, `priceListId`.
- `defaultCreditLimit`, `defaultCreditDays`.
- `overdueBlockingMode`, `creditLimitBlockingMode`, `allowAdministrativeOverride`.
- `isActive`, `effectiveFrom`, `effectiveTo`.

## POST /api/commercial-policies

Propósito: crear política comercial auditable.

Permisos: `ADMIN`.

Body importante:

```json
{
  "name": "Mayoristas estándar",
  "description": "Condiciones base para clientes mayoristas",
  "customerType": "WHOLESALE",
  "priceListId": "string opcional",
  "defaultCreditLimit": 50000,
  "defaultCreditDays": 15,
  "overdueBlockingMode": "BLOCK",
  "creditLimitBlockingMode": "BLOCK",
  "allowAdministrativeOverride": true,
  "effectiveFrom": "2026-06-19",
  "effectiveTo": null,
  "isActive": true
}
```

Validaciones:

- `name` requerido.
- Límites y días de crédito deben ser mayores o iguales a cero cuando apliquen.
- `effectiveFrom` requerido para políticas activas.
- No permitir una política que desactive cuentas por cobrar en ventas a crédito.
- `customerType` debe ser compatible con clientes minoristas, mayoristas o institucionales.

## PATCH /api/commercial-policies/:id

Propósito: actualizar política comercial conservando auditoría.

Permisos: `ADMIN`.

Validaciones:

- No sobrescribir condiciones históricas aplicadas en ventas o cuentas por cobrar ya creadas.
- No eliminar invariantes estructurales del dominio.

## DELETE /api/commercial-policies/:id

Propósito: desactivar política comercial.

Permisos: `ADMIN`.

Validaciones:

- No eliminar físicamente.
- No desactivar si se requiere para operaciones abiertas sin política sustituta definida.
