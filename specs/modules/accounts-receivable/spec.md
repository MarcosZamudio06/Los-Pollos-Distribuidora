# Module Spec — Cuentas por Cobrar

## Objetivo

Gestionar saldos, vencimientos, crédito atrasado, saldo final por cliente y pagos parciales o totales sobre una sola cuenta por cobrar.

## Funcionalidades

- Consultar cartera.
- Registrar pagos.
- Consultar cartera vencida y por vencer.
- Identificar crédito atrasado.
- Consultar historial por cliente.
- Consultar saldo global y saldo final por cliente.

## Entidades

- AccountReceivable.
- Payment.
- Customer.
- Sale.
- BillingRequest.

## Reglas

- Cada pago del MVP aplica a una sola cuenta.
- No permitir abonos mayores al saldo.
- Crédito atrasado persiste hasta pagarse o cancelarse.
- El folio físico debe conservarse cuando exista.
- El saldo global del cliente debe sumar todas sus cuentas por cobrar vigentes, por vencer, vencidas y atrasadas.
- `status` representa cobranza y `agingStatus` representa envejecimiento; no deben mezclarse.
- `Payment` es la única fuente monetaria del cobro recibido.
- El saldo vigente de una venta a crédito es `Sale.total` menos la suma de sus
  pagos `Payment` con estado `APPLIED`; los reportes diarios deben mostrar ese
  saldo restante, no el total bruto de la venta.
- La antigüedad debe reconciliarse automáticamente al iniciar el backend y cada día, además de actualizarse transaccionalmente en pagos y cancelaciones.
- La mora inicia el día calendario posterior al vencimiento; `DUE_SOON` cubre los siete días anteriores y el día de vencimiento.
- Las nuevas ventas a crédito deben recalcular la mora en línea y aplicar `WARN_ONLY` o `BLOCK_NEW_CREDIT` de la política efectiva, sin modificar `Customer.creditStatus`.
- REP 2.0 no modifica `AccountReceivable`: solo `Payment(APPLIED)` reduce el
  saldo económico. `PaymentInvoiceApplication` refleja fiscalmente ese pago
  contra una o varias facturas PPD y nunca sustituye
  `AccountReceivable.outstandingAmount`.
- Cancelar o sustituir un REP no restaura ni vuelve a descontar cartera. Para
  cancelar económicamente un `Payment` primero deben quedar cancelados de forma
  confirmada sus REP vigentes.

## Permisos

- ADMIN, COLLECTIONS y SELLER con alcance limitado.

## API

Las rutas exactas deben definirse en `specs/.specs/03-api/accounts-receivable-api.md`.

## UI

- Lista de cartera.
- Detalle de cuenta.
- Registro de pago.
- Vencidas, por vencer y atrasadas.

## Pruebas mínimas

- Registrar pago parcial.
- Registrar pago total.
- Rechazar monto mayor al saldo.
- Consultar cartera vencida.
- Requerir idempotencia en registro y cancelación de pagos.
