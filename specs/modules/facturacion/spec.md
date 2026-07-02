# Deprecated Module Alias — Facturación

Este archivo existe únicamente por compatibilidad documental.

No usar como spec de implementación.

---

## Specs canónicos

```text
specs/modules/sales-documents/spec.md
specs/modules/billing-requests/spec.md
```

---

## Uso correcto

- Para tickets, notas, recibos internos o documentos operativos de venta, usar `specs/modules/sales-documents/spec.md`.
- Para solicitudes administrativas de factura, usar `specs/modules/billing-requests/spec.md`.

---

## Regla para agentes

Si una TASK apunta a este alias, resolver el spec canónico correspondiente antes de implementar.

No cargar este archivo cuando la TASK ya apunta a `sales-documents` o `billing-requests`.
