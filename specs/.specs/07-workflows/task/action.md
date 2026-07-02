
### TASK-052 — Implementar cancelación de venta backend

Estado inicial: `PENDING`

• Specs relacionados para TASK-052:

  ## Principal

  - specs/.specs/03-api/sales-api.md
      - Contiene directamente POST /api/sales/:id/cancel.
      - Define permisos, body reason / expectedVersion, respuesta y validaciones.

  ## Soporte obligatorio

  - specs/modules/sales/spec.md
      - Regla de dominio: cancelar venta y revertir efectos.
      - Bloqueo si hay pagos aplicados, cierre POS cerrado o liquidación cerrada.
      - Idempotencia de cancelación.

  - specs/.specs/02-database/database.md
      - Lectura parcial:
          - Sale: estado CANCELLED, cancelledAt, cancelledByUserId, cancellationReason.
          - InventoryMovement: tipo CANCEL_SALE.
          - AccountReceivable: ajustar/cancelar cuenta relacionada.
          - Payment: fuente monetaria; pagos aplicados bloquean cancelación sin reversa/reembolso.
          - Relaciones Sale -> InventoryMovement, Sale -> AccountReceivable, Sale -> Payment.

  ## Soporte condicionado

  - specs/.specs/03-api/accounts-receivable-api.md
      - Solo para entender ajuste de cuenta por cobrar y bloqueo/reversa de pagos.

  - specs/modules/accounts-receivable/spec.md
      - Solo reglas de cobranza: estado, saldo, pagos, cuenta cancelada.

  ## No leer para implementar TASK-052 salvo bloqueo

  - testing-strategy.md
  - acceptance-criteria.md
  - UI specs
  - OpenSpec archive
  - arquitectura completa
  - docs auxiliares

Depende de:

- TASK-050

Endpoint:

- POST /api/sales/:id/cancel

Reglas:

- No cancelar venta ya cancelada.
- Restaurar inventario.
- Restaurar inventario en la ubicación operativa original.
- Si la venta fue a crédito, ajustar o cancelar cuenta por cobrar relacionada.
- Registrar movimientos.
- Ejecutar en transacción.
- Solo ADMIN o vendedor autorizado.

Pruebas obligatorias:

- Cancelar venta confirmada.
- Restaurar stock.
- Rechazar doble cancelación.

---
- Leer parcialmente estos specs, solo buscando entidades, relaciones, enums, constraints o reglas relacionadas con cuentas por cobrar y pagos:
- No leer roadmap, OpenSpec archive, UI completa, testing global, specs que no han sido especificados por la task, ni arquitectura completa salvo que una validación falle por información no visible en los specs requeridos.