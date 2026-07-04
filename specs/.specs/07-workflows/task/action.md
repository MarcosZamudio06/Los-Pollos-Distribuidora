### TASK-071 — Implementar UI administrador de rutas

Estado inicial: `PENDING`

Depende de:

- TASK-055
- TASK-070
- TASK-073

Specs requeridos:

```text
specs/.specs/04-ui/routes-delivery.md
specs/.specs/04-ui/ui-guidelines.md
specs/modules/routes-delivery/spec.md
specs/.specs/03-api/delivery-api.md
specs/.specs/03-api/route-settlements-api.md
```

Relación resultado esperado ↔ specs:

- `routes-delivery.md` define alcance administrador: crear ruta, asignar pedidos, revisar evidencia y ver liquidación.
- `ui-guidelines.md` define navegación, estados y acciones visibles por rol.
- `routes-delivery/spec.md` aporta reglas de rutas, permisos, `ROUTE_STOCK`, evidencia y liquidación.
- `delivery-api.md` y `route-settlements-api.md` son contratos para rutas, pedidos, evidencias, cobros y liquidación visible desde admin.

Entregables:

- DeliveryRoutesPage.
- CreateRouteModal.
- AssignOrdersModal.
- RouteDetailPage.
- RouteEvidenceReview.
- RouteSettlementView.

---
- Toda UI agregada debe de ser en correcto y perfecto en español. NO en Inglés
- Leer parcialmente estos specs, solo buscando entidades, relaciones, enums, constraints o reglas relacionadas con cuentas por cobrar y pagos:
- No leer roadmap, OpenSpec archive, UI completa, testing global, specs que no han sido especificados por la task, ni arquitectura completa salvo que una validación falle por información no visible en los specs requeridos.