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
