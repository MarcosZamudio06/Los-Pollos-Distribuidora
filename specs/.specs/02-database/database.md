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

`Role` representa un perfil de acceso y no es una autorización ejecutable por sí mismo. Sus permisos se asignan mediante `RolePermission`.

`Role.version` se incrementa en cada cambio administrativo de permisos y permite rechazar escrituras concurrentes obsoletas.

### Permission

Campos:

- id
- key
- description
- createdAt
- updatedAt

`key` es único y describe una capacidad atómica con formato `resource.action`, por ejemplo `payments.cancel` o `daily_closes.reopen`.

### RolePermission

Campos:

- roleId
- permissionId
- createdAt

Relaciones:

- Role N:M Permission mediante RolePermission.
- La combinación roleId + permissionId es única.

Los permisos financieros, fiscales, de costos y de administración de acceso deben asignarse de forma explícita. La auditoría de cambios de acceso no puede eliminarse ni modificarse.

### AccessControlAuditLog

Registra cambios de perfiles, reasignaciones y revocaciones de sesión.

Campos:

- actorUserId
- action
- targetType
- targetId
- before
- after
- reason
- affectedUserCount
- revokedSessionCount
- requestId
- ipAddress
- createdAt

El registro es append-only mediante restricciones de base de datos. Nunca almacena tokens, hashes, contraseñas ni payloads HTTP completos.

### OperationalLocation

Representa una ubicación operativa donde se controla inventario. `DISTRIBUTION_CENTER` representa un CEDIS raíz y `BRANCH` representa una sucursal directa de ese CEDIS.

Campos:

- id
- name
- code
- type
- parentId
- address
- latitude
- longitude
- isActive
- createdAt
- updatedAt

Relaciones requeridas:

- OperationalLocation tiene una autorrelación padre/hijas mediante `parentId`.
- OperationalLocation tiene muchos InventoryBalance.
- OperationalLocation tiene muchos Sale como ubicación de descuento.
- OperationalLocation tiene muchos Purchase como ubicación receptora.
- OperationalLocation tiene muchos InventoryMovement.
- OperationalLocation tiene muchos InventoryTransfer como origen.
- OperationalLocation tiene muchos InventoryTransfer como destino.

Tipos sugeridos:

- BRANCH
- WAREHOUSE
- DISTRIBUTION_CENTER
- MIXED
- EXTERNAL_POINT_OF_SALE
- ROUTE_STOCK

Notas:

- `DISTRIBUTION_CENTER` tiene `parentId` nulo.
- `BRANCH` requiere un padre activo de tipo `DISTRIBUTION_CENTER`.
- La relación padre no puede formar ciclos directos o transitivos. `ROUTE_STOCK` y `EXTERNAL_POINT_OF_SALE` conservan las relaciones operativas compatibles con su sucursal.
- `latitude` y `longitude` son nulas en conjunto o están dentro de sus rangos geográficos; la base de datos aplica ambos checks.
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
- reservedQuantityKg
- reservedQuantityPieces
- minQuantityKg
- minQuantityPieces
- createdAt
- updatedAt

Reglas:

- Debe existir una combinación única de `productId` y `locationId`.
- `quantityKg` y `quantityPieces` no deben ser negativos.
- `reservedQuantityKg` y `reservedQuantityPieces` representan mercancía comprometida por transferencias pendientes y deben iniciar en cero para datos nuevos.
- `reservedQuantityKg` y `reservedQuantityPieces` no deben ser negativos.
- `reservedQuantityKg` no puede superar `quantityKg`; `reservedQuantityPieces` no puede superar `quantityPieces`.
- La disponibilidad se deriva sin persistir un segundo stock: `quantityKg - reservedQuantityKg` y `quantityPieces - reservedQuantityPieces`.
- Las reservas no representan una ubicación física adicional ni modifican la propiedad de red.
- Las ventas y ajustes negativos solo pueden descontar la disponibilidad no reservada.
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

Reglas:

- `saleNumber` es único y se genera desde una secuencia PostgreSQL atómica con formato `SALE-000001`.
- La secuencia se inicializa por encima del mayor `saleNumber` numérico existente para conservar importaciones históricas y no depende del conteo ni de eliminaciones.
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
- `CASH_SALE` requiere que la suma de pagos aplicados sea exactamente igual al total de la venta; el saldo pendiente no es válido para este tipo.
- Los pagos parciales solo pueden confirmarse como `CREDIT_SALE`, después de evaluar la política de crédito aplicable.
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
- printTemplateVersion
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
- `printTemplateVersion` identifica la plantilla con la que se emitió el documento. Una reimpresión usa exclusivamente los snapshots del `SaleDocument`, nunca datos actuales de cliente, producto, venta o precios.
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
- idempotencyKey
- idempotencyPayloadHash
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

Reglas de idempotencia:

- `idempotencyKey` es único cuando existe y `idempotencyPayloadHash` debe existir
  junto con la clave.
- Solo el comando `POST /api/inventory/adjustments` persiste estos campos; los
  movimientos históricos de otras operaciones conservan ambos valores nulos.
- El hash representa el payload canónico, incluyendo actor, ubicación, tipo,
  unidad, cantidades normalizadas, motivo y referencias opcionales.
- Un replay con clave y hash iguales es solo lectura; una colisión de clave con
  hash distinto es un conflicto de idempotencia.

Notas:

- `previousStock` y `newStock` son compatibles con un modelo simple, pero para el alcance revisado deben preferirse campos por kilo/pieza y ubicación.
- Toda merma, diferencia de peso, pérdida operativa, devolución o rechazo parcial debe quedar como movimiento con motivo obligatorio.
- Las referencias específicas (`saleId`, `purchaseId`, `transferId`, `routeSettlementId`) deben usarse cuando aplique para reforzar integridad; `referenceType` y `referenceId` solo deben complementar trazabilidad genérica.
- Una cantidad positiva por KG o PIECE debe coincidir con el delta entre el saldo anterior y posterior según la dirección del tipo. No se permiten movimientos físicos positivos con delta cero.
- La diferencia de tránsito de una recepción CEDIS no es un movimiento físico de la ubicación destino; su fuente de verdad es `BranchSupplyReceiptItem`.

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

- `DRAFT` no modifica inventario; `REQUESTED` no crea movimientos físicos, pero mantiene una reserva en el origen.
- `REQUESTED` e `IN_TRANSIT` mantienen una reserva por producto y dimensión en el origen sin crear movimientos físicos.
- `IN_TRANSIT` representa salida física en proceso, pero no confirma recepción final ni debe duplicar decrementos posteriores en venta.
- `CONFIRMED` genera movimientos `TRANSFER_OUT` en origen y `TRANSFER_IN` en destino en una sola transacción.
- `CONFIRMED` consume exactamente la reserva del origen; `CANCELLED` libera exactamente la reserva del origen.
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
- unitEquivalentId
- appliedEquivalentFactor
- roundingMode
- createdAt
- updatedAt

Reglas:

- No confirmar si la ubicación origen no tiene disponibilidad suficiente después de reservas existentes.
- Confirmar debe generar movimientos de salida y entrada trazables.
- `unitEquivalentId`, cuando exista, debe pertenecer al producto, estar activa y ser aplicable a la fecha de negocio.
- `appliedEquivalentFactor` y `roundingMode` conservan la equivalencia usada; son opcionales para transferencias sin conversión.

### BranchSupplyCycle

Coordina una jornada CEDIS-sucursal sin sustituir las fuentes de inventario ni el cierre diario.

Campos principales:

- id
- distributionCenterLocationId
- branchLocationId
- businessDate
- pointOfSaleDailyCloseId
- status
- version
- notes
- openedByUserId, openedAt
- reviewedByUserId, reviewedAt
- closedByUserId, closedAt
- cancelledByUserId, cancelledAt, cancellationReason
- reopenedByUserId, reopenedAt, reopeningReason
- totales físicos y monetarios derivados de la última proyección
- totales de costo, utilidad neta, efectivo, tarjeta, transferencia, gastos y movimientos de caja
- reconciledDailyCloseVersion, reconciledAt
- createdAt, updatedAt

Estados:

- OPEN
- READY_FOR_REVIEW
- CLOSED
- CANCELLED

Reglas:

- Debe existir como máximo un ciclo no cancelado por `branchLocationId + businessDate`.
- CEDIS y sucursal deben ser distintos, activos y respetar la jerarquía `DISTRIBUTION_CENTER` → `BRANCH` directa.
- `version` debe ser mayor o igual a 1 y soportar control optimista.
- Los totales son una proyección reconstruible; no autorizan movimientos ni sustituyen balances, movimientos o cierre diario.
- `pointOfSaleDailyCloseId`, cuando exista, debe coincidir con sucursal y fecha y ser único.
- Las relaciones usan `ON DELETE RESTRICT` para preservar historia.

### BranchSupplyCycleTransfer

Vincula una transferencia de inventario con un ciclo.

Campos:

- id
- branchSupplyCycleId
- inventoryTransferId
- role: SUPPLY o RETURN
- linkedByUserId
- linkedAt

Reglas:

- `inventoryTransferId` es único y no puede pertenecer a dos ciclos.
- `SUPPLY` exige CEDIS → sucursal; `RETURN` exige sucursal → CEDIS.
- La dirección debe protegerse en aplicación y base de datos.

### BranchSupplyReceipt

Representa la recepción física de un suministro CEDIS → sucursal. Conserva la
transferencia enviada, el actor, la nota, la clave idempotente y el resultado
inmutable por partida.

Campos:

- id
- inventoryTransferId
- branchSupplyCycleId
- receivedByUserId
- receivedAt
- notes
- idempotencyKey
- payloadHash
- createdAt
- updatedAt

Reglas:

- `inventoryTransferId` es único; solo existe una recepción por suministro.
- La recepción solo aplica a vínculos `SUPPLY` y ciclos no cerrados ni cancelados.
- La clave y el hash soportan reintentos seguros y conflictos por payload.
- La cantidad enviada nunca se actualiza; los detalles conservan enviado,
  recibido y diferencia por KG y PIECE.

### BranchSupplyReceiptItem

Detalle append-only de la recepción física por partida del traspaso.

Campos:

- id
- receiptId
- transferItemId
- productId
- productNameSnapshot
- unit
- sentKg, sentPieces
- receivedKg, receivedPieces
- differenceKg, differencePieces
- createdAt

Reglas:

- Cada partida del suministro aparece exactamente una vez.
- `difference = received - sent` y no se acepta como fuente de verdad desde el
  cliente.
- Kilos no negativos y piezas enteras no negativas.
- Las diferencias son variaciones de tránsito append-only y no se reflejan como
  movimientos `SHRINKAGE` o `IN` en la ubicación destino.

### BranchSupplyCycleItem

Snapshot append-only por producto y versión del ciclo. Conserva identidad y unidad del producto, equivalencia aplicada cuando exista, cantidades entregadas/devueltas y proyecciones derivadas necesarias para conciliación.

Reglas:

- La combinación `branchSupplyCycleId + cycleVersion + snapshotKey` es única.
- Cantidades, precios y costos no pueden ser negativos; las piezas operativas se derivan de cantidades enteras aunque el snapshot use decimal para agregación.
- Un factor de equivalencia aplicado debe ser mayor a cero y conservar vigencia, unidades y redondeo usados.
- No puede actualizarse ni eliminarse después de insertado.

### BranchSupplyCycleProductSnapshot

Snapshot append-only del primer suministro por producto y ciclo. Conserva precio,
costo, identidad del producto, unidad, equivalencia aplicada, transferencia
fuente y versión de ciclo de origen. No se recalcula cuando cambia el catálogo.

### BranchSupplyCycleSnapshot

Snapshot append-only de conciliación y transición. Conserva versión fuente,
tipo (`CLOSED` o `REOPENED`), payload serializado, hash, actor y fecha. El
snapshot `CLOSED` es obligatorio para cerrar el ciclo.

### BranchSupplyCycleEvent

Bitácora append-only de apertura, vínculo, refresh, cambio de estado, cancelación, cierre y reapertura.

Tipos:

- OPENED
- TRANSFER_LINKED
- TRANSFER_STATE_CHANGED
- ITEM_SNAPSHOT_CREATED
- READY_FOR_REVIEW
- CLOSED
- CANCELLED
- REOPENED

Campos principales:

- id
- branchSupplyCycleId
- type
- cycleVersion
- fromStatus, toStatus
- actorUserId
- reason
- payload
- idempotencyKey
- occurredAt, createdAt

Reglas:

- Cada mutación incrementa la versión y produce como máximo un evento para esa versión.
- `idempotencyKey` almacena una clave con namespace de operación/recurso; el payload conserva el hash canónico de la solicitud y referencias del resultado.
- Los eventos no pueden actualizarse ni eliminarse.

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
- `agingStatus` y `daysOverdue` se reconcilian al iniciar el backend, diariamente y dentro de los flujos de pago; la autorización de una venta debe recalcularlos desde `dueDate` y saldo, sin confiar en una proyección persistida potencialmente atrasada.
- `DUE_SOON` aplica durante los siete días calendario anteriores al vencimiento y hasta el propio día; `OVERDUE` inicia al día siguiente en la zona horaria operativa.

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
- cashTendered (opcional, solo efectivo físico recibido)
- changeGiven (opcional, calculado en servidor)
- paymentMethod
- bankName
- referenceNumber
- cardLastFour (cuando el método sea tarjeta o voucher)
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
- `cashTendered` solo se registra en pagos `CASH`; cuando existe es positivo, no menor que `amount` y `changeGiven` se calcula como `cashTendered - amount` con redondeo monetario.
- Los cobros recibidos por chofer deben poder asociarse a liquidación de ruta cuando aplique.
- Una segunda vuelta de cobranza debe poder conservarse con `collectionPass` y `collectedByUserId`.
- Debe conservar banco, referencia y documento aplicado para auditoría administrativa.
- Transferencias, depósitos y cheques requieren banco y referencia; tarjeta o voucher requieren autorización en `referenceNumber` y los últimos cuatro dígitos en `cardLastFour`.
- `Payment` es la única fuente monetaria del sistema para dinero recibido.
- Las agregaciones de venta, caja, cartera y reportes usan `Payment.amount`; el efectivo entregado y el cambio son evidencia del pago y no crean otro pago, reembolso o movimiento de caja.
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
- `overdueBlockingMode` admite únicamente `WARN_ONLY` y `BLOCK_NEW_CREDIT`; `null` significa que la mora se informa sin crear una regla automática adicional.
- `allowAdministrativeOverride` solo habilita excepciones explícitas de `ADMIN` para mora o límite, con actor y motivo auditables; nunca reactiva un `creditStatus` administrativo bloqueado o suspendido.

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
- type (`SALE_DELIVERY`, `BRANCH_RETURN` o `CEDIS_SUPPLY`)
- driverId
- vehicleId nullable para compatibilidad histórica
- status
- scheduledDate
- originLocationId
- routeStockLocationId
- inventoryTransferId opcional y único
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

- `SALE_DELIVERY` es el valor por defecto para conservar la semántica de las rutas comerciales existentes.
- `driverId` es la asignación canónica del conductor vigente en este repositorio; no se crea un segundo campo `assignedToId`.
- `vehicleId` permanece nullable para rutas históricas, pero es obligatorio por regla de negocio para `BRANCH_RETURN` y `CEDIS_SUPPLY`.
- `BRANCH_RETURN` y `CEDIS_SUPPLY` deben conservar el `inventoryTransferId` que identifica el traslado logístico origen de la ruta.
- `routeStockLocationId` es requerido para rutas con carga operativa.
- La relación recomendada es `DeliveryRoute 1:1 OperationalLocation` de tipo `ROUTE_STOCK`.
- Las ventas y devoluciones de ruta no deben operar sin `routeStockLocationId`.
- El origen y destino logísticos se resuelven mediante `InventoryTransfer.originLocationId` y `InventoryTransfer.destinationLocationId`; ambas referencias apuntan a `OperationalLocation`, que conserva también las coordenadas canónicas.

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
- storageKey
- mimeType
- sha256
- sizeBytes
- capturedAt
- receivedAt
- capturedByUserId
- metadata
- createdAt
- updatedAt

Tipos sugeridos:

- PHOTO
- SIGNATURE
- GEOLOCATION
- NOTE

Notas:

- Para marcar un pedido como `DELIVERED`, el backend debe encontrar al menos una evidencia `PHOTO` y una `GEOLOCATION` asociadas al pedido.
- Para `PHOTO`, el backend valida el data URL, el MIME declarado contra la firma binaria, el tamaño, las dimensiones y calcula `sha256`; la compresión del frontend no es una frontera de seguridad.
- `receivedAt`, `capturedByUserId` y los metadatos de integridad los determina el backend. Los campos pueden ser nulos en registros históricos cuyo origen no pueda reconstruirse; las nuevas capturas deben guardar el usuario autenticado.
- Las nuevas fotos se almacenan en Object Storage y `storageKey` es la referencia canónica. `mimeType`, `sha256`, `sizeBytes` y `metadata` quedan en PostgreSQL; `value` es nullable y solo conserva temporalmente el data URL de filas históricas pendientes de migración.
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
- OperationalLocation 1:N BranchSupplyCycle como CEDIS
- OperationalLocation 1:N BranchSupplyCycle como sucursal
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
- InventoryTransfer 1:1 BranchSupplyCycleTransfer opcional
- InventoryTransfer 1:1 BranchSupplyReceipt opcional
- BranchSupplyReceipt 1:N BranchSupplyReceiptItem
- Product 1:N InventoryTransferItem
- BranchSupplyCycle 1:N BranchSupplyCycleTransfer
- BranchSupplyCycle 1:N BranchSupplyCycleItem
- BranchSupplyCycle 1:N BranchSupplyCycleEvent
- BranchSupplyCycle 1:1 PointOfSaleDailyClose opcional
- Product 1:N BranchSupplyCycleItem
- ProductUnitEquivalent 1:N BranchSupplyCycleItem opcional
- AccountReceivable 1:N Payment opcional
- AccountReceivable 1:1 BillingRequest opcional
- BillingRequest 1:1 Sale opcional
- BillingRequest 1:1 AccountReceivable opcional
- DeliveryRoute 1:N Payment opcional
- RouteSettlement 1:N Payment opcional
- User 1:N DeliveryRoute como driver
- DeliveryRoute 1:N DeliveryOrder
- DeliveryRoute 1:1 OperationalLocation como `routeStockLocation`
- DeliveryRoute 0..1:1 InventoryTransfer como traslado logístico asociado
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
- `Sale` agrega `saleChannel`, `documentType`, `physicalFolio` y las referencias auditables `terminalId`, `cashShiftId`, `cashierUserId`, `businessDate`, `registeredAt` y `deviceId` para ventas de punto fijo.
- `Payment` agrega `operationalLocationId` y `cashShiftId` cuando el cobro se recibe en una ubicación fija. `accountReceivableId` permanece requerido para cobranza o saldo pendiente; el contado inmediato puede asociarse a `saleId` sin `AccountReceivable` artificial.
- Toda venta de punto fijo y todo pago en efectivo fijo requieren un turno abierto del cajero y dispositivo actuales. `pointOfSaleDailyCloseId` se deriva del turno para consolidación.
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
- lastValidationAttemptAt
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
- cashCountedTotal
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

- Solo existe un cierre no cancelado por `operationalLocationId` y `businessDate`; PostgreSQL lo garantiza con un índice único parcial para estados distintos de `CANCELLED`.
- El cierre consolida `CashShift[]` y no representa una terminal ni una sesión monetaria.
- No puede cerrarse mientras exista un `CashShift` abierto.
- Para el estado físico monetario, se excluyen turnos `CANCELLED` y se selecciona uno por `terminalId` con orden `openedAt DESC`, `createdAt DESC`, `id DESC`. Solo la posición seleccionada de cada terminal aporta fondo neto, esperado, conteo y diferencia consolidados.
- El esperado de la posición seleccionada usa únicamente sus pagos `APPLIED` en `CASH` y sus movimientos no iniciales de canal `CASH`: suma `CASH_IN` y resta `CASH_OUT`, `ADJUSTMENT` y `EXPENSE`.
- La presencia de filas `CashShift` deshabilita el cálculo heredado aunque todas estén `CANCELLED`; en ese caso el estado físico de terminales es cero. Un turno seleccionado `OPEN` aporta esperado, mantiene nulo el conteo consolidado y continúa como bloqueante.
- Los totales se recalculan en backend y se guardan como snapshot auditable al revisar y cerrar.
- Cerrar, cancelar o reabrir registra usuario, fecha, motivo y versión esperada.
- Las transiciones que afecten asociaciones, snapshots o ajustes relacionados se ejecutan en transacción.
- Una diferencia fuera de tolerancia no se oculta; genera advertencia o bloqueo según una política futura aún abierta.
- `cashCountedTotal` es nulo hasta que se captura el efectivo físico; al capturarlo, `cashDifferenceTotal` se persiste como `cashCountedTotal - netCashExpected`.
- `lastValidatedAt` y `validatedSourceVersion` solo se conservan tras una validación sin errores; `lastValidationAttemptAt` registra cualquier intento, incluido uno fallido.

### CashTerminal y CashShift

- `CashTerminal` requiere `operationalLocationId`, código único por ubicación, nombre, `deviceId` globalmente único y estado activo.
- `CashShift` requiere terminal, ubicación, cierre diario, cajero, fecha de negocio, estado, apertura y fondos iniciales.
- PostgreSQL impone un solo turno `OPEN` por terminal mediante índice único parcial.
- `CashShift` conserva conteo y diferencia independientes; ventas, pagos y movimientos monetarios referencian el turno.
- Abrir o cerrar un `CashShift` y registrar uno de sus movimientos invalida la validación y recalcula el `PointOfSaleDailyClose` asociado dentro de la misma transacción.
- Toda mutación que requiera un cierre editable y toda transición de estado adquieren el mismo bloqueo transaccional por `PointOfSaleDailyClose.id`; la mutación relee autorización, estado y versión dentro de la transacción y solo escribe si el padre continúa en `DRAFT`.
- El recálculo vuelve a leer el estado después de sincronizar operaciones y condiciona la actualización final por `id`, `DRAFT` y versión fuente. La validación aplica el mismo guard antes de persistir sus sellos.
- Reabrir un `CashShift` actualiza la misma fila e incrementa `version`; conserva terminal, ubicación, cierre diario, cajero, fecha, fondos, ventas, pagos y movimientos, y limpia `closedAt`, `closedByUserId`, `closeMode`, `closeReason`, `cashCountedTotal` y `cashDifferenceTotal`. No crea otra fila ni movimientos `isOpening`.
- La reapertura solo admite `CLOSED`, requiere el cierre diario padre en `DRAFT`, el cajero propietario y coincidencia exacta con el `deviceId` activo registrado; también rechaza la operación si la terminal ya tiene otro turno `OPEN`. La contraseña se verifica con bcrypt mediante `AuthService` usando el `user.id` del principal autenticado; el DTO no recibe ni controla el usuario a verificar. Un intento correcto registra el evento de estado y dispara invalidación y recálculo del cierre.
- `CashShift.closeMode` distingue `CASHIER` de `ADMINISTRATIVE`; `closeReason` es obligatorio para el modo administrativo.
- Un cierre administrativo puede omitir el `deviceId` original únicamente con el permiso crítico `cash_shifts.administrative_close`; conserva actor, fecha, conteo, diferencia y evento auditable.
- `CashTerminalActivation` conserva `operationalLocationId`, `requestedByUserId`, `deviceId`, `codeHash` único, vencimiento, consumo y actor administrativo. El código en claro nunca se persiste.
- Solo una activación vigente y no consumida puede vincular una terminal cuyo `deviceId` todavía inicia con `legacy:`; terminal, activación y ubicación deben coincidir dentro de una transacción.

### DailyCloseInventoryCount

Captura física auditable por producto dentro de un cierre. No sustituye ni modifica `InventoryMovement` o `InventoryBalance`.

Campos:

- id
- pointOfSaleDailyCloseId
- productId
- physicalQuantityKg
- physicalQuantityPieces
- reason
- countedByUserId
- createdAt
- updatedAt

Reglas:

- Solo existe un conteo por producto y cierre.
- Solo se crea, actualiza o elimina mientras el cierre está en `DRAFT` y el actor tiene acceso a la ubicación.
- La existencia inicial, entradas, ventas del sistema, otras salidas, existencia teórica, sobrante y faltante se calculan en backend; no se reciben del cliente ni se persisten como ajuste de inventario.
- La diferencia física se muestra sin compensación automática y requiere un flujo de ajuste autorizado independiente si debe afectar stock.

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
- isOpening
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
- `isOpening=true` identifica el depósito o retiro inicial creado junto con la apertura de la sesión; el fondo inicial permanece en `PointOfSaleDailyClose.initialCashFund`.
- El flujo anidado del MVP no requiere una asociación posterior mediante `cashMovementIds`; el movimiento nace vinculado al cierre.
- `movementChannel` clasifica el medio operativo de la entrada/salida de caja (`CASH`, `CARD_VOUCHER`, `TRANSFER`, `DEPOSIT`, `OTHER`) sin sustituir el `paymentMethod` de `Payment`.
- Un `CashMovement` no sustituye a `Payment`, no registra cobranza por sí mismo y no permite pagos sin `accountReceivableId` cuando el flujo sea de cobranza.

### ScaleTicketReference

Campos:

- id
- operationalLocationId
- pointOfSaleDailyCloseId
- saleId
- saleDocumentId
- physicalFolio
- productId
- weightKg
- grossWeightKg
- tareWeightKg
- netWeightKg
- pieceCount
- unitPrice
- amount
- scaleDeviceId
- captureSource (`MANUAL` o `HARDWARE`)
- capturedByUserId
- capturedAt
- notes
- createdAt
- updatedAt

Reglas:

- La captura del MVP usa `captureSource=MANUAL`; el valor `HARDWARE` queda reservado para trazabilidad futura y no habilita integración automática con báscula.
- No confirma venta, no genera movimiento de inventario y no es comprobante fiscal.
- `physicalFolio` debe ser único por ubicación y fecha de negocio, salvo corrección auditada.
- Si se asocia una venta, `saleId` y `saleDocumentId` deben corresponder a la misma venta, ubicación y documento `SCALE_TICKET`.

### Relaciones adicionales

- OperationalLocation 1:N PointOfSaleDailyClose
- OperationalLocation 1:N CashMovement
- OperationalLocation 1:N ScaleTicketReference
- PointOfSaleDailyClose 1:N PointOfSaleDailyCloseLine
- PointOfSaleDailyClose 1:N DailyCloseInventoryCount
- PointOfSaleDailyClose 1:N CashMovement
- PointOfSaleDailyClose 1:N ScaleTicketReference
- PointOfSaleDailyClose 1:N Sale mediante asociación opcional
- PointOfSaleDailyClose 1:N Payment mediante ubicación y asociación de cierre
- Sale 1:N ScaleTicketReference opcional
- SaleDocument 1:N ScaleTicketReference opcional
- Product 1:N PointOfSaleDailyCloseLine opcional
- Product 1:N DailyCloseInventoryCount
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

## Extensión post-MVP: persistencia de facturas externas

Esta extensión permite persistir `LegalEntity`, `Invoice`, `BillingRequestSaleDocument`, `InvoiceSaleDocument` e `InvoiceSaleItemApplication` para conciliación. No crea tablas ni servicios de certificados, XML, timbrado, PAC o integración SAT.

- `Sale.currencyCode` inicia en `MXN` para legacy y `Sale.legalEntityId` se resuelve mediante conciliación explícita de ubicación–emisor.
- `SaleDocument` debe existir para el `Sale.documentType`; `INTERNAL_RECEIPT` puede coexistir como documento adicional.
- `BillingRequest.saleId` y `AccountReceivable.billingRequestId` dejan de ser relaciones autoritativas y pierden unicidad después de expandir, conciliar y validar las relaciones N:M.
- Las aplicaciones monetarias usan `Decimal(14,2)`, actor, timestamps y reversión lógica.
- La suma activa solicitada o aplicada no puede exceder el saldo del documento; se protege en servicio y con restricción o trigger PostgreSQL.
- Los índices cubren emisor, moneda, documento, estado, fecha, cliente, ubicación, vendedor, ruta, solicitud, factura, UUID y tablas puente.
- La migración sigue expand–backfill–validate–contract. Datos ambiguos se exportan para remediación y nunca se infieren automáticamente.
- `PaymentAllocation` permanece fuera del modelo activo.
- `SaleItem` y `SaleDocument` incorporan `version` para escrituras optimistas de remediación.
- `BillingDataRemediation` incorpora `version`, `resolutionIdempotencyKey` único y `resolutionPayloadHash`; una resolución condiciona la escritura por versión y conserva la clave para replay seguro.
- Una migración de backfill crea o reabre `INVALID_SALE_TOTAL` cuando cualquier partida incumple su ecuación o base gravable, o cuando las sumas de partidas no coinciden con subtotal, descuento, impuesto, base gravable y total de la venta.

La estructura e invariantes están en `specs/modules/billing-reportable-notes/spec.md`.
