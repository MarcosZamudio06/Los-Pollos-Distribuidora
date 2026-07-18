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

## POST /api/sales

Propósito: crear y confirmar venta de contado o crédito.

Permisos: `ADMIN`, `SELLER`.

Body importante:

`initialPayment` es opcional cuando no se recibe dinero al confirmar la venta. Si se envía, requiere `amount`, `paymentMethod` y `paidAt`.

```json
{
  "customerId": "string opcional para contado pagado al momento; requerido para crédito o contraentrega sin pago inicial",
  "locationId": "string",
  "saleChannel": "COUNTER",
  "documentType": "SIMPLE_NOTE",
  "physicalFolio": "string opcional",
  "requiresAdministrativeInvoice": true,
  "billingRequest": {
    "reason": "Motivo obligatorio",
    "notes": "Notas opcionales"
  },
  "paymentType": "CASH_SALE",
  "initialPayment": {
    "amount": 500,
    "paymentMethod": "CASH",
    "paidAt": "2026-06-21T10:00:00.000Z"
  },
  "discount": 0,
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
- `payment` cuando exista abono inicial o pago total.
- `accountReceivable` cuando exista saldo pendiente.
- `billingRequest` cuando se genere o relacione solicitud administrativa.
- `inventoryMovements[]` generados.
- `ticketId` o referencia de ticket interno si se genera en la confirmación.
- `documents[]` cuando el flujo genere nota o documento operativo.

Validaciones:

- Debe contener al menos un item.
- `paymentType` clasifica solo el tipo de venta (`CASH_SALE` o `CREDIT_SALE`); no representa mora, abonos ni envejecimiento.
- `locationId` requerido como ubicación operativa de descuento.
- `saleChannel` y `documentType` requeridos para distinguir el flujo documental.
- No vender sin stock suficiente en la ubicación indicada.
- No aceptar precios enviados por frontend como fuente de verdad.
- Calcular precios, descuentos, subtotales y totales en backend.
- Registrar unidad capturada, kilos, piezas y equivalencia aplicada cuando corresponda.
- `quantityPieces` debe ser entero cuando aplique.
- Venta de contado completamente pagada requiere `initialPayment` por el total o flujo equivalente de `Payment`.
- El pago inmediato de contado se registra como `Payment` asociado a `saleId`; no crea `AccountReceivable` artificial.
- Una venta de contado contraentrega puede confirmarse sin `initialPayment`; en ese momento no existe `Payment` ni `paymentMethod` recibido, pero requiere cliente registrado para conservar el saldo pendiente.
- Si la contraentrega deja saldo pendiente, debe generar `AccountReceivable` conforme al canon de todo saldo pendiente.
- El pago posterior de contraentrega liquida saldo pendiente como cobranza y requiere `Payment.accountReceivableId`.
- Venta a crédito requiere cliente registrado con crédito autorizado.
- Venta a crédito sin pago inicial genera `AccountReceivable` por el total.
- Venta a crédito con abono inicial genera `Payment` por el abono y `AccountReceivable` por el saldo.
- Rechazar venta a crédito si cliente está bloqueado por mora o excede límite sin autorización administrativa explícita.
- La política enviada debe coincidir con la asignada al cliente y estar activa dentro de su vigencia.
- `WARN_ONLY` permite confirmar y devuelve `creditWarnings[]`; `BLOCK_NEW_CREDIT` rechaza salvo override permitido.
- El override requiere `ADMIN`, motivo no vacío y `allowAdministrativeOverride=true`; no puede omitir `BLOCKED` o `SUSPENDED` administrativo.
- La venta conserva `creditDecisionSnapshot` y `creditDecisionEvaluatedAt` para auditoría.
- Los rechazos exponen códigos estables: `CREDIT_ADMINISTRATIVELY_BLOCKED`, `CREDIT_OVERDUE_BLOCKED`, `CREDIT_LIMIT_EXCEEDED`, `CREDIT_POLICY_MISMATCH` y códigos `CREDIT_OVERRIDE_*`.
- Contraentrega no registra dinero recibido hasta que exista `Payment`.
- `Payment` es la única fuente monetaria del flujo; `Sale` no persiste `paymentMethod`.
- Si `requiresAdministrativeInvoice=true`, la venta solo genera relación administrativa; no emite CFDI.
- Si `requiresAdministrativeInvoice=true`, `customerId` y `billingRequest.reason` son obligatorios; `billingRequest.notes` es opcional.
- No se aceptan identificadores internos de solicitud escritos manualmente.
- Descontar inventario, crear venta, items, pago inicial y cuenta por cobrar cuando aplique en una transacción.
- Requerir idempotencia para creación de venta y pago inicial.

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
- Si la venta fue a crédito o tiene saldo pendiente, ajustar o cancelar la cuenta por cobrar relacionada.
- Registrar movimientos de inventario.
- Ejecutar en transacción.
- Requerir motivo.
- Persistir actor, fecha, motivo e idempotencia de cancelación.

## GET /api/sales/:id/ticket

Propósito: obtener datos del ticket o comprobante interno del MVP.

Permisos: `ADMIN`, `SELLER` según alcance; `COLLECTIONS` lectura relacionada si aplica.

Respuesta `data`:

- `ticketId`, `ticketNumber`, `saleNumber`, `createdAt`.
- `documentType`, `physicalFolio`, `requiresAdministrativeInvoice`.
- `sellerName`, `customerName` si existe.
- `locationId`, `locationName`.
- `items[]`: producto, unidad, kilos, piezas, precio unitario, subtotal.
- `subtotal`, `discount`, `tax`, `total`.
- `paymentType`, `collectionStatus`, `status`.
- `payments[]` opcional con `amount`, `paymentMethod`, `paidAt`, `saleId`, `accountReceivableId` cuando aplique.
- Leyenda: comprobante interno sin validez fiscal.

Validaciones:

- No devolver campos de timbrado, UUID fiscal, PAC, cadena original, sello digital ni estado SAT.
- No presentar el ticket como CFDI o factura fiscal.
- `paymentMethod` siempre se deriva de `Payment`; no forma parte persistida de `Sale`.

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
