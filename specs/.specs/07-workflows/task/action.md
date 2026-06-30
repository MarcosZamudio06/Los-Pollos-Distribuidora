### TASK-036 — Implementar equivalencias kilo-pieza backend
Estado inicial: `COMPLETED`
Depende de:
- TASK-030
Specs requeridos:
```text
specs/modules/inventory/spec.md
specs/.specs/02-database/database.md
specs/.specs/02-database/entities.md
specs/.specs/03-api/product-equivalences-api.md
```
Objetivo:
Implementar equivalencias kilo-pieza oficiales por producto.
Restricción:
No crear endpoints hasta que `specs/.specs/03-api/product-equivalences-api.md` exista y defina rutas exactas.
Reglas:

- Solo una equivalencia activa por producto y par de unidades debe aplicar por periodo.
- No convertir kilo/pieza sin equivalencia aprobada cuando el producto lo requiera.
- Las ventas y compras deben conservar el factor aplicado al momento de la operación.

---