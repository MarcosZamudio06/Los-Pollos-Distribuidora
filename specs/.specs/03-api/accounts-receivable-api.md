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
- `payments[]`: `id`, `amount`, `paymentMethod`, `bankName`, `referenceNumber`, `appliedDocumentId`, `appliedDocumentType`, `routeId`, `routeSettlementId`, `operationalLocationId`, `pointOfSaleDailyCloseId`, `collectedByUserId`, `collectionPass`, `status`, `paidAt`.

## POST /api/accounts-receivable/:id/payments

Propósito: registrar pago parcial o total sobre una cuenta por cobrar.

Permisos: `ADMIN`, `COLLECTIONS`.

Body importante:

```json
{
  "accountReceivableId": "string",
  "amount": "1500.00",
  "paymentMethod": "TRANSFER",
  "cashShiftId": "string requerido para CASH recibido en punto fijo",
  "deviceId": "string requerido para CASH recibido en punto fijo",
  "bankName": "Santander",
  "referenceNumber": "REF-1234",
  "appliedDocumentId": "string opcional",
  "paidAt": "2026-06-19T10:00:00.000Z"
}
```

Headers requeridos:

- `Idempotency-Key`

Respuesta `data`:

- `payment`: `id`, `accountReceivableId`, `customerId`, `amount`, `paymentMethod`, `bankName`, `referenceNumber`, `appliedDocumentId`, `routeId`, `routeSettlementId`, `operationalLocationId`, `pointOfSaleDailyCloseId`, `status`, `paidAt`.
- `accountReceivable`: `id`, `outstandingAmount`, `daysOverdue`, `lastPaymentDate`, `status` actualizado.

La respuesta `payment.pointOfSaleDailyCloseId`, cuando exista, identifica el
cierre de la cobranza, no el cierre histórico de la venta. La cuenta por cobrar
y la venta conservan su fecha y su `pointOfSaleDailyCloseId` original sin
trasladar esa relación al pago.

Validaciones:

- `accountReceivableId` requerido y debe coincidir con `:id`.
- `amount > 0`.
- `amount` debe ser un string monetario canónico con dos decimales.
- `paymentMethod` requerido.
- No permitir pago mayor al saldo pendiente salvo regla futura explícita para anticipos o saldos a favor.
- No registrar pagos sobre cuentas canceladas o pagadas.
- Actualizar saldo y estado de forma transaccional.
- Permitir capturar `collectionPass` y `collectedByUserId` cuando la cobranza ocurra en segunda vuelta.
- Si aplica documento, debe conservar relación con la nota o relación administrativa interna.
- `Payment` es la única fuente monetaria del cobro recibido.
- Todos los importes monetarios de respuesta se serializan como strings canónicos con dos decimales.
- Un pago `CASH` de una ubicación fija requiere turno abierto del cajero y dispositivo registrados; conserva `cashShiftId` y deriva `pointOfSaleDailyCloseId`. Los cobros de ruta siguen `RouteSettlement`.
- Un pago `CASH` de una ubicación fija requiere además el permiso atómico `collections.receive_cash`. El actor `COLLECTIONS` solo puede usar su turno `OPEN`, en su ubicación operativa asignada y en su dispositivo registrado; no puede usar el turno de otro cajero ni una ubicación ajena.
- Los cobros `CASH` de ruta no requieren `collections.receive_cash` ni `CashShift`; permanecen sujetos al contexto y permisos de ruta.
- La fecha de la venta y la fecha de cobro son hechos distintos: un cierre `REVIEWED`, `CLOSED` o `CANCELLED` de la venta no bloquea una cobranza posterior ni exige reabrir ese cierre.
- Un pago `CASH` de una ubicación fija debe usar el `CashShift` abierto del momento de cobro. El cierre derivado del turno puede ser distinto al cierre de la venta y es el único cierre que se bloquea y recalcula para esta mutación.
- Las transferencias, depósitos, tarjetas y cheques no requieren turno ni dispositivo. Si no pertenecen a una ruta ni se les asigna un contexto POS de cobranza, se registran sin `pointOfSaleDailyCloseId` y no recalculan el cierre histórico de la venta.
- Los pagos de ruta no se asocian a `PointOfSaleDailyClose`; conservan `routeId` y `routeSettlementId` cuando exista una liquidación y se concilian mediante `RouteSettlement`.
- Si el cierre de cobranza derivado del turno deja de estar en `DRAFT` durante la operación, la transacción responde sin escritura parcial y exige la política de reapertura del cierre de cobranza, nunca la reapertura del cierre de la venta.

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
