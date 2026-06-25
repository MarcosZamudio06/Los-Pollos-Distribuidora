# UI — Dashboard

## Objetivo

Mostrar resumen operativo casi en tiempo real por rol, con ventas, inventario por ubicación, cobranza y reparto, sin sustituir reportes detallados, cortes de caja ni liquidaciones.

## Alcance TASK-091

Pantallas y componentes requeridos:

- `DashboardPage`.
- Cards principales.
- Tabla de bajo stock por ubicación.
- Cards de cobranza y reparto conforme a permisos.
- Gráficas simples.

## Fuente de datos

Debe consumir `GET /api/reports/dashboard`.

Filtros:

- Fecha opcional.
- Ubicación operativa opcional.

Debe mostrar hora de generación (`generatedAt`) y respetar latencia máxima esperada de 60 segundos en condiciones normales.

## Cards principales

- Ventas del día: total, conteo, contado y crédito.
- Ingresos por ventas de contado.
- Cobros de cuentas por cobrar del día.
- Saldos vencidos.
- Productos con bajo stock por ubicación.
- Resumen de reparto: pendientes, en ruta, entregados y con incidencia.
- Cobros de ruta pendientes de liquidación.
- Top productos.

## Tabla de bajo stock por ubicación

Columnas:

- Ubicación operativa.
- Producto.
- Unidad.
- Kilos actuales.
- Piezas actuales.
- Mínimo en kilos.
- Mínimo en piezas.
- Estado.
- Acción.

No debe consolidar inventario como stock global único.

## Gráficas simples

- Ventas por día o periodo autorizado.
- Top productos vendidos.
- Ventas por método de pago.
- Distribución contado/crédito.

## Permisos

- `ADMIN`: dashboard completo.
- `SELLER`: ventas propias, métricas de POS y corte propio autorizado.
- `WAREHOUSE`: inventario, bajo stock y movimientos relevantes.
- `COLLECTIONS`: saldos vencidos, cuentas por cobrar, pagos y cobros en ruta autorizados.
- `DRIVER`: solo estado operativo de rutas propias si se habilita vista específica; no métricas financieras globales.

## Estados de pantalla

La pantalla debe contemplar:

- Loading.
- Error.
- Empty.
- Success.
- Unauthorized.

## Restricciones

- No mostrar ticket interno como CFDI ni factura fiscal.
- No depender de cortes manuales o liquidaciones cerradas para métricas operativas confirmadas.
- No mostrar información financiera global a roles no autorizados.
