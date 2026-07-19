# API — Reportes

> El reporte detallado de notas facturables pertenece al módulo de facturación y usa `/api/billing/reportable-notes`; ver `specs/.specs/03-api/billing-reportable-notes-api.md`. El reporte administrativo existente permanece como contrato legacy.


Define contratos para reportes operativos casi en tiempo real. Los reportes se basan en operaciones confirmadas y deben reflejar cambios con latencia máxima esperada de 60 segundos en condiciones normales. Deben distinguir tipo de venta, estado de cobranza, antigüedad de cartera, transferencias/depositos, pagos por banco y solicitudes administrativas sin mezclar dimensiones.

Todos los reportes deben incluir metadatos de frescura en `data`:

- `generatedAt`: fecha de generación de la respuesta.
- `dataAsOf`: instante más reciente incluido en el cálculo.
- `freshnessSeconds`: diferencia entre ambos instantes.
- `isStale`: `true` cuando supera el objetivo de 60 segundos.

## GET /api/reports/dashboard

Propósito: obtener métricas principales del dashboard por rol.

Permisos: `ADMIN` global; `SELLER`, `WAREHOUSE`, `COLLECTIONS` y `DRIVER` solo métricas autorizadas.

Query:

- `date` opcional.
- `locationId` opcional para alcance operativo.

Respuesta `data`:

- `salesToday`: total, conteo, contado y crédito.
- `cashSalesToday`: ingresos por ventas de contado.
- `collectionsToday`: cobros de cuentas por cobrar, incluyendo cobros en ruta, segunda vuelta e identificables por repartidor.
- `overdueReceivables`: saldo vencido, crédito atrasado y cuentas vencidas.
- `customersBlockedForCredit`: clientes bloqueados por mora o límite.
- `billingRequestsToday`: solicitudes administrativas creadas o enlazadas hoy.
- `paymentsByMethodToday[]` y `paymentsByBankToday[]`.
- `lowStockByLocation[]`: `locationId`, `productId`, `quantityKg`, `quantityPieces`, mínimos y estado.
- `deliverySummary`: pedidos pendientes, en ruta, entregados y con incidencia.
- `routeCollectionsPendingSettlement`.
- `topProducts[]`.
- `generatedAt`.

Validaciones:

- No depender de corte de caja o liquidación cerrada para mostrar operaciones confirmadas.
- Respetar permisos por rol.
- No mostrar tickets internos como CFDI o factura fiscal.

## GET /api/reports/sales-daily

Propósito: reporte de ventas diarias.

Permisos: `ADMIN` ve todos; `SELLER` ve solo propios salvo autorización.

Query:

- `date` requerido.
- `userId` opcional para `ADMIN`.
- `locationId`.
- `paymentType`: `CASH_SALE`, `CREDIT_SALE`.
- `paymentMethod`.
- `documentType`.

Respuesta `data`:

- `date`, `locationId`.
- `summary`: conteo, subtotal, descuentos, total, contado, crédito y cancelado.
- `collectionStatusSummary[]`: `UNPAID`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`.
- `agingSummary[]` opcional cuando exista saldo pendiente relacionado: `CURRENT`, `DUE_SOON`, `OVERDUE`.
- `byPaymentMethod[]`.
- `byDocumentType[]`.
- `bySeller[]`.
- `items[]`: ventas con `saleNumber`, cliente, vendedor, ubicación, `paymentType`, `collectionStatus`, `paymentMethods[]` derivado de pagos no cancelados, documento y total.
- `canceledNotes[]`: notas canceladas con folio, cliente, motivo y monto.

Validaciones:

- `paymentType` clasifica solo contado vs crédito.
- `collectionStatus` clasifica saldo o cobranza.
- `agingStatus` clasifica mora o antigüedad y no debe inferirse desde `paymentType`.
- El filtro singular `paymentMethod` incluye una venta cuando al menos uno de sus `Payment` no cancelados usa el método solicitado.
- `paymentMethods[]` debe contener los métodos distintos de los pagos no cancelados relacionados; una venta sin pagos devuelve una lista vacía.
- `byPaymentMethod[]` agrega `Payment.amount` por método y nunca suma `Sale.total`, evitando duplicar una venta con múltiples pagos.
- Basarse solo en ventas confirmadas, excluyendo o separando canceladas.

## GET /api/reports/inventory-low-stock

Propósito: productos con stock bajo por ubicación operativa.

Permisos: `ADMIN`, `WAREHOUSE`.

Query:

- `locationId` opcional; si se omite, agrupar por ubicación.
- `categoryId`, `productId`.
- `page`, `limit`.

Respuesta `data.items[]`:

- `productId`, `productName`, `sku`, `unit`.
- `locationId`, `locationName`.
- `quantityKg`, `quantityPieces`, `minQuantityKg`, `minQuantityPieces`.
- `isLowStock`.

Validaciones:

- No usar stock global de producto.
- Considerar kilos y piezas según unidad del producto.

## GET /api/reports/inventory-by-location

Propósito: consultar inventario disponible por producto y ubicación.

Permisos: `ADMIN`, `WAREHOUSE`; `SELLER` lectura limitada para POS si se autoriza.

Query:

- `locationId`.
- `productId`, `categoryId`, `search`.
- `page`, `limit`.

Respuesta `data.items[]`:

- `locationId`, `locationName`, `productId`, `productName`, `unit`.
- `quantityKg`, `quantityPieces`.
- `minQuantityKg`, `minQuantityPieces`, `isLowStock`.
- `lastMovementAt`.

Validaciones:

- `locationId` recomendado para operación; si no se envía, la respuesta debe agrupar claramente por ubicación.

## GET /api/reports/cash-closing

Propósito: corte operativo de caja por fecha, usuario y método.

Permisos: `ADMIN` ve todos; `SELLER` ve propio.

Query:

- `date` requerido.
- `userId` opcional para `ADMIN`.
- `locationId`.

Respuesta `data`:

- `cashSales`: ventas de contado por método.
- `creditSales`: ventas a crédito separadas, sin tratarlas como efectivo recibido.
- `accountsReceivablePayments`: pagos de cobranza registrados en caja.
- `routeCollections`: cobros en ruta pendientes o liquidados, separados de caja directa.
- `bankTransfersAndDeposits`: transferencias y depositos confirmados.
- `totalsByPaymentMethod[]`.
- `paymentsByBank[]`.
- `sellerSummary[]`.

Validaciones:

- Distinguir ventas de contado, ventas a crédito, pagos de cuentas por cobrar y cobros en ruta.
- No sustituye liquidación de ruta ni cierre contable.

## GET /api/reports/accounts-receivable

Propósito: reporte de cobranza, saldos vencidos, saldo final por cliente y pagos.

Permisos: `ADMIN`, `COLLECTIONS`.

Query:

- `customerId`.
- `status`: `UNPAID`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`.
- `agingStatus`: `CURRENT`, `DUE_SOON`, `OVERDUE`.
- `dueDateFrom`, `dueDateTo`.
- `onlyOverdue`.
- `onlyDueSoon`.
- `page`, `limit`.

Respuesta `data`:

- `summary`: saldo original, saldo pendiente, saldo vencido, pagos del periodo, crédito atrasado, saldo final por cliente y clientes bloqueados.
- `byCustomer[]`: cliente, saldo facturado, saldo pagado, saldo final, vencido, por vencer, último pago, estado de crédito.
- `items[]`: cuenta por cobrar, cliente, venta, vencimiento, folio físico, saldo y estado.
- `paymentsByMethod[]` y `paymentsByBank[]`.

Validaciones:

- Los pagos deben estar asociados a una cuenta por cobrar mediante `accountReceivableId`.
- `status` y `agingStatus` representan dimensiones distintas y no deben mezclarse.

## GET /api/reports/billing-requests

Propósito: reporte de facturación administrativa y relación interna de solicitudes.

Permisos: `ADMIN`, `SELLER`, `COLLECTIONS` según alcance.

Query:

- `dateFrom`, `dateTo`.
- `customerId`, `saleId`, `status`.
- `documentType`, `locationId`.

Respuesta `data`:

- `summary`: solicitudes creadas, enlazadas, canceladas y total facturado administrativamente.
- `items[]`: fecha, nota/folio, cliente, producto, kilos, monto, estado, venta relacionada y cuenta por cobrar relacionada.
- `canceledNotes[]`: notas canceladas sin impacto en saldo.

Validaciones:

- No mostrar CFDI, SAT, PAC, UUID fiscal ni timbrado.
- Las solicitudes administrativas son relaciones internas, no facturas fiscales.

## GET /api/reports/delivery-operations

Propósito: reporte de reparto, entregas, incidencias, cobros y liquidaciones.

Permisos: `ADMIN`, `COLLECTIONS`; `DRIVER` solo información propia no financiera global.

Query:

- `dateFrom`, `dateTo`.
- `routeId`, `driverId`, `status`.

Respuesta `data`:

- `deliverySummary`: pedidos por estado.
- `evidenceSummary`: evidencias capturadas por tipo.
- `collectionsSummary`: cobros por ruta, método y vuelta de cobranza.
- `settlementsSummary`: abiertas, cerradas y en revisión.
- `incidents[]`: devoluciones, rechazos parciales, no entregas y créditos que pasan a atrasado.

Validaciones:

- Cobros en ruta deben distinguirse de ventas de contado y de pagos registrados directamente por cobranza.
- Liquidaciones no sustituyen el reporte operativo casi en tiempo real.

## GET /api/reports/point-of-sale-daily

Propósito: consultar venta diaria y conciliación operativa por punto externo, aunque el cierre todavía esté en borrador.

Permisos: `ADMIN` global; `SELLER` para su ubicación; `WAREHOUSE` solo kilos y traspasos; `COLLECTIONS` solo ingresos y cobranza autorizada.

Query:

- `date` requerido.
- `locationId` requerido salvo consulta global de `ADMIN`.
- `documentType`, `paymentMethod`, `customerId` opcionales.

Respuesta `data`:

- `location`, `businessDate`, `dailyCloseId`, `dailyCloseStatus` cuando exista.
- `salesSummary`: total, conteo, público general, clientes fijos, contado y crédito.
- `collectionStatusSummary[]`: `UNPAID`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`.
- `agingSummary[]` opcional cuando aplique a saldos pendientes.
- `byDocumentType[]`: ticket/etiqueta, nota simple, nota grande y comprobante interno.
- `billingRequestsSummary`: solicitudes administrativas `REQUESTED`, `IN_REVIEW`, `APPROVED`, `REJECTED` y `CANCELLED`.
- `byPaymentMethod[]`: efectivo, boucher/tarjeta, transferencia, deposito y otros métodos autorizados derivados de `Payment`.
- `collectionsSummary`: cobranza del periodo separada por método, banco y origen cuando aplique.
- `cashMovementsByChannel[]`: efectivo, boucher/tarjeta, transferencia, deposito y otros medios operativos de caja.
- `weightSummary`: kilos enviados desde matriz, vendidos, reportados por báscula, sobrantes, faltantes y otras salidas.
- `incomeSummary`: efectivo, boucher/tarjeta, transferencia, deposito, cobranza, otros y gastos.
- `profitSummary`: costo de compra, venta, utilidad bruta y utilidad neta, marcando fórmulas pendientes cuando corresponda.
- `differences[]`: tipo, valor, unidad, severidad y estado de revisión.
- Metadatos de frescura.

Validaciones:

- Inventario y kilos siempre agrupados por `OperationalLocation`.
- No mezclar ventas a crédito con efectivo recibido.
- Los pagos deben poder agruparse por `paymentMethod` solo cuando provengan de `Payment`.
- Los gastos, entradas y salidas manuales de caja deben agruparse por `movementChannel` de `CashMovement`, no por `paymentMethod`.
- No ocultar diferencias ni aplicar tolerancias no aprobadas.
- Un cierre `CLOSED` aporta snapshot auditable, pero el reporte operativo sigue usando operaciones confirmadas recientes.

## GET /api/reports/point-of-sale-reconciliation

Propósito: comparar por ubicación y periodo kilos enviados, vendidos, sobrantes, faltantes, ingresos, gastos y diferencias.

Permisos: `ADMIN`; lectura parcial para `WAREHOUSE`, `SELLER` y `COLLECTIONS` según su dominio.

Query:

- `dateFrom`, `dateTo` requeridos.
- `locationId` opcional para `ADMIN` y requerido para roles operativos.
- `status`: `DRAFT`, `REVIEWED`, `CLOSED`, `CANCELLED`.

Respuesta `data`:

- `summary` del periodo.
- `byLocation[]` con métricas de kilos enviados, vendidos, devueltos, ajustados, ingresos, gastos, utilidad y diferencias.
- `days[]` con cierre, estado, responsable y alertas.
- Metadatos de frescura.

Validaciones:

- No mezclar `PointOfSaleDailyClose` con `RouteSettlement`.
- Los datos financieros globales permanecen restringidos a `ADMIN`.
- Tickets, notas y cierres no se etiquetan como CFDI.
