# Entidades y Reglas de Validación

## Product

Validaciones:

- `name` requerido.
- `salePrice` mayor a 0.
- `purchaseCost` mayor o igual a 0.
- `minStock` mayor o igual a 0.
- `presentationType` requerido.
- `unit` requerido.
- `presentationType` debe permitir `KG`, `WHOLE` o `CUT`.
- `unit` debe permitir kilo, pieza o ambas unidades.
- `presentationType` y `unit` son independientes: el primero clasifica el catálogo semántico y el segundo la captura operativa.
- El perfil fiscal opcional agrega `satProductServiceCode`, `satUnitCode`, `taxObjectCode`, `defaultTaxCode`, `defaultFactorType` y `defaultRateOrQuota` sin sustituir `unit`.
- `satUnitCode` no se deriva de `KG`, `PIECE` o `KG_AND_PIECE`; tampoco se asigna `satProductServiceCode` a productos históricos por heurística.
- Un perfil vacío o incompleto no bloquea catálogo, compras o ventas comerciales. Su respuesta deriva `fiscalProfileStatus=INCOMPLETE`, `fiscalProfileMissingFields` y `fiscalProfileValidationCode=CFDI_PRODUCT_PROFILE_INCOMPLETE` para bloquear CFDI futuro.
- Cambiar el perfil fiscal solo actualiza `Product`; nunca reescribe `SaleItem`, `PurchaseItem`, movimientos ni snapshots históricos.
- La equivalencia kilo-pieza solo debe usarse cuando exista regla oficial aprobada por negocio.
- Si el producto usa equivalencias kilo-pieza, debe existir relación con `ProductUnitEquivalent` aprobada o una decisión explícita de negocio que autorice el campo operativo equivalente.

Presentaciones semánticas sugeridas:

- KG
- WHOLE
- CUT

Unidades operativas sugeridas:

- KG
- PIECE
- KG_AND_PIECE

Notas:

- El stock operativo debe manejarse por ubicación mediante saldos de inventario, no como un único stock global del producto.
- La política exacta de redondeo queda pendiente de decisión de negocio.

## ProductUnitEquivalent

Validaciones:

- `productId` requerido.
- `unitFrom` requerido.
- `unitTo` requerido.
- `factor` mayor a 0.
- `status` requerido.
- `effectiveFrom` requerido para equivalencias activas.
- Solo debe existir una equivalencia activa por producto, par de unidades y periodo de vigencia.
- No debe modificarse una equivalencia ya aplicada históricamente sin preservar trazabilidad.

Nota:

- La decisión de negocio sobre quién puede aprobar o modificar equivalencias sigue abierta y bloquea permisos finales.

## OperationalLocation

Validaciones:

- `name` requerido.
- `type` requerido.
- `code` único si existe.
- `DISTRIBUTION_CENTER` requiere `parentId=null`; `BRANCH` requiere un `parentId` activo de tipo `DISTRIBUTION_CENTER`.
- El árbol de `parentId` no permite ciclos, incluidos los transitivos.
- `latitude` y `longitude` son opcionales como par y deben estar en los rangos geográficos válidos.
- Debe poder relacionarse con ventas, compras, inventario, movimientos, traspasos y configuración operativa por ubicación cuando aplique.

Tipos sugeridos:

- `BRANCH`.
- `WAREHOUSE`.
- `DISTRIBUTION_CENTER`.
- `MIXED`.
- `EXTERNAL_POINT_OF_SALE`.
- `ROUTE_STOCK`.

Notas:

- Esta entidad representa la abstracción temporal de ubicación operativa.
- Un CEDIS no se infiere por nombre ni por un tipo legado: es `DISTRIBUTION_CENTER`; sus sucursales directas son `BRANCH` con `parentId` igual al CEDIS.
- La existencia de ubicación operativa para inventario es estructural y no configurable.
- `ROUTE_STOCK` solo debe existir asociado a una `DeliveryRoute`.
- `EXTERNAL_POINT_OF_SALE` reemplaza el alias documental `EXTERNAL_POINT`.

## InventoryBalance

Validaciones:

- `productId` requerido.
- `locationId` requerido.
- La combinación `productId` + `locationId` debe ser única.
- `quantityKg` mayor o igual a 0 cuando aplique.
- `quantityPieces` mayor o igual a 0 cuando aplique.
- `reservedQuantityKg` y `reservedQuantityPieces` representan reservas de transferencias pendientes.
- `reservedQuantityKg` y `reservedQuantityPieces` deben ser mayores o iguales a 0.
- Cada cantidad reservada debe ser menor o igual a su cantidad física correspondiente.
- La disponibilidad se deriva como cantidad física menos cantidad reservada; no existe una ubicación virtual de reserva.
- `quantityPieces` debe ser entero salvo regla explícita posterior.
- No convertir entre kilo y pieza sin equivalencia oficial aprobada.
- No debe existir más de un saldo por producto y ubicación.

## Sale

Validaciones:

- Debe tener al menos un item.
- `paymentType` requerido para distinguir solo `CASH_SALE` vs `CREDIT_SALE`.
- `locationId` requerido para definir ubicación operativa de descuento.
- `saleChannel` requerido para distinguir mostrador, punto externo, ruta, institucional y mayoreo.
- `documentType` requerido para distinguir nota sencilla, nota grande y ticket interno.
- `physicalFolio` obligatorio cuando el documento físico lo exija.
- `total` mayor o igual a 0.
- `discount` mayor o igual a 0.
- No confirmar si algún producto no tiene stock suficiente.
- No modificar una venta cancelada.
- No confirmar venta a crédito si el cliente no tiene crédito autorizado, está bloqueado o excede límite, salvo autorización administrativa explícita.
- El almacén o ubicación exacta de descuento queda sujeto a decisión de negocio; la venta debe conservar la ubicación usada.
- Si la venta usa política comercial, debe conservar la política aplicada para auditoría.
- Si la venta deja saldo pendiente, debe generar `AccountReceivable`.
- Debe conservar `deliveredByUserId`, `collectedByUserId`, `routeId` y `requiresAdministrativeInvoice` cuando el flujo lo requiera.
- `Payment` es la única fuente monetaria de dinero recibido.
- Venta de contado completamente pagada no requiere `AccountReceivable`.
- `CASH_SALE` debe tener pagos aplicados por el total exacto de la venta; no puede conservar saldo pendiente.
- Los pagos parciales requieren `paymentType=CREDIT_SALE` y la evaluación de crédito correspondiente.
- Venta a crédito sin pago inicial genera `AccountReceivable` por el total.
- Venta a crédito con abono inicial genera `Payment` por el abono y `AccountReceivable` por el saldo.
- Contraentrega no es dinero recibido hasta registrar `Payment`.
- `version` se incrementa en toda corrección de remediación y permite condicionar la escritura al snapshot leído.

## SaleItem

Validaciones:

- `saleId` requerido.
- `productId` requerido.
- Debe registrar cantidad en la unidad capturada.
- `quantityKg` debe ser mayor a 0 cuando se venda por kilo.
- `quantityPieces` debe ser mayor a 0 y entero cuando se venda por pieza.
- `unitPrice` mayor a 0.
- `subtotal` mayor o igual a 0.
- No aceptar precios calculados por frontend como fuente de verdad.
- La política exacta de redondeo queda pendiente de decisión de negocio.
- Si se aplica equivalencia kilo-pieza, debe registrar `unitEquivalentId` o el factor aplicado para preservar el cálculo histórico.
- `version` se incrementa en toda corrección monetaria de la partida.

## SaleDocument

Validaciones:

- `saleId` requerido.
- `documentType` requerido.
- `operationalLocationId` requerido cuando el documento tenga folio físico.
- `physicalFolio` requerido cuando aplique.
- `status` requerido.
- Debe conservar `customerSnapshot`, `productSnapshot`, `priceSnapshot` y cantidades capturadas para trazabilidad histórica.
- `customerSnapshot` conserva `name`, `commercialName`, `customerNumber`, `address`, `phone`, `taxId` y `paymentTermsDays`.
- Cada partida de `productSnapshot.items` conserva `name`, `sku`, `unit`, `quantityKg`, `quantityPieces`, `unitPrice` y `subtotal`.
- `priceSnapshot` conserva `subtotal`, `discount`, `tax`, `total`, `paid` y `outstanding`; para crédito conserva también la fecha de vencimiento emitida.
- La reimpresión identifica la plantilla mediante `printTemplateVersion` y no puede completar snapshots desde registros actuales.
- Debe distinguir nota sencilla, nota grande y ticket/comprobante interno.
- `version` se incrementa al cancelar lógicamente un documento durante una remediación.

Estados sugeridos:

- `DRAFT`.
- `ISSUED`.
- `COLLECTED`.
- `CANCELLED`.

## Purchase

Validaciones:

- Debe tener proveedor.
- Debe tener al menos un item.
- `locationId` requerido para definir ubicación operativa que recibe stock.
- Cada item debe tener cantidad mayor a 0.
- Cada item debe tener costo mayor o igual a 0.
- Confirmar compra debe generar movimientos de inventario asociados a la ubicación receptora.

## InventoryTransfer

Validaciones:

- `originLocationId` requerido.
- `destinationLocationId` requerido.
- Origen y destino no deben ser iguales.
- Debe tener al menos un item.
- `REQUESTED` e `IN_TRANSIT` reservan disponibilidad en el origen sin crear movimientos físicos.
- No confirmar si la ubicación origen no tiene disponibilidad suficiente.
- `CONFIRMED` consume la reserva y crea los movimientos físicos atómicamente.
- `CANCELLED` libera la reserva sin crear movimientos físicos.
- `DRAFT` y `REQUESTED` no generan movimientos.
- `IN_TRANSIT` no debe generar un segundo descuento cuando la salida ya quedó representada por confirmación posterior.
- `CONFIRMED` debe generar movimientos de salida y entrada trazables en una sola transacción.
- Un traspaso hacia ruta debe usar `destinationLocationId` de tipo `ROUTE_STOCK`.
- Un traspaso de devolución desde ruta debe usar `originLocationId` de tipo `ROUTE_STOCK`.
- Debe registrar responsable y fechas operativas de solicitud, confirmación o cancelación cuando aplique.
- Debe conservar `cancelledByUserId` y `cancellationReason` cuando se cancele.
- Crear, confirmar y cancelar deben soportar idempotencia para no duplicar traspasos ni movimientos.

## InventoryTransferItem

Validaciones:

- `transferId` requerido.
- `productId` requerido.
- Debe registrar cantidad en kilo, pieza o ambas según producto.
- `quantityPieces` debe ser entero cuando aplique.
- `unitEquivalentId` es opcional y solo puede referenciar una equivalencia activa aplicable al producto y fecha de negocio.
- `appliedEquivalentFactor` y `roundingMode` conservan la equivalencia aplicada sin sobrescribir su historial.

## BranchSupplyCycle

Validaciones:

- `distributionCenterLocationId`, `branchLocationId`, `businessDate` y `openedByUserId` requeridos.
- Solo un ciclo no cancelado por sucursal y fecha.
- CEDIS activo `DISTRIBUTION_CENTER`; sucursal activa `BRANCH` hija directa del CEDIS.
- CEDIS y sucursal distintos; `version >= 1`.
- `CLOSED` y `CANCELLED` no admiten suministros, devoluciones ni refresh.
- Cancelar requiere actor, fecha y motivo, sin cierre activo ni transferencias no canceladas.
- Los totales del ciclo son snapshots derivados y no pueden usarse para modificar inventario.
- `expectedCostTotal`, `actualCostTotal`, `actualNetProfitTotal` y los totales de caja se reconstruyen desde las fuentes operativas.
- `reconciledDailyCloseVersion` identifica la versión del cierre diario usada por la última conciliación.

## BranchSupplyCycleProductSnapshot

Snapshot append-only de precio, costo, unidad y equivalencia creado en el primer
suministro de cada producto dentro del ciclo. La combinación
`branchSupplyCycleId + productId` es única. Cambios posteriores en `Product` no
modifican este registro.

## BranchSupplyCycleSnapshot

Snapshot append-only de una transición de conciliación del ciclo. Conserva
`sourceVersion`, `snapshotType`, payload, hash, actor y fecha. Un snapshot
`CLOSED` se crea dentro de la transacción de cierre; una reapertura conserva el
historial y puede registrar un snapshot `REOPENED`.

## BranchSupplyCycleTransfer

Validaciones:

- `branchSupplyCycleId`, `inventoryTransferId`, `role` y `linkedByUserId` requeridos.
- `inventoryTransferId` único.
- `SUPPLY` requiere CEDIS como origen y sucursal como destino.
- `RETURN` requiere sucursal como origen y CEDIS como destino.
- Transferencias confirmadas o canceladas permanecen vinculadas como historial.

## BranchSupplyReceipt

Validaciones:

- `inventoryTransferId` único y debe referenciar una transferencia vinculada con
  rol `SUPPLY`.
- `branchSupplyCycleId`, actor, fecha, clave de idempotencia y hash del payload
  requeridos.
- Una recepción es append-only y solo puede existir una por suministro.
- La recepción conserva nota, cantidades enviadas, recibidas y diferencias por
  KG y PIECE.

## BranchSupplyReceiptItem

Validaciones:

- Cada `transferItemId` del suministro aparece exactamente una vez.
- Cantidades recibidas no negativas; piezas enteras; unidad compatible con el
  producto.
- `difference = received - sent` por dimensión y no puede ser recalculada desde
  un valor enviado por el cliente.
- No se actualiza ni elimina después de persistirse.
- Es la fuente de verdad de faltantes y sobrantes de tránsito; estas diferencias
  no crean movimientos físicos adicionales en la ubicación destino.

## BranchSupplyCycleItem

Validaciones:

- `branchSupplyCycleId`, `cycleVersion`, `snapshotKey`, `productId`, nombre, unidad, precio y costo snapshot requeridos.
- Cantidades físicas y valores de referencia no negativos.
- `appliedEquivalentFactorSnapshot > 0` cuando exista.
- No convertir kilo/pieza sin equivalencia oficial aplicable y política de redondeo aprobada.
- Append-only por ciclo, versión y clave de snapshot.

## BranchSupplyCycleEvent

Validaciones:

- Ciclo, tipo, versión, actor y payload requeridos.
- Una mutación por versión y clave idempotente con namespace de operación/recurso.
- Reintento con misma clave y payload devuelve el resultado original; payload distinto produce conflicto.
- Append-only; no permite actualización ni eliminación.

## Customer

Validaciones:

- `name` requerido.
- `email` debe ser válido si existe.
- `phone` debe ser único si se usa como identificador comercial.
- `customerType` requerido para distinguir cliente minorista, mayorista e institucional.
- Si el cliente tiene crédito, debe definir límite de crédito, días de crédito y estado de crédito.
- Un cliente marcado con `requiresBilling=true` debe conservar `fiscalName`, `taxId`, `fiscalPostalCode`, `fiscalRegime`, `fiscalUseCode` y `billingEmail` completos.
- `fiscalAddress` permanece opcional en la regla vigente; dirección comercial y dirección de entrega son datos distintos.
- Los datos fiscales permanecen opcionales para clientes con `requiresBilling=false` y no implican emisión CFDI.
- Puede relacionarse con una `CommercialPolicy` para heredar condiciones comerciales administrables.
- Las condiciones de crédito específicas del cliente deben prevalecer sobre políticas globales solo si negocio lo autoriza.

Tipos sugeridos:

- `RETAIL`.
- `WHOLESALE`.
- `INSTITUTIONAL`.

## AccountReceivable

Validaciones:

- `customerId` requerido.
- `saleId` requerido.
- `originalSaleId` requerido cuando la cuenta nazca desde una venta.
- `originalAmount` mayor a 0.
- `outstandingAmount` mayor o igual a 0.
- `dueDate` requerido.
- `paymentTermsDays` requerido.
- `status` requerido.
- Toda venta con saldo pendiente debe generar una cuenta por cobrar.
- Una cuenta pagada debe tener saldo pendiente igual a 0.
- Una cuenta vencida debe poder identificarse por fecha de vencimiento, días de crédito o días de atraso.
- Debe conservar la política comercial o condiciones de crédito aplicadas al momento de creación.
- Debe relacionarse con pagos mediante `Payment`.
- Debe conservar `physicalDocumentFolio`, `agingStatus`, `collectorUserId`, `lastPaymentDate` y `daysOverdue` cuando el flujo operativo lo requiera.
- Puede relacionarse con una solicitud administrativa de factura cuando exista.

Estados sugeridos de cobranza:

- `UNPAID`.
- `PARTIALLY_PAID`.
- `PAID`.
- `CANCELLED`.

Estados sugeridos de envejecimiento:

- `CURRENT`.
- `DUE_SOON`.
- `OVERDUE`.

## Payment

Validaciones:

- `accountReceivableId` requerido para pagos de cobranza o cualquier pago que liquide saldo pendiente.
- `saleId` requerido cuando el pago representa contado inmediato o abono inicial sin `AccountReceivable` artificial.
- `customerId` no es obligatorio universalmente. En cobranza debe corresponder al cliente de `AccountReceivable` y puede derivarse de esa relación; en contado inmediato puede derivarse de `Sale.customerId` cuando la venta tenga cliente registrado y puede ser nulo para público general.
- Si `customerId` se persiste en `Payment`, debe coincidir con el cliente de la cuenta por cobrar o venta asociada; nunca debe obligar a crear un cliente ni una `AccountReceivable` artificial para contado inmediato.
- `userId` requerido.
- `amount` mayor a 0.
- `paymentMethod` requerido.
- `cashTendered` es evidencia opcional del efectivo físico recibido y solo es válido cuando `paymentMethod=CASH`; si existe debe ser positivo y no menor que `amount`.
- `changeGiven` se calcula en servidor como `cashTendered - amount` redondeado a moneda y se conserva en el mismo `Payment`; no es una segunda fuente monetaria ni un pago adicional.
- Cada pago de cobranza del MVP debe aplicarse exactamente a una cuenta por cobrar mediante `Payment.accountReceivableId`.
- Una venta de contado completamente pagada no debe crear una cuenta por cobrar artificial solo para registrar el pago.
- El pago no debe exceder el saldo pendiente salvo regla futura para anticipos o saldos a favor.
- Debe registrar fecha de pago.
- Debe conservar `bankName` y `referenceNumber` cuando la forma de pago lo requiera.
- Debe poder indicar el documento aplicado (`appliedDocumentId` o relación equivalente) sin usar `PaymentAllocation`.
- Si el pago lo registra un chofer en ruta, debe poder relacionarse con la ruta o liquidación correspondiente.
- Debe poder indicar `collectedByUserId` y `collectionPass` cuando exista segunda vuelta de cobranza.
- Debe conservar estado para permitir cancelación o aplicación controlada sin eliminar historial.
- Es la única fuente monetaria válida para efectivo, transferencia, depósito, tarjeta, voucher u otros cobros.
- Los totales, caja, cartera, reportes y movimientos derivados de pagos usan exclusivamente `Payment.amount`; `cashTendered` y `changeGiven` no se agregan ni generan `CashMovement` o reembolso separados.

Estados sugeridos:

- `REGISTERED`.
- `APPLIED`.
- `CANCELLED`.

`REGISTERED` representa un pago pendiente de aplicación y no integra ingresos de caja. `APPLIED` representa dinero recibido y es el único estado que integra los totales monetarios del cierre POS.

Nota post-MVP:

- `PaymentAllocation` queda fuera del MVP. Solo podrá agregarse para pagos agrupados o distribuidos entre varias cuentas por cobrar mediante actualización explícita de specs, modelo de datos, validaciones y flujos relacionados.

## BillingRequest

Validaciones:

- `customerId` requerido.
- `saleId` requerido.
- `status` requerido.
- Debe conservar la relación administrativa entre cliente y venta, sin convertirse en `SaleDocument`.
- Puede relacionarse con `AccountReceivable` cuando exista crédito o saldo pendiente.
- No debe incluir campos o flujos de CFDI, SAT, PAC, UUID fiscal o timbrado.
- La cancelación no debe modificar inventario ni ocultar historial de venta o cobranza.

Estados sugeridos:

- `REQUESTED`.
- `IN_REVIEW`.
- `APPROVED`.
- `REJECTED`.
- `CANCELLED`.

## CommercialPolicy

Validaciones:

- `name` requerido.
- `defaultCreditLimit` mayor o igual a 0 cuando aplique.
- `defaultCreditDays` mayor o igual a 0 cuando aplique.
- `overdueBlockingMode` requerido si la política controla mora.
- `creditLimitBlockingMode` requerido si la política controla límite de crédito.
- `effectiveFrom` requerido para políticas activas.
- Debe registrar usuario creador y último modificador.

Nota:

- Configura parámetros comerciales; no puede desactivar la creación estructural de cuentas por cobrar para ventas a crédito.

## OperationalConfig

Validaciones:

- `key` requerido.
- `value` requerido.
- `valueType` requerido.
- `scope` requerido.
- `locationId` requerido cuando el alcance sea por ubicación.
- `effectiveFrom` requerido para configuraciones activas.
- Debe registrar usuario creador y último modificador.
- `REPORT_REFRESH_INTERVAL_SECONDS` debe ser menor o igual a 60.
- `DEFAULT_SALE_STOCK_LOCATION_STRATEGY` no elimina la obligación de guardar `locationId` en ventas.

Parámetros candidatos:

- `ROUNDING_MODE`.
- `SHRINKAGE_TOLERANCE`.
- `DEFAULT_SALE_STOCK_LOCATION_STRATEGY`.
- `REPORT_REFRESH_INTERVAL_SECONDS`.
- `REQUIRED_DELIVERY_EVIDENCE`.
- `DRIVER_OFFLINE_POLICY`.

Nota:

- `DRIVER_OFFLINE_POLICY` sigue bloqueado hasta que negocio defina si la experiencia móvil debe operar sin conexión.

## User

Validaciones:

- `name` requerido.
- `email` requerido y único.
- `password` requerido al crear.
- `roleId` requerido.
- `operationalLocationId` requerido como ubicación principal.
- Cualquier rol puede usar un CEDIS activo de tipo `DISTRIBUTION_CENTER` como
  ubicación principal.
- `cedisLocationId` opcional; si existe, debe referenciar un CEDIS activo de tipo
  `DISTRIBUTION_CENTER`.
- `passwordHash` nunca debe devolverse por API.

## InventoryMovement

Validaciones:

- `productId` requerido.
- `locationId` requerido.
- `type` requerido.
- `quantity` mayor a 0.
- `previousStock` mayor o igual a 0.
- `newStock` mayor o igual a 0.
- `reason` requerido en ajustes manuales.
- Debe registrar cantidades por kilo y/o pieza cuando aplique.
- No debe permitir stock negativo por ubicación.
- La merma, diferencia de peso, devolución o rechazo parcial requiere motivo obligatorio.
- Toda cantidad positiva debe coincidir con el delta entre saldos anterior y posterior según la dirección del tipo; un movimiento físico no puede tener delta cero.
- La variación entre lo enviado y lo recibido en un suministro CEDIS pertenece a `BranchSupplyReceiptItem` y no a `InventoryMovement`.
- Los ajustes manuales persisten `idempotencyKey` único y `idempotencyPayloadHash`; la pareja es nula para movimientos producidos por otros comandos.
- Un replay con hash igual no actualiza `InventoryBalance` ni crea otro movimiento; una clave reutilizada con hash diferente es `IDEMPOTENCY_CONFLICT`.

## DeliveryRoute

Validaciones:

- `type` distingue `SALE_DELIVERY`, `BRANCH_RETURN` y `CEDIS_SUPPLY`; las rutas históricas se interpretan como `SALE_DELIVERY` mediante el valor por defecto de persistencia.
- `driverId` requerido.
- `scheduledDate` requerido.
- `vehicleId` puede ser nulo en rutas históricas comerciales, pero es requerido para `BRANCH_RETURN` y `CEDIS_SUPPLY`.
- Las rutas `BRANCH_RETURN` y `CEDIS_SUPPLY` deben referenciar un único `InventoryTransfer` mediante `inventoryTransferId`; no se permite inferirlo desde notas o folios.
- `routeStockLocationId` requerido para rutas con carga de inventario.
- No completar ruta si existen pedidos pendientes.
- Solo el chofer asignado debe poder actualizar sus pedidos desde la experiencia móvil.
- La liquidación debe permitir comparar pedidos entregados, devoluciones, incidencias, cobros recibidos, transferencias/depositos y segunda vuelta de cobranza.
- Si la ruta sale de una ubicación operativa específica, debe conservar `originLocationId`.
- Debe existir relación 1:1 recomendada entre `DeliveryRoute` y `OperationalLocation(type=ROUTE_STOCK)`.
- El origen y destino del traslado logístico son los `OperationalLocation` del `InventoryTransfer` asociado; la ruta no duplica coordenadas ni crea ubicaciones alternativas.

## DeliveryOrder

Validaciones:

- `routeId` requerido.
- `saleId` requerido.
- `status` requerido.
- Al marcar como entregado debe registrar fecha y hora de entrega.
- Debe soportar estados de no entrega, devolución, rechazo parcial o incidencia.
- Si registra cobro en ruta, el monto debe relacionarse con cuenta por cobrar o liquidación según corresponda.
- Si el pedido tiene saldo a crédito, debe poder relacionarse con `AccountReceivable`.
- Debe conservar `deliveredByUserId`, `collectedByUserId` y `collectionPass` cuando aplique.
- Si la venta pertenece a canal `ROUTE`, debe descontar inventario desde la ubicación `ROUTE_STOCK` asociada a la ruta.
- No debe usar `collectedAmount` persistido como fuente monetaria; cualquier monto cobrado debe derivarse de `Payment`.

## DeliveryEvidence

Validaciones:

- `deliveryOrderId` requerido.
- `type` requerido.
- `capturedAt` requerido.
- Debe permitir foto, firma, geolocalización o nota.
- Para `PHOTO`, debe conservar `mimeType`, `sha256`, `sizeBytes`, dimensiones/origen en `metadata` y el `receivedAt` asignado por el backend.
- Toda captura nueva debe conservar `capturedByUserId`; los registros históricos pueden mantenerlo nulo cuando no exista actor confiable.
- Para marcar un pedido como `DELIVERED`, debe existir al menos una evidencia `PHOTO`; `GEOLOCATION`, `SIGNATURE` y `NOTE` son opcionales.
- El cliente puede comprimir la imagen, pero la aceptación final de formato, MIME, tamaño, dimensiones y ventana temporal de `capturedAt` corresponde al backend.

Nota:

- Si la experiencia móvil requiere offline, se deberá ampliar el modelo con campos de sincronización antes de implementar.

## RouteSettlement

Validaciones:

- `routeId` requerido.
- `driverId` requerido.
- `status` requerido.
- `version` requerido para cierre y reapertura versionados.
- `differenceAmount` debe reflejar diferencia entre monto esperado y cobrado cuando aplique.
- Debe distinguir efectivo, transferencia/deposito u otros métodos si el negocio permite cobros mixtos en ruta.
- Debe reflejar ventas pagadas en entrega, ventas a crédito, abonos, pendientes y crédito atrasado.
- Todo total cobrado debe derivarse de `Payment` asociados a la ruta o liquidación.
- Reabrir debe conservar actor, fecha, motivo e idempotencia auditable.

## Reportes operativos

Validaciones de datos:

- Los reportes deben basarse en operaciones confirmadas.
- Deben distinguir ventas de contado, ventas a crédito, cobros, saldos vencidos, stock por ubicación y pedidos por estado de reparto.
- Deben reflejar cambios con latencia máxima de 60 segundos en condiciones normales.
- No deben depender de cierres manuales para mostrar información operativa actual.

## Decisiones abiertas que bloquean implementación final

- Modelo final sucursal-almacén.
- Regla exacta de descuento de stock por venta.
- Equivalencias oficiales kilo-pieza por producto.
- Política exacta de redondeo.
- Tolerancias de merma, diferencia de peso, devolución y rechazo parcial.
- Requisito offline de choferes.
- Profundidad de preparación fiscal CFDI/SAT futura.
- Si las políticas comerciales se aplican por cliente, tipo de cliente, ubicación o combinación.
- Alcance exacto de configuración operativa por ubicación, global o por rol.

## Decisiones estructurales no configurables

- Inventario por ubicación operativa.
- Ubicación obligatoria en ventas, compras, movimientos y traspasos.
- Cuentas por cobrar como entidad obligatoria para ventas a crédito.
- Pagos como entidad trazable de dominio.
- Traspasos como entidad propia con origen, destino, detalle y estado.
- Soporte kilo/pieza y equivalencias persistidas para productos que lo requieran.
- Ticket interno como único comprobante del MVP; SAT/CFDI fuera de alcance.

## Extensión documental: puntos de venta externos

### OperationalLocation

Validaciones adicionales:

- Debe admitir `EXTERNAL_POINT_OF_SALE` y `ROUTE_STOCK` como tipos operativos documentados.
- Un punto externo debe estar activo para recibir traspasos, vender, registrar movimientos de caja o iniciar un cierre diario.
- Desactivar una ubicación debe impedir nuevas operaciones y validar que no existan cierres diarios abiertos.

### Sale

Campos y validaciones adicionales:

- `saleChannel` requerido para distinguir `COUNTER`, `EXTERNAL_POINT_OF_SALE`, `ROUTE`, `INSTITUTIONAL` y `WHOLESALE`.
- `documentType` requerido para distinguir `SCALE_TICKET`, `SIMPLE_NOTE`, `LARGE_NOTE` e `INTERNAL_RECEIPT`.
- `physicalFolio` opcional y requerido cuando la política del documento físico lo indique.
- `terminalId`, `cashShiftId`, `cashierUserId`, `businessDate`, `registeredAt` y `deviceId` se requieren para ventas de punto fijo y se derivan en backend desde el turno validado.
- `pointOfSaleDailyCloseId` se deriva del turno para consolidación de sucursal.
- La solicitud administrativa se modela con `billingRequestId` y `requiresAdministrativeInvoice`; no habilita CFDI, SAT, PAC ni timbrado.
- Una referencia de báscula nunca sustituye la confirmación de la venta ni su movimiento de inventario.

### Payment

Validaciones adicionales:

- `operationalLocationId` debe registrarse cuando el pago se recibe en un punto de venta fijo.
- `cashShiftId` es requerido para pagos en efectivo de una ubicación fija y deriva el cierre diario consolidado; los cobros en ruta permanecen bajo `RouteSettlement`.
- Todo pago de cobranza incluido en un cierre conserva `accountReceivableId` obligatorio y aplica a una sola cuenta por cobrar.
- Un pago inmediato de contado puede asociarse al cierre mediante `saleId` sin `AccountReceivable`.
- Los cobros en ruta conservan su relación con ruta o liquidación y no se incorporan automáticamente al cierre fijo.

## PointOfSaleDailyClose

Validaciones:

- `operationalLocationId` requerido y debe corresponder a una ubicación activa al crear el borrador.
- `businessDate` requerido.
- La combinación de ubicación y fecha es única para cierres no cancelados.
- El cierre consolida terminales y turnos; no contiene la identidad monetaria de una sola caja.
- No puede cerrarse con turnos abiertos.
- `status` requerido: `DRAFT`, `REVIEWED`, `CLOSED` o `CANCELLED`.
- `openedByUserId` requerido; `closedByUserId` requerido al cerrar.
- Totales de kilos y dinero deben ser mayores o iguales a cero, excepto campos explícitos de diferencia que pueden ser negativos o positivos.
- No cerrar si alguna operación asociada carece de ubicación o si la versión validada quedó obsoleta.
- Cerrar, cancelar o reabrir exige usuario, fecha, motivo y auditoría.
- No es un `RouteSettlement` ni puede conciliar una ruta por sustitución.

Campos mínimos:

- `id`, `operationalLocationId`, `businessDate`, `status`.
- `version`, `lastValidatedAt`, `validatedSourceVersion` para control de concurrencia y vigencia de la conciliación.
- `openedByUserId`, `reviewedByUserId`, `closedByUserId`, `cancelledByUserId`, `reopenedByUserId`.
- `cashShifts` relacionados para consolidar terminales, cajeros, fondos, conteos y diferencias.
- `totalInputKg`, `totalSoldKg`, `totalRemainingKg`, `totalShortageKg`, `totalSurplusKg`.
- `scaleReportedKg`, `scaleDifferenceKg`.
- `cashTotal`, `cardVoucherTotal`, `transferTotal`, `expenseTotal`, `grossSalesTotal`.
- `netCashExpected`, `cashCountedTotal`, `cashDifferenceTotal`.
- `purchaseCostTotal`, `grossProfitTotal`, `netProfitTotal`.
- `notes`, `reviewedAt`, `closedAt`, `cancelledAt`, `reopenedAt`, `reopenedReason`, `createdAt`, `updatedAt`.

## PointOfSaleDailyCloseLine

Validaciones:

- `pointOfSaleDailyCloseId` requerido.
- Debe clasificar la línea en `INPUT`, `OUTPUT`, `INCOME` o `PROFIT` y usar un concepto explícito.
- Puede asociar producto, venta, movimiento de inventario o referencia de báscula, sin duplicar esas entidades.
- Debe soportar entradas, ventas con nota, ventas con ticket/etiqueta, sobrantes, faltantes, otras salidas y conceptos autorizados.
- Kilos permiten decimales; piezas son enteras; importes siguen la política de redondeo pendiente.
- Las líneas de conciliación no modifican inventario por sí mismas.
- Solo `INPUT` y `OUTPUT` admiten captura manual.
- `INCOME` y `PROFIT` son snapshots derivados por el backend y no aceptan importes monetarios independientes.
- Los importes de pagos y cobranza en `INCOME` se derivan exclusivamente de `Payment`; `CashMovement` solo aporta entradas, salidas o ajustes operativos separados. `PROFIT` se deriva de operaciones asociadas y fórmulas aprobadas.

## DailyCloseInventoryCount

Validaciones:

- `pointOfSaleDailyCloseId`, `productId`, cantidades físicas, motivo y `countedByUserId` requeridos.
- Un producto solo puede tener un conteo por cierre.
- Kilos permiten decimales no negativos; piezas son enteras no negativas.
- Solo se modifica durante `DRAFT`, por `ADMIN` o `SELLER` autorizado para la ubicación.
- Es evidencia física de conciliación; no crea ni modifica movimientos o saldos de inventario.
- La conciliación calcula en backend existencia inicial, entradas, ventas, otras salidas, existencia teórica, sobrante y faltante.

## CashMovement

Validaciones:

- `operationalLocationId` requerido.
- `cashShiftId` es requerido para entradas, retiros, gastos y ajustes monetarios de terminal; `pointOfSaleDailyCloseId` se deriva para consolidación.
- `isOpening=true` identifica el depósito o retiro creado durante la apertura; no debe confundirse con un gasto posterior.
- El flujo anidado del MVP crea el movimiento ya asociado; no requiere `cashMovementIds` en el contrato de asociaciones.
- `type` requerido: `EXPENSE`, `CASH_IN`, `CASH_OUT` o `ADJUSTMENT`.
- `amount` mayor a cero.
- Gastos y ajustes requieren motivo, usuario y fecha operativa.
- `movementChannel` debe distinguir efectivo, boucher/tarjeta, transferencia, depósito u otro medio operativo autorizado.
- No clasifica el método de pago de una venta ni sustituye a `Payment`.
- No representa un pago a cuenta por cobrar; dichos pagos permanecen en `Payment`.

## ScaleTicketReference

Validaciones:

- Es una captura manual; no implica integración automática con hardware.
- `operationalLocationId`, `physicalFolio`, `capturedByUserId` y `capturedAt` requeridos.
- Puede asociarse a una venta y a un cierre diario, pero no reemplaza a ninguno.
- Cuando se asocia a una venta, conserva también su `SaleDocument` de tipo `SCALE_TICKET` para conciliación directa.
- Debe conservar producto, pesos bruto, tara y neto, piezas, precio e importe capturados cuando estén disponibles.
- La captura del MVP se identifica como `MANUAL`; `HARDWARE` es solo una procedencia reservada y no activa una integración de dispositivo.
- Un folio no debe duplicarse dentro de la misma ubicación y fecha de negocio, salvo corrección auditada.
- No genera movimientos de inventario ni CFDI.

## Decisiones abiertas del modelo de cierre

- Tolerancias de kilos e importes y su efecto en transiciones de estado.
- Fórmulas oficiales de costo y utilidad.
- Catálogo final de conceptos de línea y movimientos de caja.
- Política de reapertura y conservación de snapshots previos.

## Extensión post-MVP de notas facturables

### LegalEntity

- Emisor fiscal distinto de `OperationalLocation`.
- Conserva identidad legal y estado; su relación operativa se configura y audita explícitamente.
- Es la configuración fiscal autoritativa del emisor CFDI y propietaria lógica del CSD; `OperationalLocation` solo conserva ubicación operativa.
- Campos fiscales aditivos: `cfdiEnabled`, `fiscalPostalCode` (lugar de expedición), `fiscalRegime`, `defaultSeries`, `certificateSerialNumber`, `certificateFingerprint`, `certificateSubject`, `certificateValidFrom` y `certificateValidTo`.
- El perfil fiscal derivado expone `COMPLETE`/`INCOMPLETE`, campos faltantes y el código estable `CFDI_LEGAL_ENTITY_FISCAL_PROFILE_INCOMPLETE`. Un registro legado incompleto puede permanecer operativo cuando `cfdiEnabled=false`.
- `cfdiEnabled=true` solo es válido con RFC estructuralmente correcto, código postal mexicano de cinco dígitos, régimen SAT catalogado, serie válida y metadata de certificado completa con vigencia ordenada.
- Nunca almacena `.key`, contraseña de CSD, token PAC ni secretos equivalentes. La futura referencia a credenciales vive fuera de la entidad fiscal.
- Una venta facturable debe resolver exactamente `Sale -> LegalEntity -> configuración fiscal activa` a través de un mapeo vigente `LegalEntityOperationalLocation`; cero mapeos, mapeos solapados, entidad inactiva, CFDI deshabilitado, perfil incompleto o certificado fuera de vigencia bloquean la venta fiscal con código estable.

### Invoice

- Registro de una factura emitida externamente, con emisor, moneda, serie, folio, UUID opcional, importes `Decimal(14,2)`, estado, versión, cancelación y sustitución.
- Estados mínimos: `ACTIVE`, `CANCELLED`, `SUBSTITUTED`.
- No contiene secretos, certificados, XML ni operaciones de timbrado.

### BillingPolicy

- Configuración singleton y versionada para facturabilidad; no forma parte de `CommercialPolicy` ni de sus reglas de crédito.
- Conserva `billableDocumentTypes`, `allowInternalReceipt`, `requireConfirmedDelivery`, `deadlineDays`, `deadlineBasis` (`ISSUED_AT` o `DELIVERED_AT`) y `timezone`.
- Reportes y comandos consultan este mismo registro; no mantienen listas de tipos ni plazos alternos en código.

### BillingRequestSaleDocument

Relación N:M entre solicitud y documento, con subtotal, impuesto y total solicitados. Su composición contable exacta reside en `BillingRequestSaleItem`; no se autoriza mediante arreglos JSON.

### BillingRequestSaleItem

Reserva normalizada por partida entre `BillingRequestSaleDocument` y `SaleItem`. Conserva subtotal, impuesto y total solicitados por separado, admite reversión lógica y es la única fuente autorizativa para aplicar una factura a una partida.

### InvoiceSaleDocument

Relación N:M entre factura externa y documento, con importes aplicados y reversión lógica.

### InvoiceSaleItemApplication

Aplicación exacta por partida; la suma debe coincidir con la aplicación del documento.

### Extensiones a entidades existentes

- `Sale` incorpora `currencyCode` y referencia a `LegalEntity` resuelta explícitamente.
- La resolución fiscal de una venta ocurre antes de confirmar la transacción y no cambia inventario; si falla, la transacción completa se revierte.
- `SaleItem` conserva descuento, base gravable, impuesto y total históricos.
- `Customer` conserva perfil fiscal estructurado y su completitud se deriva.
- `BillingRequest.customerId` permanece; `saleId` deja de ser autoritativo tras el backfill.
- `PaymentAllocation` no se activa.

Ver invariantes en `specs/modules/billing-reportable-notes/spec.md`.

## Extensión post-MVP de CFDI 4.0 nativo

### FiscalIssuerBinding

Binding versionado entre `LegalEntity` y un proveedor/ambiente. Conserva
referencias opacas a credenciales y emisor; jamás secretos.

### FiscalFolioSequence

Asigna serie y folio deterministas por emisor y tipo antes del llamado PAC.

### Invoice e InvoiceConcept

`Invoice` se extiende con origen, versión/tipo CFDI, fechas, snapshots JSONB de
emisor/receptor, catálogos de pago, tipo de cambio, TFD, certificados, sellos,
estados fiscales separados, sustitución, contador de intentos y último error.
`InvoiceConcept` es el snapshot insert-only por concepto; no tiene relación a
`Product` ni `Customer` mutable.

### FiscalOperationAttempt

Cada interacción `STAMP`, `CANCEL`, `STATUS` o `RECOVERY` conserva intento
monotónico, estado, `correlationId`, idempotencia, hash, proveedor y error
sanitizado. La unicidad de `sourceBillingRequestId` y
`fiscalIdempotencyKey` en `Invoice` evita una segunda raíz nativa; un retry
`STAMP` conserva clave y exige que el intento anterior sea reintentable.

### FiscalCertificate

Snapshot inmutable de número de certificado, huella SHA-256, sujeto/emisor y
vigencia; nunca almacena llave privada, contraseña, token PAC o secreto.

### FiscalArtifact

Metadatos, checksum y estado del XML, PDF o acuse privado. No contiene payload:
los bytes permanecen exclusivamente en ObjectStorage.

### Extensiones a Invoice y perfiles

- `Invoice.origin`: `LEGACY_EXTERNAL` o `NATIVE_CFDI`.
- `Invoice.sourceBillingRequestId`: único y nulo para legacy.
- `Invoice.status` conserva `ACTIVE`, `CANCELLED` y `SUBSTITUTED`; el estado PAC
  pendiente nunca se duplica ahí.
- `LegalEntity`, `Customer` y el perfil fiscal de producto deben cubrir los
  datos estructurados de emisor, receptor y concepto requeridos por CFDI 4.0.

Ver entidades, enums, state machines e invariantes en
`specs/modules/cfdi/spec.md`.

### SatCatalog, SatCatalogVersion y SatCatalogEntry

El bounded context fiscal mantiene los códigos SAT en versiones insert-only.
`SatCatalog` identifica el catálogo soportado y apunta a una versión activa;
`SatCatalogVersion` conserva fuente, checksum, estado, conteo y timestamps;
`SatCatalogEntry` conserva `code`, `description`, vigencia y metadata. No se
relacionan por FK con `Invoice` o `InvoiceConcept`: una factura guarda el
snapshot fiscal que se emitió, aun si la descripción del catálogo cambia.

El importador realiza staging, validación y activación atómica. La migración no
infiere ni siembra códigos oficiales; una carga exige archivo/versión fuente,
checksum y aprobación operativa.

## Diseño de entidades REP 2.0 (CFDI-16; no implementado)

### PaymentReceipt

Extensión fiscal uno-a-uno de `Invoice(PAYMENT_RECEIPT)`. Conserva versión del
complemento, totales MXN, impuestos agregados y hash del snapshot. No es una
raíz monetaria ni se suma en reportes de ingresos.

Validaciones:

- `invoiceId` único y la factura debe ser `NATIVE_CFDI/PAYMENT_RECEIPT`.
- `complementVersion=2.0`.
- totales calculados con Decimal desde detalles y aplicaciones.
- snapshot inmutable desde `STAMPING`.

### PaymentReceiptDetail

Snapshot del nodo Pago y referencia a un `Payment` existente. Conserva fecha,
FormaDePagoP, MonedaP, tipo de cambio, monto, operación, datos bancarios
permitidos, fecha límite de emisión, impuestos y hash.

Validaciones:

- `Payment.status=APPLIED`.
- el monto snapshot coincide con `Payment.amount`; `cashTendered` y
  `changeGiven` nunca forman parte del REP.
- FormaDePagoP se toma de `Payment.fiscalPaymentFormCode`, no se infiere de un
  método operacional ambiguo.
- la primera implementación acepta un detalle por REP y una emisión ordinaria
  abierta por pago.
- una sustitución referencia el detalle previo y no duplica su efecto.

### PaymentInvoiceApplication

Relación fiscal N:M entre `Payment` y `Invoice` de Ingreso, propiedad de un
`PaymentReceiptDetail`. Resuelve explícitamente que una venta/documento puede
estar facturado por más de una `Invoice`.

Validaciones:

- la factura relacionada es `NATIVE_CFDI`, `INCOME`, `ACTIVE`, `STAMPED`,
  `PPD`, con UUID.
- existe una ruta activa desde la venta del pago mediante `SaleDocument` e
  `InvoiceSaleDocument`.
- el importe no excede ni el saldo fiscal de la factura ni la capacidad de esa
  venta dentro de la factura.
- `ImpSaldoAnt - ImpPagado = ImpSaldoInsoluto`, todos con Decimal.
- la suma de aplicaciones convertidas coincide exactamente con el monto del
  detalle de pago.
- `NumParcialidad` se deriva de aplicaciones `EFFECTIVE`; la sustitución
  conserva la parcialidad reemplazada.
- UUID, moneda, equivalencia, método DR, saldos, objeto de impuesto e impuestos
  son snapshots insert-only.
- conserva un snapshot de los `InvoiceSaleDocument` que justifican la capacidad
  de la venta dentro del CFDI agrupado.
- `RESERVED`/`UNKNOWN` bloquean otra emisión; `EFFECTIVE` solo se vuelve
  `REVERSED` por cancelación fiscal confirmada.

### Extensión fiscal de Payment

`currencyCode`, `exchangeRateToMxn` y `fiscalPaymentFormCode` se agregarán de
forma nullable en expand. `paymentMethod`, ruta, segunda vuelta y liquidación
siguen siendo metadatos operativos. Un pago legacy incompleto conserva toda su
operación económica y queda bloqueado únicamente para REP con remediación.

`PaymentAllocation` continúa fuera del modelo: no se distribuye un pago entre
cuentas por cobrar. `PaymentInvoiceApplication` distribuye su reflejo fiscal
entre UUID relacionados y jamás modifica el dinero o saldo de cobranza.
