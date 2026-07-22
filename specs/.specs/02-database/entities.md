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
- `parentId` opcional hasta cerrar el modelo final sucursal-almacén.
- Debe poder relacionarse con ventas, compras, inventario, movimientos, traspasos y configuración operativa por ubicación cuando aplique.

Tipos sugeridos:

- `BRANCH`.
- `WAREHOUSE`.
- `MIXED`.
- `EXTERNAL_POINT_OF_SALE`.
- `ROUTE_STOCK`.

Notas:

- Esta entidad representa la abstracción temporal de ubicación operativa.
- No debe asumirse que toda sucursal contiene almacenes ni que todo almacén pertenece a una sucursal hasta resolver la decisión de negocio.
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
- Venta a crédito sin pago inicial genera `AccountReceivable` por el total.
- Venta a crédito con abono inicial genera `Payment` por el abono y `AccountReceivable` por el saldo.
- Contraentrega no es dinero recibido hasta registrar `Payment`.

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

## SaleDocument

Validaciones:

- `saleId` requerido.
- `documentType` requerido.
- `operationalLocationId` requerido cuando el documento tenga folio físico.
- `physicalFolio` requerido cuando aplique.
- `status` requerido.
- Debe conservar `customerSnapshot`, `productSnapshot`, `priceSnapshot` y cantidades capturadas para trazabilidad histórica.
- Debe distinguir nota sencilla, nota grande y ticket/comprobante interno.

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
- No confirmar si la ubicación origen no tiene stock suficiente.
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

## Customer

Validaciones:

- `name` requerido.
- `email` debe ser válido si existe.
- `phone` debe ser único si se usa como identificador comercial.
- `customerType` requerido para distinguir cliente minorista, mayorista e institucional.
- Si el cliente tiene crédito, debe definir límite de crédito, días de crédito y estado de crédito.
- Un cliente facturado debe conservar número interno, RFC, razón social, alias/nombre comercial y correo administrativo.
- Los datos fiscales son opcionales en MVP y no implican emisión CFDI.
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

## DeliveryRoute

Validaciones:

- `driverId` requerido.
- `scheduledDate` requerido.
- `routeStockLocationId` requerido para rutas con carga de inventario.
- No completar ruta si existen pedidos pendientes.
- Solo el chofer asignado debe poder actualizar sus pedidos desde la experiencia móvil.
- La liquidación debe permitir comparar pedidos entregados, devoluciones, incidencias, cobros recibidos, transferencias/depositos y segunda vuelta de cobranza.
- Si la ruta sale de una ubicación operativa específica, debe conservar `originLocationId`.
- Debe existir relación 1:1 recomendada entre `DeliveryRoute` y `OperationalLocation(type=ROUTE_STOCK)`.

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
- Debe permitir foto, firma, geolocalización o nota según política final.

Nota:

- La combinación obligatoria de evidencia sigue pendiente de decisión de negocio.
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
- Combinación obligatoria de evidencia de entrega.
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
- `pointOfSaleDailyCloseId` opcional hasta que la venta se asocie a un cierre.
- La solicitud administrativa se modela con `billingRequestId` y `requiresAdministrativeInvoice`; no habilita CFDI, SAT, PAC ni timbrado.
- Una referencia de báscula nunca sustituye la confirmación de la venta ni su movimiento de inventario.

### Payment

Validaciones adicionales:

- `operationalLocationId` debe registrarse cuando el pago se recibe en un punto de venta fijo.
- `pointOfSaleDailyCloseId` es opcional hasta asociar el pago a un cierre.
- Todo pago de cobranza incluido en un cierre conserva `accountReceivableId` obligatorio y aplica a una sola cuenta por cobrar.
- Un pago inmediato de contado puede asociarse al cierre mediante `saleId` sin `AccountReceivable`.
- Los cobros en ruta conservan su relación con ruta o liquidación y no se incorporan automáticamente al cierre fijo.

## PointOfSaleDailyClose

Validaciones:

- `operationalLocationId` requerido y debe corresponder a una ubicación activa al crear el borrador.
- `businessDate` requerido.
- La combinación de ubicación y fecha debe ser única para cierres no cancelados mientras no se apruebe soporte por turno o caja.
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

## CashMovement

Validaciones:

- `operationalLocationId` requerido.
- `pointOfSaleDailyCloseId` es opcional fuera de un cierre. El endpoint anidado del cierre lo asigna desde `:id` al crear el movimiento y el cliente no puede reemplazarlo.
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
- Debe conservar producto, kilos, piezas, precio e importe capturados cuando estén disponibles.
- Un folio no debe duplicarse dentro de la misma ubicación y fecha de negocio, salvo corrección auditada.
- No genera movimientos de inventario ni CFDI.

## Decisiones abiertas del modelo de cierre

- Unicidad por día frente a múltiples turnos o cajas.
- Tolerancias de kilos e importes y su efecto en transiciones de estado.
- Fórmulas oficiales de costo y utilidad.
- Catálogo final de conceptos de línea y movimientos de caja.
- Política de reapertura y conservación de snapshots previos.

## Extensión post-MVP de notas facturables

### LegalEntity

- Emisor fiscal distinto de `OperationalLocation`.
- Conserva identidad legal y estado; su relación operativa se configura y audita explícitamente.

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
- `SaleItem` conserva descuento, base gravable, impuesto y total históricos.
- `Customer` conserva perfil fiscal estructurado y su completitud se deriva.
- `BillingRequest.customerId` permanece; `saleId` deja de ser autoritativo tras el backfill.
- `PaymentAllocation` no se activa.

Ver invariantes en `specs/modules/billing-reportable-notes/spec.md`.
