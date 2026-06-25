# API — Cuentas por cobrar y pagos

Define contratos para consultar cartera, saldos vencidos y registrar pagos parciales o totales. En el MVP cada pago de cobranza se aplica exactamente a una cuenta por cobrar mediante `accountReceivableId` requerido.

## GET /api/accounts-receivable

Propósito: listar cuentas por cobrar para cobranza, ventas a crédito y reportes.

Permisos: `ADMIN`, `COLLECTIONS`; `SELLER` solo consulta limitada conforme a política.

Query:

- `page`, `limit`.
- `customerId`, `saleId`, `billingRequestId`.
- `status`: `UNPAID`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`.
- `agingStatus`: `CURRENT`, `DUE_SOON`, `OVERDUE`.
- `dueDateFrom`, `dueDateTo`.
- `onlyOverdue`.
- `onlyActiveBillingRequest`.

Respuesta `data.items[]`:

- `id`, `customerId`, `customerName`, `saleId`, `saleNumber`, `billingRequestId`.
- `originalAmount`, `outstandingAmount`, `saleDate`, `dueDate`, `paymentTermsDays`, `lastPaymentDate`, `daysOverdue`.
- `paidAt`, `cancelledAt`, `commercialPolicyId`, `physicalDocumentFolio`, `collectorUserId`.
- `status`, `agingStatus`, `createdAt`, `updatedAt`.

Validaciones:

- Debe distinguir estado de cobranza (`status`) y envejecimiento (`agingStatus`) como conceptos separados.
- Debe basarse en ventas a crédito confirmadas o saldos administrativos relacionados.

## GET /api/accounts-receivable/:id

Propósito: obtener detalle de una cuenta por cobrar y sus pagos.

Permisos: `ADMIN`, `COLLECTIONS`; `SELLER` limitado.

Respuesta `data`:

- Campos de la cuenta por cobrar.
- `customer`: `id`, `name`, `customerType`, `creditStatus`, `customerNumber`, `commercialName`.
- `sale`: `id`, `saleNumber`, `total`, `locationId`, `documentType`, `physicalFolio`.
- `billingRequest` cuando exista.
- `payments[]`: `id`, `amount`, `paymentMethod`, `bankName`, `referenceNumber`, `appliedDocumentId`, `appliedDocumentType`, `routeId`, `routeSettlementId`, `collectedByUserId`, `collectionPass`, `status`, `paidAt`.

## POST /api/accounts-receivable/:id/payments

Propósito: registrar pago parcial o total sobre una cuenta por cobrar.

Permisos: `ADMIN`, `COLLECTIONS`.

Body importante:

```json
{
  "accountReceivableId": "string",
  "amount": 1500,
  "paymentMethod": "TRANSFER",
  "bankName": "Santander",
  "referenceNumber": "REF-1234",
  "appliedDocumentId": "string opcional",
  "paidAt": "2026-06-19T10:00:00.000Z"
}
```

Headers requeridos:

- `Idempotency-Key`

Respuesta `data`:

- `payment`: `id`, `accountReceivableId`, `customerId`, `amount`, `paymentMethod`, `bankName`, `referenceNumber`, `appliedDocumentId`, `status`, `paidAt`.
- `accountReceivable`: `id`, `outstandingAmount`, `daysOverdue`, `lastPaymentDate`, `status` actualizado.

Validaciones:

- `accountReceivableId` requerido y debe coincidir con `:id`.
- `amount > 0`.
- `paymentMethod` requerido.
- No permitir pago mayor al saldo pendiente salvo regla futura explícita para anticipos o saldos a favor.
- No registrar pagos sobre cuentas canceladas o pagadas.
- Actualizar saldo y estado de forma transaccional.
- Permitir capturar `collectionPass` y `collectedByUserId` cuando la cobranza ocurra en segunda vuelta.
- Si aplica documento, debe conservar relación con la nota o relación administrativa interna.
- `Payment` es la única fuente monetaria del cobro recibido.

## POST /api/payments/:id/cancel

Propósito: cancelar un pago conservando historial.

Permisos: `ADMIN`; `COLLECTIONS` solo si la política lo permite.

Body importante:

```json
{
  "reason": "Pago registrado por error",
  "expectedVersion": 2
}
```

Validaciones:

- No eliminar físicamente el pago.
- Recalcular saldo, días de atraso y estado de la cuenta por cobrar de forma transaccional.
- Requerir motivo de cancelación.
- Persistir actor, fecha, motivo e idempotencia de cancelación.

## GET /api/customers/:id/payments

Propósito: consultar historial de pagos de un cliente.

Permisos: `ADMIN`, `COLLECTIONS`; `SELLER` limitado conforme a política.

Query: `page`, `limit`, `dateFrom`, `dateTo`, `paymentMethod`, `bankName`, `status`.

Respuesta `data.items[]`:

- `id`, `accountReceivableId`, `saleId`, `amount`, `paymentMethod`, `bankName`, `referenceNumber`, `appliedDocumentId`, `routeId`, `routeSettlementId`, `status`, `paidAt`.

Validaciones:

- Todo pago de cobranza debe incluir `accountReceivableId`.
- Si el historial incluye un pago inmediato de contado, debe conservar `saleId` y puede omitir `accountReceivableId`.
- Los cobros en ruta deben aparecer con `routeId` y, cuando aplique, `routeSettlementId`.
