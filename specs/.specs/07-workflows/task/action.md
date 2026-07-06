
### TASK-090 — Implementar reportes backend

Estado inicial: `PENDING`

Depende de:

- TASK-050
- TASK-061
- TASK-034
- TASK-043
- TASK-070
- TASK-073

Endpoints:

- GET /api/reports/dashboard
- GET /api/reports/sales-daily
- GET /api/reports/inventory-low-stock
- GET /api/reports/cash-closing

Pendiente de especificación API antes de implementar:

- Reportes de inventario por ubicación.
- Reportes de cuentas por cobrar y pagos.
- Reportes de reparto, entregas y liquidaciones.

Reglas:

- ADMIN ve información global.
- SELLER ve ventas propias.
- WAREHOUSE ve inventario.
- COLLECTIONS ve cobranza, saldos, pagos y cobros en ruta conforme a permisos.
- DRIVER no ve reportes financieros.
- Reportes operativos deben reflejar operaciones confirmadas con latencia máxima de 60 segundos en condiciones normales.
- Inventario se reporta por ubicación operativa.
- Distinguir ventas de contado, ventas a crédito, pagos de cuentas por cobrar y cobros en ruta.


---
- Toda UI agregada debe de ser en correcto y perfecto en español. NO en Inglés
- Leer parcialmente estos specs, solo buscando entidades, relaciones, enums, constraints o reglas relacionadas con cuentas por cobrar y pagos:
- No leer roadmap, OpenSpec archive, UI completa, testing global, specs que no han sido especificados por la task, ni arquitectura completa salvo que una validación falle por información no visible en los specs requeridos.