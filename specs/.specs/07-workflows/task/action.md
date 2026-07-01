### TASK-043 — Implementar cuentas por cobrar y pagos backend

Estado inicial: `PENDING`

Depende de:

- TASK-021
- TASK-040
- TASK-042

Specs requeridos:

```text
specs/modules/clientes/spec.md
specs/modules/sales/spec.md
specs/.specs/02-database/database.md
specs/.specs/02-database/entities.md
specs/.specs/03-api/accounts-receivable-api.md
```

Objetivo:

Implementar cuentas por cobrar, pagos parciales o totales y bloqueo de crédito.

Restricción:

No crear endpoints hasta que `specs/.specs/03-api/accounts-receivable-api.md` exista y defina rutas exactas.

Reglas:

- Toda venta a crédito genera una cuenta por cobrar.
- Para el MVP, cada pago de cobranza aplica a una sola cuenta por cobrar y `Payment.accountReceivableId` es requerido.
- Un pago inmediato de contado puede asociarse a la venta sin `AccountReceivable`.
- `PaymentAllocation` no es mecanismo oficial del MVP; queda para fase posterior de pagos distribuidos.
- Un pago no puede exceder saldo pendiente salvo regla futura de anticipos o saldos a favor.
- COLLECTIONS puede consultar saldos y registrar pagos conforme a permisos.
- Debe identificar cuentas vigentes, parcialmente pagadas, pagadas, vencidas y canceladas.

---