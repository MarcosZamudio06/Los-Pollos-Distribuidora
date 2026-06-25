# API — Equivalencias kilo-pieza

Define contratos para equivalencias oficiales entre kilo y pieza por producto. La semántica del producto (`KG`, `WHOLE`, `CUT`) es independiente del contrato de equivalencias. Las equivalencias preservan trazabilidad para ventas, compras, inventario y reportes; no deben calcularse solo en frontend.

## GET /api/products/:productId/equivalences

Propósito: listar equivalencias de un producto.

Permisos: `ADMIN`, `WAREHOUSE`; `SELLER` solo lectura para POS.

Query:

- `status`: `DRAFT`, `ACTIVE`, `INACTIVE`.
- `unitFrom`, `unitTo`.
- `date` para consultar equivalencia aplicable en una fecha.

Respuesta `data.items[]`:

- `id`, `productId`, `unitFrom`, `unitTo`, `factor`, `roundingMode`.
- `effectiveFrom`, `effectiveTo`, `status`.
- `approvedByUserId`, `createdByUserId`, `createdAt`, `updatedAt`.

Validaciones:

- Solo una equivalencia activa debe aplicar por producto, par de unidades y periodo.

## POST /api/products/:productId/equivalences

Propósito: crear equivalencia kilo-pieza.

Permisos: `ADMIN`; `WAREHOUSE` solo si la política del negocio lo autoriza.

Body importante:

```json
{
  "unitFrom": "PIECE",
  "unitTo": "KG",
  "factor": 1.8,
  "roundingMode": "PENDING_BUSINESS_RULE",
  "effectiveFrom": "2026-06-19",
  "effectiveTo": null,
  "status": "DRAFT"
}
```

Respuesta `data`: equivalencia creada.

Validaciones:

- `productId`, `unitFrom`, `unitTo`, `factor` y `status` requeridos.
- `factor > 0`.
- `unitFrom` y `unitTo` no deben ser iguales.
- No activar si se superpone con otra equivalencia activa para el mismo producto y par de unidades.
- La política exacta de redondeo sigue pendiente; el contrato debe conservar el valor aplicado sin inventar la regla final.

## PATCH /api/product-equivalences/:id

Propósito: actualizar metadatos o estado de una equivalencia.

Permisos: `ADMIN`; `WAREHOUSE` solo si la política del negocio lo autoriza.

Validaciones:

- No modificar una equivalencia ya aplicada históricamente sin preservar trazabilidad.
- Para cambios de factor en operación, crear una nueva vigencia en lugar de sobrescribir historial.

## POST /api/product-equivalences/:id/activate

Propósito: activar una equivalencia aprobada.

Permisos: `ADMIN`.

Respuesta `data`: equivalencia activa.

Validaciones:

- `effectiveFrom` requerido.
- No debe existir otra equivalencia activa superpuesta para el mismo producto, par de unidades y vigencia.

## POST /api/product-equivalences/:id/deactivate

Propósito: desactivar equivalencia sin eliminar historial.

Permisos: `ADMIN`.

Validaciones:

- No eliminar físicamente.
- Las ventas y compras históricas deben conservar `unitEquivalentId` o `appliedEquivalentFactor` usado al momento de la operación.
