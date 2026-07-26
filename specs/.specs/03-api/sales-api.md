# API — Ventas

Define contratos para ventas de contado y crédito, descuento de inventario por ubicación y documentos de venta internos del MVP. Los precios, descuentos, subtotales, saldos e inventario se validan en backend.

## GET /api/sales

Propósito: listar ventas con filtros operativos.

Permisos: `ADMIN` ve todas; `SELLER` ve propias salvo autorización; `COLLECTIONS` consulta ventas a crédito relacionadas.

Query:

- `page`, `limit`.
- `dateFrom`, `dateTo`.
- `userId`, `customerId`, `locationId`.
- `status`: `DRAFT`, `CONFIRMED`, `CANCELLED`.
- `paymentType`: `CASH_SALE`, `CREDIT_SALE`.
- `collectionStatus`: `UNPAID`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`.
- `saleChannel`: `COUNTER`, `EXTERNAL_POINT_OF_SALE`, `ROUTE`, `INSTITUTIONAL`, `WHOLESALE`.
- `documentType`: `SCALE_TICKET`, `SIMPLE_NOTE`, `LARGE_NOTE`, `INTERNAL_RECEIPT`.
- `physicalFolio`.

Respuesta `data.items[]`:

- `id`, `saleNumber`, `customerId`, `customerName`, `userId`, `locationId`.
- `saleChannel`, `documentType`, `physicalFolio`, `requiresAdministrativeInvoice`.
- `subtotal`, `discount`, `tax`, `total`.
- `paymentType`, `collectionStatus`, `status`, `createdAt`.
- `accountReceivableId` cuando aplique.
- `billingRequestId` cuando aplique.
- `paymentsSummary` opcional: `totalPaid`, `lastPaidAt`, `methods[]`.
- `deliveredByUserId`, `collectedByUserId`, `routeId`.

## GET /api/sales/:id

Propósito: obtener detalle de venta.

Permisos: mismos de listado, según alcance.

Respuesta `data`:

- Encabezado de venta.
- `items[]`: `productId`, `productName`, `unit`, `quantityKg`, `quantityPieces`, `unitPrice`, `unitEquivalentId`, `appliedEquivalentFactor`, `roundingMode`, `subtotal`.
- `customer`, `commercialPolicy`, `accountReceivable`, `billingRequest`, `ticket` y `documents[]` cuando existan.
- `inventoryMovements[]` relacionados.

La respuesta de `SELLER` no incluye `unitCostSnapshot`, `costSubtotalSnapshot` ni `costSnapshotSource`. El backend debe aplicar esta proyección también a la respuesta de creación, reintento idempotente y cancelación; `ADMIN` conserva los campos administrativos completos.

## POST /api/sales

Propósito: crear y confirmar venta de contado o crédito.

Permisos: `ADMIN`, `SELLER`.

Body importante:

`payments` es opcional cuando una venta a crédito no recibe abono inicial. Cada elemento requiere `amount` positivo y `paymentMethod`; el backend asigna `paidAt` a cada `Payment`. Para `CASH`, `cashTendered` es opcional y representa efectivo físico recibido: debe ser positivo y no menor que `amount`; el backend calcula y persiste `changeGiven`. El cliente no envía `changeGiven`. Transferencia, depósito y cheque requieren `bankName` y `referenceNumber`; tarjeta o voucher requieren `referenceNumber` como autorización y `cardLastFour`. La suma de `payments[].amount` no puede superar el total de la venta y, para `CASH_SALE`, debe ser exactamente igual.

```json
{
  "customerId": "string opcional para contado pagado al momento; requerido para crédito",
  "locationId": "string",
  "pointOfSaleDailyCloseId": "string opcional; requerido o resuelto a una sesión abierta para contado/efectivo",
  "saleChannel": "COUNTER",
  "documentType": "SIMPLE_NOTE",
  "physicalFolio": "string opcional",
  "requiresAdministrativeInvoice": true,
  "billingRequest": {
    "reason": "Motivo obligatorio",
    "notes": "Notas opcionales"
  },
  "paymentType": "CASH_SALE",
  "payments": [
    { "amount": 500, "paymentMethod": "CASH", "cashTendered": 600 },
    { "amount": 700, "paymentMethod": "TRANSFER", "bankName": "Banco Norte", "referenceNumber": "TRANSFER-001" },
    { "amount": 300, "paymentMethod": "CARD", "referenceNumber": "AUTH-123", "cardLastFour": "4242" }
  ],
  "discountAuthorizationId": "string opcional; autorización creada por ADMIN",
  "commercialPolicyId": "string opcional",
  "administrativeOverrideReason": "string opcional",
  "items": [
    {
      "productId": "string",
      "unit": "KG",
      "quantityKg": 2.5,
      "quantityPieces": 0,
      "unitEquivalentId": "string opcional"
    }
  ]
}
```

Respuesta `data`:

- `sale`: encabezado, items, totales calculados en backend y `locationId`.
- `payments[]` cuando exista abono inicial o pago total.
- `accountReceivable` cuando exista saldo pendiente.
- `billingRequest` cuando se genere o relacione solicitud administrativa.
- `inventoryMovements[]` generados.
- `ticketId` o referencia de ticket interno si se genera en la confirmación.
- `documents[]` cuando el flujo genere nota o documento operativo.

Cuando el actor sea `SELLER`, los snapshots de costo no se devuelven dentro de `sale.items[]`, aunque se persistan internamente para cálculos, auditoría y cierres administrativos.

Validaciones:

- Debe contener al menos un item.
- `paymentType` clasifica solo el tipo de venta (`CASH_SALE` o `CREDIT_SALE`); no representa mora, abonos ni envejecimiento.
- `locationId` requerido como ubicación operativa de descuento.
- `pointOfSaleDailyCloseId` puede enviarse para seleccionar la sesión; si no se envía en una operación de contado o con efectivo, el backend debe resolver una sesión abierta de la misma ubicación. Si no existe, rechaza con `CASH_SESSION_REQUIRED`.
- `saleChannel` y `documentType` requeridos para distinguir el flujo documental.
- `SELLER` solo puede usar su ubicación operativa asignada; `ADMIN` puede usar cualquier ubicación activa compatible.
- La compatibilidad canal-ubicación es: `COUNTER` con `BRANCH`, `MIXED` o `EXTERNAL_POINT_OF_SALE`; `EXTERNAL_POINT_OF_SALE` con `EXTERNAL_POINT_OF_SALE`; `ROUTE` con `ROUTE_STOCK`; `INSTITUTIONAL` y `WHOLESALE` con `BRANCH` o `MIXED`.
- No vender sin stock suficiente en la ubicación indicada.
- No aceptar precios enviados por frontend como fuente de verdad.
- Calcular precios, descuentos, subtotales y totales en backend.
- No aceptar `discount` como importe enviado por cliente. Un descuento requiere `discountAuthorizationId`; el backend obtiene el porcentaje y la evidencia desde una autorización vigente, de un solo uso, ligada a la política comercial aplicable.
- Solo `ADMIN` puede crear autorizaciones extraordinarias de descuento. La autorización requiere motivo, evidencia, usuario autorizador y un porcentaje que no exceda el máximo de la política comercial.
- La venta persiste `discountAuthorizationId`, porcentaje, importe calculado y evidencia para auditoría.
- Generar `saleNumber` en backend desde una secuencia atómica; no depende del conteo de ventas.
- Registrar unidad capturada, kilos, piezas y equivalencia aplicada cuando corresponda.
- `quantityPieces` debe ser entero cuando aplique.
- Venta de contado requiere que exista al menos un pago y que la suma de `payments[]` sea exactamente igual al total calculado por backend.
- La venta de contado requiere una sesión con `cashSessionStatus=OPEN` y `status=DRAFT`; la venta y cada pago inmediato conservan directamente `pointOfSaleDailyCloseId`.
- Un abono inicial en efectivo de una venta a crédito usa la misma regla de sesión y asociación directa. Los cobros en ruta se mantienen en `RouteSettlement`.
- Cada pago inmediato de contado se registra como un `Payment` asociado a `saleId`; no crea `AccountReceivable` artificial.
- Una venta de contado sin pagos o con pagos parciales se rechaza, aunque tenga cliente registrado; para conservar un saldo pendiente el operador debe cambiar explícitamente `paymentType` a `CREDIT_SALE`.
- `payments[].amount` permanece como monto aplicado contable. `cashTendered` y `changeGiven` son evidencia individual del `Payment` en efectivo, no modifican el total aplicado ni generan pago, reembolso o movimiento de caja adicional.
- Los pagos inmediatos del POS siempre asignan `paidAt` en el servidor; no aceptan una fecha del cliente.
- Venta a crédito requiere cliente registrado con crédito autorizado.
- Venta a crédito sin pagos genera `AccountReceivable` por el total.
- Venta a crédito con uno o más abonos inmediatos genera un `Payment` por cada elemento y `AccountReceivable` por el saldo.
- Rechazar venta a crédito si cliente está bloqueado por mora o excede límite sin autorización administrativa explícita.
- La política enviada debe coincidir con la asignada al cliente y estar activa dentro de su vigencia.
- `WARN_ONLY` permite confirmar y devuelve `creditWarnings[]`; `BLOCK_NEW_CREDIT` rechaza salvo override permitido.
- El override requiere `ADMIN`, motivo no vacío y `allowAdministrativeOverride=true`; no puede omitir `BLOCKED` o `SUSPENDED` administrativo.
- La venta conserva `creditDecisionSnapshot` y `creditDecisionEvaluatedAt` para auditoría.
- Los rechazos exponen códigos estables: `CASH_SALE_REQUIRES_FULL_PAYMENT`, `CASH_SESSION_REQUIRED`, `CASH_SESSION_NOT_OPEN`, `CASH_SESSION_LOCATION_MISMATCH`, `CREDIT_ADMINISTRATIVELY_BLOCKED`, `CREDIT_OVERDUE_BLOCKED`, `CREDIT_LIMIT_EXCEEDED`, `CREDIT_POLICY_MISMATCH` y códigos `CREDIT_OVERRIDE_*`.
- `Payment` es la única fuente monetaria del flujo; `Sale` no persiste `paymentMethod`.
- Si `requiresAdministrativeInvoice=true`, la venta solo genera relación administrativa; no emite CFDI.
- Si `requiresAdministrativeInvoice=true`, `customerId` y `billingRequest.reason` son obligatorios; `billingRequest.notes` es opcional.
- No se aceptan identificadores internos de solicitud escritos manualmente.
- Descontar inventario, crear venta, items, pagos y cuenta por cobrar cuando aplique en una transacción.
- Requerir idempotencia para creación de venta y sus pagos inmediatos.
- Una repetición idempotente debe comprobar el permiso de lectura sobre la venta existente antes de responder. La clave queda ligada al usuario y ubicación persistidos por la venta.
- Para `KG_AND_PIECE` se acepta kilo, pieza o ambos; la equivalencia activa solo es obligatoria cuando se capturan piezas para conversión.
- Reintentar conflictos únicos transitorios relacionados con `saleNumber`.

## POST /api/sales/:id/cancel

Propósito: cancelar venta y revertir efectos operativos cuando aplique.

Permisos: `ADMIN`; `SELLER` limitado a ventas propias si la política lo permite.

Body importante:

```json
{
  "reason": "Cliente canceló pedido",
  "expectedVersion": 4
}
```

Respuesta `data`:

- Venta cancelada o bloqueo por cancelación financiera.
- Movimientos de inventario de reversa.
- Cuenta por cobrar ajustada o cancelada si era venta a crédito.

Validaciones:

- No cancelar venta ya cancelada.
- Restaurar inventario en la ubicación operativa original.
- Si la venta tiene pagos aplicados, requerir reversa o reembolso auditable antes de cancelar.
- Si la venta está asociada a un cierre POS cerrado, requerir reapertura versionada antes de cancelar.
- Si la venta está asociada a una liquidación cerrada, requerir reapertura versionada antes de cancelar.
- Si la venta fue a crédito, ajustar o cancelar la cuenta por cobrar relacionada.
- Registrar movimientos de inventario.
- Ejecutar en transacción.
- Requerir motivo.
- Persistir actor, fecha, motivo e idempotencia de cancelación.

## GET /api/sales/:id/void-preview

Propósito: preparar la operación administrativa “Anular venta” sin modificar datos.

Permisos: `ADMIN`.

La respuesta debe incluir, con datos vigentes y la versión de la venta:

- Pagos no cancelados que serán revertidos, incluyendo monto, método y versión.
- Partidas e inventario que será restaurado en la ubicación original.
- Cuenta por cobrar afectada y saldo actual.
- `SaleDocument` relacionados y cuáles quedarán cancelados.
- Solicitud administrativa relacionada cuando exista.
- `blockers[]` con códigos estables para venta no confirmada, cierre POS cerrado, liquidación de ruta cerrada o factura externa activa.
- Usuario ADMIN que autorizará la operación.

La vista previa no cancela pagos, no modifica inventario y no cambia estados.

## POST /api/sales/:id/void

Propósito: anular administrativamente una venta cobrada o abonada y coordinar sus efectos operativos en una sola transacción serializable.

Permisos: `ADMIN`.

Body importante:

```json
{
  "reason": "Cliente devolvió el pedido y se verificó el efectivo",
  "expectedVersion": 4
}
```

La operación debe:

- Cancelar lógicamente cada `Payment` no cancelado de la venta, conservando actor, fecha, motivo y una clave derivada de idempotencia.
- Cancelar o actualizar la `AccountReceivable` relacionada y el `collectionStatus` de la venta.
- Restaurar el inventario en la misma ubicación de origen y registrar movimientos `CANCEL_SALE`.
- Marcar como `CANCELLED` los `SaleDocument` internos relacionados sin eliminar snapshots.
- Cancelar una `BillingRequest` en estado `REQUESTED` o `IN_REVIEW`, conservando su historial.
- Registrar auditoría con antes, después, motivo, actor, correlación y efectos afectados.
- Persistir la venta como `CANCELLED` solamente si todos los efectos anteriores concluyen.

Validaciones:

- Requiere motivo, `expectedVersion` y `Idempotency-Key`.
- Solo puede ejecutar `ADMIN` y sobre una venta `CONFIRMED`.
- Una venta asociada a cierre POS o liquidación de ruta `CLOSED` requiere reapertura versionada antes de ejecutar; la anulación no reabre cierres automáticamente.
- Una factura externa activa relacionada requiere cancelarse desde facturación antes de anular la venta.
- Reintentar la misma clave y payload devuelve el resultado persistido sin duplicar reversas, movimientos o documentos cancelados.
- Reutilizar la clave con otro payload responde conflicto.
- Un fallo en cualquier efecto revierte toda la transacción y conserva la venta en su estado anterior.

## Impresión de documentos

La impresión y reimpresión usa `GET /api/sales/:saleId/documents/:documentId/print`, definido en `sales-documents-api.md`. El endpoint carga el `SaleDocument` exacto y renderiza sus snapshots inmutables; no puede completar el documento con la venta, el cliente o los productos actuales.

## Extensión: documentos de venta

Los contratos de venta deben complementarse con `specs/.specs/03-api/sales-documents-api.md` para consultar y mantener nota sencilla, nota grande, ticket/comprobante interno y otros documentos operativos de venta.
La edición y reapertura del ciclo de vida documental vive únicamente en `sales-documents`; este contrato solo expone la relación `documents[]` desde la venta y no duplica ese comportamiento.

## Extensión: solicitudes administrativas

`billing-requests` modela la relación interna de cliente, venta y cuenta por cobrar cuando la administración solicita control de factura. Su contrato vive en `specs/.specs/03-api/billing-requests-api.md`.

## Extensión: ventas de punto externo

Los endpoints existentes de ventas deben soportar los siguientes campos sin crear un flujo paralelo:

- `saleChannel`: `COUNTER`, `EXTERNAL_POINT_OF_SALE`, `ROUTE`, `INSTITUTIONAL` o `WHOLESALE`.
- `documentType`: `SCALE_TICKET`, `SIMPLE_NOTE`, `LARGE_NOTE` o `INTERNAL_RECEIPT`.
- `physicalFolio` opcional y requerido cuando la política del documento lo determine.
- `pointOfSaleDailyCloseId` opcional una vez asociada la venta a un cierre.

`GET /api/sales` agrega filtros `saleChannel`, `documentType`, `physicalFolio` y `pointOfSaleDailyCloseId`.

`POST /api/sales` acepta `saleChannel`, `documentType` y `physicalFolio` con estas validaciones:

- `EXTERNAL_POINT_OF_SALE` requiere `locationId` de tipo punto externo y estado activo.
- `ROUTE` requiere `locationId` de tipo `ROUTE_STOCK` activo asociado a la ruta.
- Público general puede omitir `customerId` en contado.
- Cliente fijo usa `customerId` y precios resueltos por política comercial o autorización auditable.
- La solicitud administrativa se crea con `requiresAdministrativeInvoice` y el objeto `billingRequest`; no agrega un valor propio de `documentType` ni genera CFDI.
- `SCALE_TICKET` registra una venta interna y puede asociar después una `ScaleTicketReference`; la referencia se captura manualmente.
- La venta confirmada descuenta inventario únicamente de su `OperationalLocation`.

La asociación al cierre se realiza mediante el contrato de `point-of-sale-closing-api.md`; no se permite cambiar `locationId` para forzar una conciliación.
