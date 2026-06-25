# Especificación de Base de Datos

## Motor

PostgreSQL.

## ORM

Prisma.

## Convenciones

- Todas las tablas deben tener `id`.
- Usar UUID o CUID para identificadores si el proyecto lo requiere.
- Todas las entidades principales deben tener `createdAt` y `updatedAt`.
- Las entidades que puedan desactivarse deben usar `isActive`.
- Evitar eliminación física en entidades críticas; preferir cancelación o desactivación.
- Usar transacciones en ventas, compras y cancelaciones.
- Las cantidades vendidas o controladas por kilo deben permitir decimales.
- Las cantidades vendidas o controladas por pieza deben manejarse como enteros, salvo regla explícita posterior del negocio.
- No depender de `Product.stock` como inventario global cuando existan múltiples ubicaciones; el stock operativo debe consultarse por producto y ubicación.
- Registrar ubicación operativa en ventas, compras, ajustes, traspasos y movimientos de inventario.
- Mantener trazabilidad suficiente para reportes operativos con latencia máxima de 60 segundos en condiciones normales.

## Decisiones abiertas de modelo de datos

Estas decisiones bloquean el esquema definitivo y deben permanecer visibles hasta ser resueltas por negocio:

- Modelo final de sucursal vs almacén: jerarquía sucursal-almacén, ubicaciones independientes o modelo mixto.
- Regla exacta de almacén/ubicación para descuento de stock en ventas.
- Equivalencias oficiales kilo-pieza por producto y responsable de modificación.
- Política exacta de redondeo para kilos, piezas, equivalencias, subtotales, saldos y pagos.
- Tolerancias de merma, diferencia de peso, devolución y rechazo parcial.
- Requisito offline de choferes y datos que podrían requerir sincronización local.
- Combinación obligatoria de evidencia de entrega.
- Profundidad de preparación de datos para CFDI/SAT futuro sin implementar emisión fiscal en MVP.

## Separación de modelo estructural y configuración administrativa

El esquema debe separar invariantes estructurales del dominio de parámetros operativos administrables.

### Decisiones estructurales fijas

No son configurables por administración y deben permanecer en el modelo de datos:

- El inventario se consulta y modifica por `OperationalLocation`.
- `Sale`, `Purchase`, `InventoryMovement` e `InventoryTransfer` deben referenciar ubicaciones operativas.
- Las ventas a crédito generan `AccountReceivable`.
- Los pagos se registran en `Payment` y no deben perder trazabilidad histórica.
- Los traspasos usan `InventoryTransfer` e `InventoryTransferItem` con origen, destino, estado y responsable.
- La equivalencia kilo-pieza es una capacidad central y debe persistirse mediante entidad o campos auditables; no debe existir solo como cálculo temporal.
- El MVP solo guarda comprobantes internos; SAT/CFDI queda fuera del esquema operativo inicial.

### Parámetros configurables

Deben modelarse en entidades administrativas como `CommercialPolicy` y `OperationalConfig`, o en campos específicos de entidades cuando el parámetro pertenece a un registro individual:

- Límite de crédito por cliente o política comercial.
- Días de crédito por cliente o política comercial.
- Bloqueo por mora o por límite excedido.
- Modo de redondeo aprobado por negocio.
- Tolerancia de merma, diferencia de peso, devolución o rechazo parcial.
- Estrategia predeterminada para seleccionar ubicación de descuento en venta.
- Intervalo de refresco de reportes casi en tiempo real, sin superar 60 segundos.
- Evidencia de entrega requerida.
- Política offline de choferes si negocio la confirma como configurable.

Las entidades de configuración deben incluir auditoría mínima: usuario que crea o modifica, fecha de vigencia, estado activo y descripción del cambio cuando aplique.

## Entidades principales

### User

Campos:

- id
- name
- email
- passwordHash
- roleId
- isActive
- createdAt
- updatedAt

Relaciones:

- User pertenece a Role.
- User puede crear Sales.
- User puede tener DeliveryRoutes asignadas.

### Role

Campos:

- id
- name
- description
- createdAt
- updatedAt

Roles iniciales:

- ADMIN
- SELLER
- WAREHOUSE
- DRIVER
- COLLECTIONS

### OperationalLocation

Representa una ubicación operativa donde se controla inventario. Puede modelar sucursal, almacén o una combinación según la decisión final de negocio.

Campos:

- id
- name
- code
- type
- parentId
- address
- isActive
- createdAt
- updatedAt

Relaciones requeridas:

- OperationalLocation puede tener una ubicación padre mediante `parentId` si se confirma jerarquía sucursal-almacén.
- OperationalLocation tiene muchos InventoryBalance.
- OperationalLocation tiene muchos Sale como ubicación de descuento.
- OperationalLocation tiene muchos Purchase como ubicación receptora.
- OperationalLocation tiene muchos InventoryMovement.
- OperationalLocation tiene muchos InventoryTransfer como origen.
- OperationalLocation tiene muchos InventoryTransfer como destino.

Tipos sugeridos:

- BRANCH
- WAREHOUSE
- MIXED
- EXTERNAL_POINT_OF_SALE
- ROUTE_STOCK

Notas:

- `parentId` permite representar un almacén dentro de una sucursal si el negocio confirma ese modelo.
- Si sucursal y almacén operan como entidades independientes, `parentId` puede quedar vacío.
- No se debe asumir una jerarquía final hasta cerrar la decisión de negocio.
- `EXTERNAL_POINT_OF_SALE` es el tipo canónico para pollerías o puntos fijos externos.
- `ROUTE_STOCK` representa inventario cargado a una ruta operativa y solo debe usarse asociado a `DeliveryRoute`.

### Product

Campos:

- id
- name
- sku
- description
- categoryId
- presentationType
- salePrice
- purchaseCost
- minStock
- unit
- pieceWeightEquivalent
- equivalentPolicyStatus
- isActive
- createdAt
- updatedAt

Relaciones requeridas:

- Product pertenece opcionalmente a Category.
- Product tiene muchos InventoryBalance.
- Product tiene muchos ProductUnitEquivalent.
- Product tiene muchos SaleItem, PurchaseItem, InventoryMovement e InventoryTransferItem.

Reglas:

- salePrice > 0.
- purchaseCost >= 0.
- minStock >= 0.
- sku único si existe.
- `presentationType` clasifica el catálogo semántico del producto y debe permitir `KG`, `WHOLE` o `CUT`.
- `unit` sigue siendo la unidad operativa y debe permitir productos vendidos por kilo, pieza o ambas unidades.
- `presentationType` y `unit` son independientes: el primero clasifica el catálogo, el segundo define la captura operativa.
- `pieceWeightEquivalent` es opcional mientras no existan equivalencias oficiales aprobadas por negocio.
- Para trazabilidad completa, las equivalencias oficiales deben preferir `ProductUnitEquivalent`; `pieceWeightEquivalent` solo puede usarse como atajo operativo si no reemplaza historial ni auditoría.
- La política de redondeo de equivalencias queda pendiente de definición.

Presentaciones semánticas sugeridas:

- KG
- WHOLE
- CUT

Unidades operativas sugeridas:

- KG
- PIECE
- KG_AND_PIECE

### ProductUnitEquivalent

Representa equivalencias oficiales kilo-pieza por producto con vigencia y auditoría.

Campos:

- id
- productId
- unitFrom
- unitTo
- factor
- roundingMode
- effectiveFrom
- effectiveTo
- status
- approvedByUserId
- createdByUserId
- createdAt
- updatedAt

Estados sugeridos:

- DRAFT
- ACTIVE
- INACTIVE

Reglas:

- `factor` debe ser mayor a cero.
- Solo una equivalencia activa por producto y par de unidades debe aplicar para una fecha determinada.
- No se debe convertir kilo/pieza sin equivalencia aprobada cuando el producto requiera ambas unidades.
- La decisión de quién puede modificar equivalencias sigue bloqueada hasta definición de negocio.

### InventoryBalance

Campos:

- id
- productId
- locationId
- quantityKg
- quantityPieces
- minQuantityKg
- minQuantityPieces
- createdAt
- updatedAt

Reglas:

- Debe existir una combinación única de `productId` y `locationId`.
- `quantityKg` y `quantityPieces` no deben ser negativos.
- Cuando un producto solo permita kilo o pieza, la unidad no aplicable debe permanecer en cero o nula según la decisión técnica del esquema.
- La conversión entre kilos y piezas solo debe aplicarse con equivalencia aprobada por negocio.

### Category

Campos:

- id
- name
- description
- isActive
- createdAt
- updatedAt

### Customer

Campos:

- id
- customerNumber
- name
- commercialName
- phone
- email
- billingEmail
- address
- customerType
- priceListId
- creditLimit
- creditDays
- creditStatus
- requiresBilling
- isBlockedForCredit (proyección derivada, no fuente de verdad persistida)
- fiscalName
- taxId
- fiscalAddress
- deliveryAddress
- assignedRouteId
- commercialPolicyId
- notes
- isActive
- createdAt
- updatedAt

Tipos sugeridos:

- RETAIL
- WHOLESALE
- INSTITUTIONAL

Estados de crédito sugeridos:

- ACTIVE
- BLOCKED
- SUSPENDED

Notas:

- Los campos fiscales y comerciales son preparación para control administrativo y no habilitan CFDI en el MVP.
- Las condiciones mayoristas e institucionales pueden incluir lista de precios, límite de crédito, días de crédito, ruta asociada, número interno y dirección de entrega.
- `commercialPolicyId` permite heredar condiciones comerciales configuradas sin eliminar parámetros específicos del cliente cuando negocio los autorice.
- `Customer.creditStatus` es la fuente de verdad administrativa para habilitar, bloquear o suspender crédito.
- `isBlockedForCredit` es una proyección de lectura derivada de `creditStatus` y, cuando aplique, de reglas vigentes de mora o límite; no debe persistirse ni actualizarse como un segundo estado independiente.

### Supplier

Campos:

- id
- name
- phone
- email
- address
- isActive
- createdAt
- updatedAt

### Sale

Campos:

- id
- saleNumber
- customerId
- userId
- locationId
- saleChannel
- documentType
- physicalFolio
- requiresAdministrativeInvoice
- deliveredByUserId
- collectedByUserId
- routeId
- commercialPolicyId
- collectionStatus
- subtotal
- discount
- tax
- total
- paymentType
- status
- cancelledAt
- cancelledByUserId
- cancellationReason
- createdAt
- updatedAt

Relaciones requeridas:

- Sale pertenece opcionalmente a Customer.
- Sale pertenece a User como vendedor o usuario responsable.
- Sale pertenece a OperationalLocation como ubicación de descuento.
- Sale puede pertenecer a un DeliveryRoute cuando sale a reparto.
- Sale puede referenciar CommercialPolicy usada al confirmar la venta.
- Sale tiene muchos SaleItem.
- Sale tiene muchos SaleDocument.
- Sale puede tener muchos Payment cuando registra contado inmediato o abono inicial.
- Sale tiene una AccountReceivable opcional cuando es venta a crédito.
- Sale tiene un BillingRequest opcional cuando la venta genera solicitud administrativa interna.
- Sale tiene un DeliveryOrder opcional cuando se asigna a reparto.

Estados:

- DRAFT
- CONFIRMED
- CANCELLED

Canales:

- COUNTER
- EXTERNAL_POINT_OF_SALE
- ROUTE
- INSTITUTIONAL
- WHOLESALE

Tipos de venta:

- CASH_SALE
- CREDIT_SALE

Estados de cobranza:

- UNPAID
- PARTIALLY_PAID
- PAID
- CANCELLED

Notas:

- `Payment` es la única fuente monetaria de dinero recibido.
- `paymentType` clasifica solo la naturaleza de la venta: `CASH_SALE` o `CREDIT_SALE`.
- `collectionStatus` clasifica el estado de cobranza del saldo asociado a la venta.
- `paymentMethod` no pertenece a `Sale`; pertenece a `Payment`.
- Una venta de contado completamente pagada puede no generar `AccountReceivable`.
- Una venta de contado completamente pagada debe conservar su `Payment` asociado a `Sale`, sin crear una cuenta por cobrar artificial.
- Una venta a crédito sin pago genera `AccountReceivable` por el total.
- Una venta a crédito con abono inicial genera `Payment` por el abono y `AccountReceivable` por el saldo pendiente.

### SaleItem

Campos:

- id
- saleId
- productId
- quantity
- quantityKg
- quantityPieces
- unit
- unitPrice
- unitEquivalentId
- appliedEquivalentFactor
- roundingMode
- productNameSnapshot
- productSkuSnapshot
- unitPriceSnapshot
- quantitySnapshot
- subtotal
- createdAt
- updatedAt

Notas:

- `quantity` puede conservarse como campo operativo genérico solo si no pierde trazabilidad de kilo/pieza.
- Para productos vendidos por ambas unidades, debe conservarse la cantidad capturada y la equivalencia usada cuando aplique.
- `unitEquivalentId` y `appliedEquivalentFactor` preservan la equivalencia aplicada al momento de la venta aunque la política cambie después.
- La política exacta de redondeo queda pendiente de negocio.

### SaleDocument

Campos:

- id
- saleId
- documentType
- operationalLocationId
- physicalFolio
- status
- requiresAdministrativeInvoice
- deliveredByUserId
- collectedByUserId
- routeId
- customerSnapshot
- productSnapshot
- priceSnapshot
- createdAt
- updatedAt

Estados:

- DRAFT
- ISSUED
- COLLECTED
- CANCELLED

Notas:

- `SaleDocument` modela la libreta documental de menudeo, reparto e institucional.
- La nota sencilla, nota grande, ticket interno y comprobante operativo conservan folio, participantes y snapshots históricos.
- `BillingRequest` modela por separado la solicitud administrativa de facturación y conserva la relación administrativa de cliente, venta y cuenta por cobrar cuando aplique.
- El comprobante interno operativo se representa con `SaleDocument(documentType=INTERNAL_RECEIPT)` y no representa CFDI.

### Purchase

Campos:

- id
- purchaseNumber
- supplierId
- userId
- locationId
- subtotal
- total
- status
- createdAt
- updatedAt

Relaciones requeridas:

- Purchase pertenece a Supplier.
- Purchase pertenece a User como responsable.
- Purchase pertenece a OperationalLocation como ubicación que recibe stock.
- Purchase tiene muchos PurchaseItem.

Estados:

- DRAFT
- CONFIRMED
- CANCELLED

### PurchaseItem

Campos:

- id
- purchaseId
- productId
- quantity
- quantityKg
- quantityPieces
- unit
- unitCost
- unitEquivalentId
- appliedEquivalentFactor
- subtotal
- createdAt
- updatedAt

### InventoryMovement

Campos:

- id
- productId
- locationId
- userId
- type
- quantity
- quantityKg
- quantityPieces
- previousStock
- newStock
- previousQuantityKg
- newQuantityKg
- previousQuantityPieces
- newQuantityPieces
- reason
- referenceType
- referenceId
- transferId
- saleId
- purchaseId
- routeSettlementId
- createdAt

Tipos:

- IN
- OUT
- ADJUSTMENT
- SALE
- PURCHASE
- CANCEL_SALE
- CANCEL_PURCHASE
- TRANSFER_OUT
- TRANSFER_IN
- SHRINKAGE
- RETURN

Notas:

- `previousStock` y `newStock` son compatibles con un modelo simple, pero para el alcance revisado deben preferirse campos por kilo/pieza y ubicación.
- Toda merma, diferencia de peso, pérdida operativa, devolución o rechazo parcial debe quedar como movimiento con motivo obligatorio.
- Las referencias específicas (`saleId`, `purchaseId`, `transferId`, `routeSettlementId`) deben usarse cuando aplique para reforzar integridad; `referenceType` y `referenceId` solo deben complementar trazabilidad genérica.

### InventoryTransfer

Campos:

- id
- transferNumber
- originLocationId
- destinationLocationId
- userId
- status
- notes
- requestedAt
- confirmedAt
- cancelledAt
- cancelledByUserId
- cancellationReason
- createdAt
- updatedAt

Estados:

- DRAFT
- REQUESTED
- IN_TRANSIT
- CONFIRMED
- CANCELLED

Reglas:

- `DRAFT` y `REQUESTED` no modifican inventario.
- `IN_TRANSIT` representa salida física en proceso, pero no confirma recepción final ni debe duplicar decrementos posteriores en venta.
- `CONFIRMED` genera movimientos `TRANSFER_OUT` en origen y `TRANSFER_IN` en destino en una sola transacción.
- Crear, confirmar y cancelar deben soportar idempotencia en capa de API/aplicación para evitar duplicar traspasos o movimientos.
- La carga a ruta debe usar `destinationLocationId` de tipo `ROUTE_STOCK`.
- La devolución de sobrante desde ruta debe usar `originLocationId` de tipo `ROUTE_STOCK`.
- La cancelación debe conservar actor, fecha y motivo auditable.

### InventoryTransferItem

Campos:

- id
- transferId
- productId
- quantityKg
- quantityPieces
- unit
- createdAt
- updatedAt

Reglas:

- No confirmar si la ubicación origen no tiene stock suficiente.
- Confirmar debe generar movimientos de salida y entrada trazables.

### AccountReceivable

Campos:

- id
- customerId
- saleId
- billingRequestId
- originalSaleId
- originalAmount
- outstandingAmount
- saleDate
- dueDate
- paymentTermsDays
- lastPaymentDate
- daysOverdue
- paidAt
- cancelledAt
- agingStatus
- physicalDocumentFolio
- collectorUserId
- commercialPolicyId
- status
- createdAt
- updatedAt

Estados de envejecimiento (`agingStatus`):

- CURRENT
- DUE_SOON
- OVERDUE

Estados de cobranza (`status`):

- UNPAID
- PARTIALLY_PAID
- PAID
- CANCELLED

Reglas:

- Toda venta con importe pendiente debe generar o actualizar una cuenta por cobrar.
- El saldo pendiente no debe ser negativo.
- La cancelación de una venta con saldo pendiente debe ajustar o cancelar la cuenta relacionada.
- Debe conservar la política comercial o parámetros de crédito aplicados al momento de originarse.
- Debe conservar el folio físico del documento, el responsable de cobranza, los días de crédito y la última fecha de pago cuando exista.
- Puede relacionarse con una solicitud administrativa de factura interna cuando aplique.
- `status` representa cobranza y `agingStatus` representa envejecimiento; no deben mezclarse.
- `status` es la fuente de verdad del ciclo de cobranza; `agingStatus` se deriva de fechas y saldo vigente, y no reemplaza ni duplica `status`.

### Payment

Campos:

- id
- accountReceivableId
- saleId
- customerId (opcional o derivable según el flujo)
- userId
- collectedByUserId
- collectionPass
- amount
- paymentMethod
- bankName
- referenceNumber
- appliedDocumentId
- appliedDocumentType
- operationalLocationId
- routeId
- routeSettlementId
- status
- paidAt
- cancelledAt
- createdAt
- updatedAt

Reglas:

- Permite pagos parciales y totales.
- `accountReceivableId` es requerido para pagos de cobranza o cualquier pago que liquide saldo pendiente.
- Un pago inmediato de venta de contado puede relacionarse directamente con `saleId` sin crear `AccountReceivable` artificial.
- `customerId` no es obligatorio universalmente: en cobranza se deriva de `AccountReceivable.customerId`; en contado inmediato se deriva de `Sale.customerId` cuando exista y puede ser nulo para público general.
- Si `customerId` se persiste por trazabilidad, debe coincidir con la cuenta por cobrar o venta asociada y no constituye una fuente independiente.
- Un pago no puede exceder el saldo pendiente salvo regla futura para anticipos o saldos a favor.
- Los cobros recibidos por chofer deben poder asociarse a liquidación de ruta cuando aplique.
- Una segunda vuelta de cobranza debe poder conservarse con `collectionPass` y `collectedByUserId`.
- Debe conservar banco, referencia y documento aplicado para auditoría administrativa.
- `Payment` es la única fuente monetaria del sistema para dinero recibido.
- Contraentrega no registra dinero hasta que exista `Payment`.

Estados sugeridos:

- REGISTERED
- CANCELLED
- APPLIED

### BillingRequest

Campos:

- id
- saleId
- customerId
- requestedByUserId
- status
- requestedAt
- reviewedAt
- reviewedByUserId
- reason
- notes
- createdAt
- updatedAt

Estados:

- REQUESTED
- IN_REVIEW
- APPROVED
- REJECTED
- CANCELLED

Notas:

- La solicitud administrativa de factura es una relación interna, no CFDI.
- Puede relacionarse con la venta y con la cuenta por cobrar derivada cuando corresponda, sin convertirse en documento operativo.
- No debe modificar inventario ni sustituir el historial de venta o cobranza.

### CommercialPolicy

Define condiciones comerciales administrables para clientes, mayoristas e institucionales.

Campos:

- id
- name
- description
- customerType
- priceListId
- defaultCreditLimit
- defaultCreditDays
- overdueBlockingMode
- creditLimitBlockingMode
- allowAdministrativeOverride
- isActive
- effectiveFrom
- effectiveTo
- createdByUserId
- updatedByUserId
- createdAt
- updatedAt

Reglas:

- No debe eliminar la obligación estructural de crear cuentas por cobrar en ventas a crédito.
- Puede definir valores predeterminados, pero el cliente puede conservar condiciones específicas cuando negocio lo autorice.

### OperationalConfig

Define parámetros operativos administrables y auditables.

Campos:

- id
- key
- value
- valueType
- scope
- locationId
- description
- effectiveFrom
- effectiveTo
- isActive
- createdByUserId
- updatedByUserId
- createdAt
- updatedAt

Parámetros iniciales sugeridos:

- ROUNDING_MODE
- SHRINKAGE_TOLERANCE
- DEFAULT_SALE_STOCK_LOCATION_STRATEGY
- REPORT_REFRESH_INTERVAL_SECONDS
- REQUIRED_DELIVERY_EVIDENCE
- DRIVER_OFFLINE_POLICY

Reglas:

- `REPORT_REFRESH_INTERVAL_SECONDS` no debe superar 60 segundos en condiciones normales de operación.
- `DEFAULT_SALE_STOCK_LOCATION_STRATEGY` no elimina el requisito de registrar `locationId` en cada venta.
- `DRIVER_OFFLINE_POLICY` queda bloqueado hasta que negocio defina si la experiencia móvil operará sin conexión.
- La configuración debe auditar usuario creador y último modificador.

### DeliveryRoute

Campos:

- id
- name
- driverId
- status
- scheduledDate
- originLocationId
- routeStockLocationId
- startedAt
- completedAt
- createdAt
- updatedAt

Estados:

- PENDING
- IN_PROGRESS
- COMPLETED
- CANCELLED

Notas:

- `routeStockLocationId` es requerido para rutas con carga operativa.
- La relación recomendada es `DeliveryRoute 1:1 OperationalLocation` de tipo `ROUTE_STOCK`.
- Las ventas y devoluciones de ruta no deben operar sin `routeStockLocationId`.

### DeliveryOrder

Campos:

- id
- routeId
- saleId
- accountReceivableId
- status
- deliveryAddress
- deliveredAt
- notes
- createdAt
- updatedAt

Estados:

- PENDING
- IN_ROUTE
- DELIVERED
- NOT_DELIVERED
- CANCELLED
- PARTIALLY_REJECTED
- RETURNED

Campos adicionales:

- collectedByUserId
- deliveredByUserId
- collectionPass

Notas:

- `collectedAmount` no debe persistirse como fuente de verdad monetaria.
- Si se expone en lecturas, debe derivarse de `Payment.amount` filtrado por la venta, ruta o cuenta por cobrar relacionada.

### DeliveryEvidence

Campos:

- id
- deliveryOrderId
- type
- value
- capturedAt
- createdAt

Tipos sugeridos:

- PHOTO
- SIGNATURE
- GEOLOCATION
- NOTE

Notas:

- La combinación obligatoria de evidencia queda pendiente de decisión de negocio.
- Si se exige operación offline, puede requerirse identificador temporal de cliente móvil y metadatos de sincronización; no debe asumirse hasta cerrar la decisión.

### RouteSettlement

Campos:

- id
- routeId
- driverId
- status
- version
- expectedCashAmount
- expectedTransferAmount
- differenceAmount
- notes
- closedAt
- reopenedAt
- reopenedByUserId
- reopenedReason
- createdAt
- updatedAt

Estados:

- OPEN
- CLOSED
- REVIEW_REQUIRED

Campos adicionales:

- routeCollectionsSummary
- paidAtDeliveryAmount
- overdueAmount
- secondPassCollectionsAmount

Notas:

- Los totales cobrados de liquidación deben derivarse de `Payment` asociados a `routeId` y `routeSettlementId`.
- No debe existir una segunda fuente monetaria manual para efectivo o transferencias ya registradas como `Payment`.

## Relaciones clave

- Role 1:N User
- User 1:N ProductUnitEquivalent como aprobador/creador
- OperationalLocation 1:N InventoryBalance
- OperationalLocation 1:N InventoryMovement
- OperationalLocation 1:N Sale
- OperationalLocation 1:N Purchase
- OperationalLocation 1:N InventoryTransfer como origen
- OperationalLocation 1:N InventoryTransfer como destino
- OperationalLocation 1:N DeliveryRoute como origen opcional
- OperationalLocation 1:1 DeliveryRoute como stock de ruta cuando `type=ROUTE_STOCK`
- OperationalLocation 1:N OperationalConfig como alcance opcional
- Category 1:N Product
- Product 1:N InventoryBalance
- Product 1:N ProductUnitEquivalent
- Customer 1:N Sale
- Customer 1:N AccountReceivable
- Customer 1:N BillingRequest
- Customer 1:N Payment
- CommercialPolicy 1:N Customer opcional
- CommercialPolicy 1:N Sale opcional
- CommercialPolicy 1:N AccountReceivable opcional
- User 1:N Sale
- User 1:N Payment
- User 1:N Purchase
- User 1:N CommercialPolicy como creador/modificador
- User 1:N OperationalConfig como creador/modificador
- Sale 1:N SaleItem
- Sale 1:N SaleDocument
- Sale 1:N Payment opcional
- Sale 1:1 AccountReceivable opcional
- Sale 1:1 BillingRequest opcional
- Sale 1:N InventoryMovement opcional
- Product 1:N SaleItem
- ProductUnitEquivalent 1:N SaleItem opcional
- ProductUnitEquivalent 1:N PurchaseItem opcional
- Supplier 1:N Purchase
- Purchase 1:N PurchaseItem
- Purchase 1:N InventoryMovement opcional
- Product 1:N PurchaseItem
- Product 1:N InventoryMovement
- User 1:N InventoryMovement
- InventoryTransfer pertenece a OperationalLocation como origen y destino
- InventoryTransfer 1:N InventoryTransferItem
- InventoryTransfer 1:N InventoryMovement opcional
- Product 1:N InventoryTransferItem
- AccountReceivable 1:N Payment opcional
- AccountReceivable 1:1 BillingRequest opcional
- BillingRequest 1:1 Sale opcional
- BillingRequest 1:1 AccountReceivable opcional
- DeliveryRoute 1:N Payment opcional
- RouteSettlement 1:N Payment opcional
- User 1:N DeliveryRoute como driver
- DeliveryRoute 1:N DeliveryOrder
- DeliveryRoute 1:1 OperationalLocation como `routeStockLocation`
- Sale 1:1 DeliveryOrder opcional
- AccountReceivable 1:N DeliveryOrder opcional
- DeliveryOrder 1:N DeliveryEvidence
- DeliveryRoute 1:1 RouteSettlement opcional
- BillingRequest pertenece a Customer
- BillingRequest pertenece a Sale
- BillingRequest pertenece opcionalmente a AccountReceivable
- SaleDocument pertenece a Sale

## Fuera del MVP: pagos distribuidos

- `PaymentAllocation` queda fuera del modelo activo del MVP.
- En el MVP, cada `Payment` de cobranza debe tener `accountReceivableId` y aplicarse exactamente a una `AccountReceivable`.
- Los pagos inmediatos de contado pueden relacionarse directamente con `Sale` sin usar `PaymentAllocation` ni crear una cuenta por cobrar artificial.
- Los pagos agrupados o distribuidos entre varias cuentas por cobrar solo podrán agregarse en una fase posterior mediante actualización explícita de specs, modelo de datos, validaciones y flujos relacionados.

## Fuera del MVP: SAT/CFDI

- No crear tablas de timbrado fiscal, UUID fiscal, PAC, certificados, cancelación fiscal ni catálogos SAT obligatorios para el MVP.
- `SaleDocument(documentType=INTERNAL_RECEIPT)` representa el comprobante interno/ticket y no debe confundirse con factura fiscal.
- Los campos fiscales comerciales de cliente o comprobante solo preparan datos para una fase futura; no habilitan emisión CFDI.
- `BillingRequest` conserva la relación administrativa interna de una venta o cuenta por cobrar, sin emitir CFDI.

## Requisitos para reportes casi en tiempo real

- Los reportes deben basarse en operaciones confirmadas.
- La base de datos debe permitir consultar ventas, inventario, cobranza y reparto con latencia máxima de 60 segundos en condiciones normales.
- Los reportes deben distinguir ventas de contado, ventas a crédito, cobros, saldos vencidos, stock por ubicación y pedidos por estado de reparto.
- Los reportes no sustituyen cortes de caja, liquidaciones de ruta ni cierres contables.

## Extensión de persistencia: puntos de venta externos

### Ajustes a entidades existentes

- `OperationalLocation.type` admite `EXTERNAL_POINT_OF_SALE` y `ROUTE_STOCK`; ambas ubicaciones deben estar activas para nuevas operaciones.
- `Sale` agrega `saleChannel`, `documentType`, `physicalFolio` opcional y `pointOfSaleDailyCloseId` opcional.
- `Payment` agrega `operationalLocationId` cuando el cobro se recibe en una ubicación fija y `pointOfSaleDailyCloseId` opcional al asociarlo. `accountReceivableId` permanece requerido para cobranza o saldo pendiente; el contado inmediato puede asociarse a `saleId` sin `AccountReceivable` artificial.
- `InventoryMovement` puede referenciar `pointOfSaleDailyCloseId` solo para trazabilidad de un ajuste autorizado; el cierre no crea movimientos implícitos.
- `SaleDocument` concentra nota sencilla, nota grande y ticket/comprobante interno.
- La solicitud administrativa de factura se modela con `billingRequestId` y `requiresAdministrativeInvoice`, no como un valor de `Sale.documentType`.

Tipos sugeridos de documento de venta:

- `SCALE_TICKET`
- `SIMPLE_NOTE`
- `LARGE_NOTE`
- `INTERNAL_RECEIPT`

La solicitud administrativa no es CFDI y no incorpora timbrado, UUID fiscal, PAC o estado SAT.

### PointOfSaleDailyClose

Agregado de cierre operativo para una ubicación fija y fecha de negocio. Es independiente de `RouteSettlement`.

Campos:

- id
- operationalLocationId
- businessDate
- status
- version
- lastValidatedAt
- validatedSourceVersion
- openedByUserId
- reviewedByUserId
- closedByUserId
- cancelledByUserId
- reopenedByUserId
- totalInputKg
- totalSoldKg
- totalRemainingKg
- totalShortageKg
- totalSurplusKg
- scaleReportedKg
- scaleDifferenceKg
- cashTotal
- cardVoucherTotal
- transferTotal
- expenseTotal
- grossSalesTotal
- netCashExpected
- cashDifferenceTotal
- purchaseCostTotal
- grossProfitTotal
- netProfitTotal
- notes
- reviewedAt
- closedAt
- cancelledAt
- reopenedAt
- reopenedReason
- createdAt
- updatedAt

Estados:

- DRAFT
- REVIEWED
- CLOSED
- CANCELLED

Reglas:

- Solo un cierre no cancelado por `operationalLocationId` y `businessDate` mientras no se aprueben turnos o cajas múltiples.
- Los totales se recalculan en backend y se guardan como snapshot auditable al revisar y cerrar.
- Cerrar, cancelar o reabrir registra usuario, fecha, motivo y versión esperada.
- Las transiciones que afecten asociaciones, snapshots o ajustes relacionados se ejecutan en transacción.
- Una diferencia fuera de tolerancia no se oculta; genera advertencia o bloqueo según una política futura aún abierta.

### PointOfSaleDailyCloseLine

Campos:

- id
- pointOfSaleDailyCloseId
- section
- conceptType
- productId
- saleId
- inventoryMovementId
- scaleTicketReferenceId
- quantityKg
- quantityPieces
- amount
- notes
- createdByUserId
- createdAt
- updatedAt

Secciones:

- INPUT
- OUTPUT
- INCOME
- PROFIT

Conceptos mínimos:

- PRODUCT_RECEIVED
- SALE_NOTE
- SALE_SCALE_TICKET
- REMAINING_STOCK
- SHORTAGE
- SURPLUS
- OTHER_OUTPUT
- CASH_INCOME
- CARD_VOUCHER_INCOME
- TRANSFER_INCOME
- EXPENSE
- PURCHASE_COST
- GROSS_PROFIT
- NET_PROFIT

Las líneas son de conciliación y no alteran inventario sin un `InventoryMovement` autorizado independiente.

- Las líneas `INPUT` y `OUTPUT` pueden capturarse manualmente conforme al contrato del cierre.
- Las líneas `INCOME` y `PROFIT` son snapshots derivados por el backend; no admiten importes monetarios independientes capturados por el usuario.
- Los importes de pagos y cobranza dentro de `INCOME` se derivan exclusivamente de `Payment`. `CashMovement` solo aporta entradas, salidas o ajustes operativos de caja identificados por separado y nunca genera ingreso de venta o cobranza.
- Los importes de `PROFIT` se calculan desde operaciones asociadas y las fórmulas aprobadas; una línea persistida solo conserva el snapshot auditable.

### CashMovement

Campos:

- id
- operationalLocationId
- pointOfSaleDailyCloseId
- type
- movementChannel
- amount
- reason
- reference
- occurredAt
- userId
- createdAt
- updatedAt

Tipos:

- EXPENSE
- CASH_IN
- CASH_OUT
- ADJUSTMENT

Reglas:

- `operationalLocationId`, `type`, `amount`, `reason`, `occurredAt` y `userId` son requeridos.
- `pointOfSaleDailyCloseId` es opcional para movimientos capturados fuera de un cierre. Al crear un movimiento mediante el endpoint anidado del cierre, el backend lo asigna desde el cierre padre y no acepta que el cliente lo reemplace.
- El flujo anidado del MVP no requiere una asociación posterior mediante `cashMovementIds`; el movimiento nace vinculado al cierre.
- `movementChannel` clasifica el medio operativo de la entrada/salida de caja (`CASH`, `CARD_VOUCHER`, `TRANSFER`, `DEPOSIT`, `OTHER`) sin sustituir el `paymentMethod` de `Payment`.
- Un `CashMovement` no sustituye a `Payment`, no registra cobranza por sí mismo y no permite pagos sin `accountReceivableId` cuando el flujo sea de cobranza.

### ScaleTicketReference

Campos:

- id
- operationalLocationId
- pointOfSaleDailyCloseId
- saleId
- physicalFolio
- productId
- weightKg
- pieceCount
- unitPrice
- amount
- capturedByUserId
- capturedAt
- notes
- createdAt
- updatedAt

Reglas:

- Captura manual únicamente; no existe integración automática con báscula en el MVP.
- No confirma venta, no genera movimiento de inventario y no es comprobante fiscal.
- `physicalFolio` debe ser único por ubicación y fecha de negocio, salvo corrección auditada.

### Relaciones adicionales

- OperationalLocation 1:N PointOfSaleDailyClose
- OperationalLocation 1:N CashMovement
- OperationalLocation 1:N ScaleTicketReference
- PointOfSaleDailyClose 1:N PointOfSaleDailyCloseLine
- PointOfSaleDailyClose 1:N CashMovement
- PointOfSaleDailyClose 1:N ScaleTicketReference
- PointOfSaleDailyClose 1:N Sale mediante asociación opcional
- PointOfSaleDailyClose 1:N Payment mediante ubicación y asociación de cierre
- Sale 1:N ScaleTicketReference opcional
- Product 1:N PointOfSaleDailyCloseLine opcional
- Product 1:N ScaleTicketReference opcional
- User 1:N PointOfSaleDailyClose por acciones auditables

### Índices y restricciones

- Índice por `PointOfSaleDailyClose(operationalLocationId, businessDate, status)`.
- Restricción de unicidad condicional para un cierre no cancelado por ubicación y fecha, implementada según capacidades de PostgreSQL y Prisma.
- Índice por `CashMovement(operationalLocationId, occurredAt)`.
- Índice por `ScaleTicketReference(operationalLocationId, capturedAt)`.
- Restricción de integridad para impedir asociaciones de ventas, pagos o movimientos de otra ubicación.

### Decisiones abiertas

- Cierre único diario frente a cierre por turno o caja.
- Tolerancias y política de bloqueo por diferencias.
- Fórmulas de costo y utilidad, incluida utilidad por pollo.
- Catálogo final de conceptos y métodos de pago.
- Política de folios físicos y correcciones.
- Reglas de reapertura y snapshots históricos.
