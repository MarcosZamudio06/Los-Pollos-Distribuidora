# UI — Reportes

## Objetivo

Mostrar reportes operativos casi en tiempo real de ventas, inventario, caja, cobranza, facturación administrativa y reparto, basados en operaciones confirmadas y con latencia máxima esperada de 60 segundos en condiciones normales. Los reportes deben separar menudeo, crédito corto, crédito atrasado, abonos, transferencias/depositos y solicitudes administrativas.

Los reportes no sustituyen cortes de caja, liquidaciones de ruta ni cierres contables.

## Alcance TASK-092

Pantallas y componentes requeridos:

- `ReportsPage`.
- `SalesDailyReport`.
- `CashClosingReport`.
- `LowStockReport`.
- `InventoryByLocationReport`.
- `AccountsReceivableReport`.
- `BillingRequestsReport`.
- `DeliveryOperationsReport`.
- Filtros por fecha.
- Filtros por usuario para `ADMIN`.
- Filtros por ubicación, tipo de venta, estado de cobranza, documento y ruta cuando aplique.

## Reporte de ventas diarias

Debe consumir `GET /api/reports/sales-daily`.

Filtros:

- Fecha.
- Vendedor para `ADMIN`.
- Ubicación operativa.
- Tipo de venta: contado, crédito, abonado o atrasado.
- Método de pago.
- Tipo documental.

Debe mostrar:

- Resumen de ventas confirmadas.
- Ventas de contado.
- Ventas a crédito.
- Ventas abonadas.
- Ventas atrasadas.
- Ventas canceladas.
- Métodos de pago.
- Ventas por vendedor.
- Notas canceladas.
- Tabla de ventas con cliente, vendedor, ubicación, tipo de pago, documento, método y total.

## Corte operativo de caja

Debe consumir `GET /api/reports/cash-closing`.

Debe mostrar por separado:

- Ventas de contado por método.
- Ventas a crédito sin tratarlas como efectivo recibido.
- Pagos de cuentas por cobrar registrados en caja.
- Cobros en ruta pendientes o liquidados.
- Transferencias y depositos confirmados.
- Totales por método.
- Pagos por banco.
- Resumen por vendedor.

## Reporte de bajo inventario

Debe consumir `GET /api/reports/inventory-low-stock`.

Columnas:

- Producto.
- SKU.
- Unidad.
- Ubicación operativa.
- Kilos actuales.
- Piezas actuales.
- Mínimo en kilos.
- Mínimo en piezas.
- Diferencia o estado.

No debe usar stock global.

## Inventario por ubicación

Debe consumir `GET /api/reports/inventory-by-location`.

Filtros:

- Ubicación operativa.
- Producto.
- Categoría.
- Búsqueda.

Debe mostrar:

- Ubicación.
- Producto.
- Unidad.
- Kilos disponibles.
- Piezas disponibles.
- Mínimos.
- Bajo stock.
- Último movimiento.

## Reporte de cuentas por cobrar

Debe consumir `GET /api/reports/accounts-receivable`.

Filtros:

- Cliente.
- Estado: vigente, por vencer, parcialmente pagada, pagada, vencida, atrasada o cancelada.
- Rango de vencimiento.
- Solo vencidas.
- Solo por vencer.
- Solo atrasadas.

Debe mostrar:

- Saldo original.
- Saldo pendiente.
- Saldo vencido.
- Saldo final por cliente.
- Crédito atrasado.
- Pagos del periodo.
- Cuentas por cobrar con cliente, venta, vencimiento, folio físico, saldo y estado.

Cada pago relacionado debe conservar `accountReceivableId`.

## Reporte de facturación administrativa

Debe consumir `GET /api/reports/billing-requests`.

Filtros:

- Fecha.
- Cliente.
- Venta.
- Estado.
- Ubicación operativa.

Debe mostrar:

- Solicitudes administrativas creadas, enlazadas y canceladas.
- Facturación administrativa por fecha, nota, producto, kilos y monto.
- Notas canceladas sin impacto en saldo.
- Venta relacionada y cuenta por cobrar relacionada.

## Reporte de operaciones de reparto

Debe consumir `GET /api/reports/delivery-operations`.

Filtros:

- Rango de fechas.
- Ruta.
- Repartidor.
- Estado.

Debe mostrar:

- Pedidos por estado.
- Evidencias por tipo.
- Cobros por ruta, método y vuelta de cobranza.
- Liquidaciones abiertas, cerradas y en revisión.
- Incidencias, devoluciones, rechazos parciales, no entregas y créditos que pasan a atrasado.

Los cobros en ruta deben distinguirse de ventas de contado y de pagos directos de cobranza.

## Exportación

El MVP puede mostrar datos en pantalla. Exportación PDF/Excel queda como mejora posterior salvo priorización explícita.

## Permisos

- `ADMIN`: reportes globales.
- `SELLER`: ventas propias y corte propio salvo autorización.
- `WAREHOUSE`: inventario, bajo stock, movimientos y traspasos.
- `COLLECTIONS`: cobranza, saldos, pagos y cobros en ruta conforme a permisos.
- `DRIVER`: sin reportes financieros; solo información operativa propia cuando aplique.

## Estados de pantalla

Toda vista debe contemplar:

- Loading.
- Error.
- Empty.
- Success.
- Unauthorized.

## Restricciones

- Basarse en operaciones confirmadas.
- Refrescar o indicar actualización con límite operativo de hasta 60 segundos.
- No depender de cierres manuales para mostrar información operativa actual.
- No presentar ticket interno como CFDI ni factura fiscal.

## Metadatos de frescura

Todo reporte debe mostrar:

- Fecha y hora de generación (`generatedAt`).
- Datos actualizados hasta (`dataAsOf`).
- Segundos de frescura (`freshnessSeconds`).
- Advertencia visible cuando `isStale=true` o se supere el objetivo de 60 segundos.

## Venta diaria por punto de venta

Debe consumir `GET /api/reports/point-of-sale-daily`.

Filtros:

- Fecha.
- Ubicación operativa.
- Tipo de documento.
- Método de pago.
- Cliente cuando aplique.

Secciones:

- Ventas por ticket/etiqueta, nota simple, nota grande y comprobante interno.
- Solicitudes administrativas en bloque separado con conteos por estado.
- Público general frente a clientes fijos.
- Kilos enviados desde matriz, vendidos, reportados por báscula, sobrantes, faltantes y otras salidas.
- Ingresos por efectivo, boucher/tarjeta, transferencia, deposito, cobranza y otros.
- Gastos del día.
- Utilidad bruta y neta operacional, con aviso si la fórmula sigue pendiente.
- Diferencias operativas por ubicación.

## Conciliación de puntos de venta

Debe consumir `GET /api/reports/point-of-sale-reconciliation`.

La vista debe comparar días y ubicaciones, mostrar estado del cierre, responsables, alertas y diferencias. No debe mezclar cierres fijos con `RouteSettlement`. Debe detallar kilos enviados, vendidos, devueltos y ajustados por ubicación.

Permisos:

- `ADMIN`: información global, financiera y por ubicación.
- `SELLER`: ventas y cierre de su ubicación.
- `WAREHOUSE`: kilos, traspasos e inventario; sin utilidad global.
- `COLLECTIONS`: ingresos y cobranza autorizada; sin modificación de inventario.

Los reportes casi en tiempo real no dependen de que el cierre esté `CLOSED`; cuando existe un snapshot cerrado, debe distinguirse del dato operativo actualizado.
