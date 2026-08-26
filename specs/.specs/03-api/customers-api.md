# API — Clientes

Define contratos para clientes minoristas, mayoristas e institucionales, su perfil comercial/fiscal, crédito operativo y balance global por cliente. El perfil fiscal prepara los datos CFDI 4.0, pero no emite ni timbra CFDI.

## GET /api/customers

Propósito: listar y buscar clientes.

Permisos: `ADMIN`, `SELLER`, `COLLECTIONS`; `DRIVER` solo mediante flujos asignados.

Query:

- `page`, `limit`, `search`.
- `customerType`: `RETAIL`, `WHOLESALE`, `INSTITUTIONAL`.
- `creditStatus`: `ACTIVE`, `BLOCKED`, `SUSPENDED`.
- `commercialPolicyId`.
- `assignedRouteId`.
- `isActive`.

Respuesta `data.items[]`:

- `id`, `customerNumber`, `name`, `commercialName`, `phone`, `email`, `address`.
- `customerType`, `priceListId`, `creditLimit`, `creditDays`, `creditStatus`, `requiresBilling`, `isBlockedForCredit`, `effectiveCreditStatus`.
- `deliveryAddress`, `assignedRouteId`, `commercialPolicyId`.
- `fiscalName`, `taxId`, `fiscalPostalCode`, `fiscalRegime`, `fiscalUseCode`, `billingEmail` y `fiscalAddress`.
- `isActive`.
- `creditSummary` opcional: `globalBalance`, `outstandingAmount`, `overdueAmount`, `availableCredit`, `lastPaymentDate`.

Validaciones:

- Permitir filtros para clientes facturados e institucionales.
- No presentar datos fiscales como emisión fiscal.
- Mantener opcionales los campos fiscales mientras `requiresBilling=false`.
- El backend devuelve los datos fiscales normalizados y es la autoridad de validación.

## GET /api/customers/:id

Propósito: obtener detalle de cliente.

Permisos: `ADMIN`, `SELLER`, `COLLECTIONS`; `DRIVER` solo si tiene pedido asignado del cliente.

Respuesta `data`:

- Campos del cliente.
- `commercialPolicy` aplicada si existe.
- `creditSummary`: saldo global, saldo vencido, límite, crédito disponible, días de atraso, fecha del último pago, estado de bloqueo.
- `billingSummary`: facturado, pagado, saldo final, pedidos administrativos abiertos.
- `recentSales[]` y `recentPayments[]` opcionales según rol.

## POST /api/customers

Propósito: crear cliente minorista, mayorista o institucional.

Permisos: `ADMIN`, `SELLER` conforme a política.

Body importante:

```json
{
  "customerNumber": "C-1024",
  "name": "Restaurante El Centro",
  "commercialName": "El Centro",
  "phone": "2290000000",
  "email": "cliente@example.com",
  "address": "Dirección del cliente",
  "customerType": "INSTITUTIONAL",
  "priceListId": "string opcional",
  "creditLimit": 50000,
  "creditDays": 15,
  "creditStatus": "ACTIVE",
  "requiresBilling": true,
  "deliveryAddress": "Dirección de entrega",
  "assignedRouteId": "string opcional",
  "commercialPolicyId": "string opcional",
  "fiscalName": "Razón social fiscal",
  "taxId": "RFC",
  "fiscalPostalCode": "91700",
  "fiscalRegime": "601",
  "fiscalUseCode": "G03",
  "billingEmail": "facturacion@cliente.com",
  "fiscalAddress": "Domicilio fiscal opcional"
}
```

Respuesta `data`: cliente creado.

Validaciones:

- `name` requerido.
- `email` válido si existe.
- `billingEmail` válido si existe.
- Normalizar emails a minúsculas y recortar espacios; normalizar RFC y códigos fiscales a mayúsculas.
- `taxId` debe cumplir una estructura RFC mexicana válida, incluido fragmento de fecha válido.
- `fiscalPostalCode` debe contener exactamente cinco dígitos.
- `fiscalRegime` debe pertenecer al catálogo SAT de régimen fiscal y `fiscalUseCode` al catálogo SAT de UsoCFDI versionado por la aplicación; no usar texto libre. La compatibilidad régimen/UsoCFDI se revalida en el servicio de catálogo/PAC antes de emitir.
- Si `requiresBilling=true`, exigir `fiscalName`, `taxId`, `fiscalPostalCode`, `fiscalRegime`, `fiscalUseCode` y `billingEmail`. `fiscalAddress` no es obligatorio en la regla vigente.
- Si `requiresBilling=false`, aceptar campos fiscales vacíos sin bloquear la creación o actualización.
- Los errores de perfil deben responder `code` estable y `fields[]` con los nombres de campos afectados.
- No duplicar `phone` si se captura como identificador comercial.
- `customerType` requerido para distinguir `RETAIL`, `WHOLESALE` e `INSTITUTIONAL`.
- Si el cliente tiene crédito, debe definir límite, días y estado de crédito.
- Solo roles autorizados pueden capturar o modificar límite de crédito, días de crédito, bloqueo y política comercial.
- El perfil fiscal no emite CFDI, no modifica ventas ni inventario y no sustituye `BillingRequest`.

## PATCH /api/customers/:id

Propósito: actualizar cliente y condiciones comerciales autorizadas.

Permisos: `ADMIN`; `SELLER` limitado conforme a política; `COLLECTIONS` lectura o campos de cobranza permitidos si se define.

Validaciones:

- No permitir modificar límites de crédito o estado de bloqueo sin permiso autorizado.
- Cliente inactivo no debe seleccionarse en nuevas ventas.
- Aplicar las mismas reglas de normalización, catálogo y completitud fiscal del endpoint de creación.
- Las condiciones específicas del cliente prevalecen sobre políticas globales solo si negocio lo autoriza.

## DELETE /api/customers/:id

Propósito: desactivar cliente.

Permisos: `ADMIN`.

Respuesta `data`: cliente con `isActive=false`.

Validaciones:

- No eliminar físicamente.
- No ocultar historial de ventas, cuentas por cobrar, pagos o solicitudes administrativas.

## GET /api/customers/:id/sales

Propósito: consultar historial de ventas del cliente.

Permisos: `ADMIN`, `SELLER` conforme a alcance, `COLLECTIONS` para ventas a crédito relacionadas.

Query:

- `page`, `limit`.
- `dateFrom`, `dateTo`.
- `paymentType`: `CASH_SALE`, `CREDIT_SALE`.
- `status`.

Respuesta `data.items[]`:

- `id`, `saleNumber`, `createdAt`, `total`, `paymentType`, `collectionStatus`, `status`, `locationId`.
- `paymentsSummary` opcional con `totalPaid`, `lastPaidAt`, `methods[]`.
- `accountReceivableId` cuando sea venta a crédito.
- `billingRequestId` cuando exista solicitud administrativa.

## GET /api/customers/:id/credit-summary

Propósito: consultar saldo global, mora y disponibilidad de crédito antes de vender o cobrar.

Permisos: `ADMIN`, `SELLER` para validación de venta, `COLLECTIONS`.

Respuesta `data`:

- `customerId`, `creditStatus`, `creditLimit`, `creditDays`, `paymentTermsDays`.
- `agingStatus` y `collectionStatus` se consultan por cuenta por cobrar, no en el estado administrativo del cliente.
- `globalBalance`, `outstandingAmount`, `overdueAmount`, `availableCredit`.
- `hasOverdueBalance`, `isBlocked`, `blockingReason`, `blockingReasons[]`, `daysOverdue`, `maximumDaysOverdue`, `lastPaymentDate`.
- `effectiveCreditStatus`: `ACTIVE`, `WARNING` o `BLOCKED`; `overdueBlockingMode`; `canAdministrativeOverride`.
- Los campos efectivos se derivan en tiempo de consulta desde vencimientos, saldo, límite, estado administrativo y política efectiva. No reemplazan `creditStatus`.
- `commercialPolicyId` aplicada.
- `billingSummary`: facturado, pagado, saldo final.

Validaciones:

- Debe considerar cuentas vigentes, por vencer, parcialmente pagadas, pagadas, vencidas y atrasadas.
- Debe permitir identificar bloqueo por mora o límite excedido.
