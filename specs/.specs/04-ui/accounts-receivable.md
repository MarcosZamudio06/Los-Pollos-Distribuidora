# UI — Cuentas por Cobrar y Cobranza

## Objetivo

Crear la interfaz requerida para seguimiento de cartera, saldos vencidos, crédito atrasado, saldo final por cliente y registro de pagos parciales o totales sobre una sola cuenta por cobrar en el MVP.

## Alcance TASK-044

Pantallas y componentes requeridos:

- `AccountsReceivablePage`.
- `CustomerBalanceView`.
- `PaymentRegistrationDialog`.
- `OverdueAccountsView`.
- `CreditBlockedCustomerBadge`.
- `BillingRequestBadge`.

## Pantalla principal

Debe consumir `GET /api/accounts-receivable`.

Columnas:

- Cliente.
- Venta.
- Solicitud administrativa.
- Monto original.
- Saldo pendiente.
- Saldo final.
- Fecha de venta.
- Fecha de vencimiento.
- Días de crédito.
- Último pago.
- Folio físico.
- Política comercial aplicada.
- Estado de envejecimiento: vigente, por vencer o vencida.
- Estado de cobranza: no pagada, parcialmente pagada, pagada o cancelada.
- Acciones.

Filtros:

- Cliente.
- Venta.
- Solicitud administrativa.
- Estado.
- Rango de vencimiento.
- Solo vencidas.
- Solo por vencer.

## Detalle de cuenta

Debe consumir `GET /api/accounts-receivable/:id`.

Debe mostrar:

- Datos de la cuenta por cobrar.
- Cliente y estado de crédito.
- Venta origen, tipo documental y ubicación operativa.
- Solicitud administrativa si existe.
- Pagos registrados.
- Saldo pendiente.
- Días de atraso.
- Último pago.

Cada pago debe mostrar:

- `accountReceivableId`.
- Monto.
- Método de pago.
- Banco.
- Referencia.
- Documento aplicado.
- Ruta y liquidación cuando aplique.
- Vuelta de cobranza.
- Estado.
- Fecha de pago.

## Registro de pago

Debe consumir `POST /api/accounts-receivable/:id/payments`.

Campos:

- Cuenta por cobrar (`accountReceivableId`).
- Monto.
- Método de pago.
- Banco opcional.
- Referencia opcional.
- Documento aplicado opcional.
- Fecha de pago.

Reglas UI:

- Permitir pagos parciales y totales.
- Cada pago del MVP se aplica exactamente a una cuenta por cobrar.
- No permitir monto mayor al saldo pendiente mostrado.
- No registrar pagos sobre cuentas canceladas o pagadas.
- Permitir registrar abonos, transferencias/depositos confirmados y segunda vuelta de cobranza.
- Mostrar saldo actualizado al concluir.

## Cuentas vencidas

`OverdueAccountsView` debe mostrar:

- Cliente.
- Saldo vencido.
- Días o fecha de vencimiento.
- Folio físico.
- Estado de bloqueo.
- Acción para ver detalle o registrar pago.

## Cliente bloqueado

`CreditBlockedCustomerBadge` debe distinguir:

- Bloqueo por mora.
- Bloqueo por límite excedido.
- Crédito suspendido.

## Permisos

- `ADMIN`: consulta global y cancelación de pagos conforme a política.
- `COLLECTIONS`: consulta de saldos y registro de pagos.
- `SELLER`: consulta limitada conforme a política.
- `WAREHOUSE` y `DRIVER`: sin acceso directo, salvo cobros de ruta desde flujo de reparto para `DRIVER`.

## Estados de pantalla

Toda vista debe contemplar:

- Loading.
- Error.
- Empty.
- Success.
- Unauthorized.

## Restricciones

- No implementar pagos distribuidos entre varias cuentas en MVP.
- No usar `PaymentAllocation` como flujo oficial.
- No tratar cobros en ruta como ventas de contado.
- No ocultar historial de pagos cancelados.
