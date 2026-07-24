### TASK-092 — Implementar UI de reportes

Estado inicial: `PENDING`

Depende de:

- TASK-090

Entregables:

- ReportsPage.
- SalesDailyReport.
- CashClosingReport.
- LowStockReport.
- InventoryByLocationReport.
- AccountsReceivableReport.
- DeliveryOperationsReport.
- Filtros por fecha.
- Filtros por usuario para ADMIN.
- Filtros por ubicación, tipo de venta, estado de cobranza y ruta cuando aplique.


---
- Toda UI agregada debe de ser en correcto y perfecto en español. NO en Inglés
- Leer parcialmente estos specs, solo buscando entidades, relaciones, enums, constraints o reglas relacionadas con cuentas por cobrar y pagos:
- No leer roadmap, OpenSpec archive, UI completa, testing global, specs que no han sido especificados por la task, ni arquitectura completa salvo que una validación falle por información no visible en los specs requeridos.


---
### P1-3 — Derivar ubicación y canal del usuario en POS

Estado: COMPLETED

Entregables:

- Incluir `operationalLocationId` en el contexto autenticado cuando exista.
- Limitar el catálogo de ubicaciones de `SELLER` a su ubicación asignada.
- Preseleccionar y bloquear la ubicación de `SELLER` en `SalesPosPage`.
- Derivar canales válidos por tipo de ubicación y excluir `ROUTE` del POS fijo.
- Permitir cambios de ubicación para `ADMIN` con advertencia visible y limpieza del carrito.
- Cubrir contrato backend, matriz de canales y comportamiento UI con pruebas.
