## Gobierno documental de módulos

Este documento es auxiliar.

No reemplaza los specs canónicos ubicados en:

```text
specs/.specs/
specs/modules/
```

---

## Nombres canónicos de specs de módulo

```text
specs/modules/accounts-receivable/spec.md
specs/modules/auth/spec.md
specs/modules/billing-requests/spec.md
specs/modules/clientes/spec.md
specs/modules/compras/spec.md
specs/modules/inventory/spec.md
specs/modules/point-of-sale-closing/spec.md
specs/modules/reports/spec.md
specs/modules/route-settlements/spec.md
specs/modules/routes-delivery/spec.md
specs/modules/sales/spec.md
specs/modules/sales-documents/spec.md
specs/modules/usuarios/spec.md
```

---

## Aliases deprecated

Estos archivos existen únicamente por compatibilidad documental.

No deben usarse como specs de implementación.

```text
specs/modules/facturacion/spec.md
specs/modules/inventario/spec.md
specs/modules/ventas/spec.md
specs/modules/reportes/spec.md
specs/modules/routes/spec.md
specs/modules/rutas-reparto/spec.md
```

---

## Mapeo de aliases a specs canónicos

```text
specs/modules/facturacion/spec.md
  -> specs/modules/sales-documents/spec.md
  -> specs/modules/billing-requests/spec.md

specs/modules/inventario/spec.md
  -> specs/modules/inventory/spec.md

specs/modules/ventas/spec.md
  -> specs/modules/sales/spec.md

specs/modules/reportes/spec.md
  -> specs/modules/reports/spec.md

specs/modules/routes/spec.md
  -> specs/modules/routes-delivery/spec.md

specs/modules/rutas-reparto/spec.md
  -> specs/modules/routes-delivery/spec.md
```

---

## Regla de uso para agentes

Si una TASK apunta a un alias deprecated, no implementar directamente desde ese alias.

Primero resolver el spec canónico correspondiente y reportar la referencia deprecated en el resumen final.

No abrir aliases deprecated si la TASK ya apunta al spec canónico.
