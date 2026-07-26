# Módulo - Cierre diario de punto de venta

## Propósito

Conciliar por `OperationalLocation` y fecha la operación de pollerías externas: producto recibido, ventas, referencias manuales de báscula, existencia restante, ingresos, gastos, sobrantes, faltantes y utilidad.

## Límites del módulo

Incluye:

- Borrador, revisión, cierre, cancelación y reapertura auditada.
- Líneas de entradas, salidas, ingresos y utilidad.
- Asociación de ventas, pagos y movimientos existentes.
- Captura manual de tickets, etiquetas y reportes de báscula.
- Movimientos de caja y gastos.
- Captura física de inventario por producto para conciliar el cierre.
- Validación de kilos e ingresos y exposición de diferencias.
- Snapshots auditables al revisar y cerrar.

No incluye:

- Integración automática con básculas o hardware.
- CFDI, SAT, PAC, timbrado o cancelación fiscal.
- Modificación directa de inventario desde líneas de cierre.
- `PaymentAllocation` o pagos aplicados a varias cuentas.
- Liquidación de rutas; corresponde a `RouteSettlement`.

## Dependencias

- Ubicaciones operativas.
- Ventas/POS.
- Inventario, movimientos y traspasos.
- Cuentas por cobrar y pagos.
- Usuarios y RBAC.
- Reportes.

## Requisitos funcionales

### Requirement: Punto externo válido

El sistema debe permitir cierres únicamente para `OperationalLocation` activas y autorizadas como puntos externos o equivalentes aprobados.

Para el MVP, los tipos autorizados son `BRANCH`, `MIXED` y `EXTERNAL_POINT_OF_SALE`. La validación ocurre en backend antes de crear el cierre; `SELLER` además debe estar asignado a la ubicación solicitada.

#### Scenario: Ubicación inactiva

- Dada una ubicación inactiva
- Cuando un usuario intenta crear un cierre
- Entonces el sistema rechaza la operación con `LOCATION_INACTIVE`.

#### Scenario: Ubicación no habilitada para punto de venta

- Dada una ubicación activa de tipo `WAREHOUSE` o `ROUTE_STOCK`
- Cuando un usuario intenta crear un cierre
- Entonces el sistema rechaza la operación con `LOCATION_NOT_POINT_OF_SALE`.

### Requirement: Borrador único por ubicación y fecha

El sistema debe mantener un solo cierre no cancelado por ubicación y fecha mientras no exista una política de turnos o cajas múltiples. La base de datos debe imponer esta regla mediante un índice único parcial para estados distintos de `CANCELLED`; la API traduce el conflicto de unicidad al código de dominio.

#### Scenario: Cierre duplicado

- Dado un cierre no cancelado para la ubicación y fecha
- Cuando se intenta crear otro
- Entonces el sistema responde `DAILY_CLOSE_ALREADY_EXISTS`.

#### Scenario: Aperturas simultáneas

- Dadas dos solicitudes simultáneas para la misma ubicación y fecha sin cierre previo
- Cuando ambas superan la consulta inicial de duplicados
- Entonces la base de datos persiste solo un cierre no cancelado.
- Y la otra solicitud responde `DAILY_CLOSE_ALREADY_EXISTS`.

### Requirement: Sesión monetaria de caja

El borrador del cierre representa también la sesión monetaria operativa del punto de venta. La apertura debe conservar `terminalIdentifier`, `openedByUserId` como cajero responsable, `openedAt`, `cashSessionStatus`, `initialCashFund`, `initialCashIn` e `initialCashOut`. Los depósitos y retiros iniciales se registran como `CashMovement` trazables.

Mientras `cashSessionStatus=OPEN` y el cierre está en `DRAFT`, la sesión puede recibir ventas y pagos. Al cerrar o cancelar el cierre, la sesión pasa a `CLOSED`; una reapertura administrativa vuelve a `OPEN`.

#### Scenario: Apertura con fondo y terminal

- Dada una ubicación activa autorizada
- Cuando el cajero abre `Caja 01` con fondo inicial de 1,500.00 MXN y hora de apertura del servidor
- Entonces la respuesta conserva terminal, cajero, fondo, estado abierto y hora de apertura
- Y cualquier depósito o retiro inicial queda asociado al mismo cierre sin depender de una conciliación posterior.

#### Scenario: Venta sin sesión

- Dada una venta de contado o un pago en efectivo sin una sesión abierta en la ubicación
- Cuando se intenta confirmar la operación
- Entonces el backend responde `CASH_SESSION_REQUIRED` o `CASH_SESSION_NOT_OPEN`
- Y no crea venta, pago, movimiento de inventario ni cuenta por cobrar.

#### Scenario: Asociación directa

- Dada una sesión abierta
- Cuando se confirma una venta de contado o un pago en efectivo
- Entonces `Sale.pointOfSaleDailyCloseId` y `Payment.pointOfSaleDailyCloseId` conservan directamente el identificador de la sesión
- Y el cierre no necesita descubrir esa operación después por rango de fechas.

### Requirement: Inventario por ubicación

Toda venta, entrada, salida, ajuste o traspaso conciliado debe pertenecer a la misma ubicación del cierre.

#### Scenario: Operación de otra ubicación

- Dada una venta confirmada en otra ubicación
- Cuando se intenta asociar al cierre
- Entonces se rechaza con `OPERATION_LOCATION_MISMATCH`.

### Requirement: Documentos internos de venta

El módulo debe distinguir ticket/etiqueta de báscula, nota simple, nota grande y comprobante interno, y mostrar las solicitudes administrativas aparte de los documentos operativos de venta.

#### Scenario: Solicitud administrativa relacionada

- Dada una venta con `requiresAdministrativeInvoice = true`
- Cuando se muestra en el cierre
- Entonces el cierre muestra el `SaleDocument` operativo por un lado y la `BillingRequest` relacionada por separado, sin timbrado ni estado SAT.

### Requirement: Captura manual de báscula

El módulo debe permitir capturar folio, venta y documento de venta opcionales, producto, pesos bruto, tara y neto, piezas, precio e importe de una referencia de báscula sin integración automática. La referencia conserva `captureSource=MANUAL`; no habilita captura desde hardware durante el MVP.

#### Scenario: Referencia capturada

- Dado un cierre en borrador
- Cuando `SELLER` registra una referencia válida
- Entonces se conserva la captura y puede compararse directamente con la venta y documento `SCALE_TICKET` asociados, sin generar inventario ni una nueva venta.

### Requirement: Conciliación de kilos

El sistema debe comparar kilos recibidos, vendidos, reportados por báscula, sobrantes, faltantes y otras salidas por producto.

#### Scenario: Diferencia detectada

- Dados totales que no concilian
- Cuando se valida el cierre
- Entonces se devuelve la diferencia con origen y unidad, sin ocultarla ni compensarla automáticamente.

### Requirement: Conteo físico de inventario por producto

El cierre en borrador debe permitir a `ADMIN` y `SELLER` autorizados capturar, corregir y eliminar un conteo físico por producto. Cada conteo conserva producto, cantidades físicas en kilos y piezas, motivo, responsable y fechas de auditoría. La conciliación expone por producto la existencia inicial, entradas, ventas del sistema, otras salidas, existencia teórica, existencia física, sobrante y faltante.

El conteo es evidencia de conciliación y no crea ni modifica `InventoryMovement`, `InventoryBalance` ni ventas. La existencia teórica se calcula con movimientos históricos de la ubicación y ventas confirmadas asociadas al cierre; toda diferencia permanece visible hasta que un flujo de ajuste autorizado la resuelva.

#### Scenario: Faltante físico capturado

- Dado un cierre en borrador con existencia teórica de 10.000 kg de un producto
- Cuando el vendedor registra una existencia física de 8.500 kg con motivo
- Entonces la conciliación muestra 1.500 kg de faltante y 0 kg de sobrante.
- Y no se genera un movimiento de inventario implícito.

#### Scenario: Conteo fuera del borrador

- Dado un cierre revisado, cerrado o cancelado
- Cuando se intenta crear, editar o eliminar un conteo físico
- Entonces el sistema rechaza la operación con `DAILY_CLOSE_NOT_EDITABLE`.

### Requirement: Conciliación de ingresos

El sistema debe separar efectivo, boucher/tarjeta, transferencia, cobranza, otros ingresos y gastos.

El cierre en borrador debe permitir a `ADMIN` y `SELLER` dentro de su ubicación capturar el efectivo físico contado. El backend debe persistirlo y calcular `cashDifferenceTotal = cashCountedTotal - netCashExpected`. Sin un conteo de efectivo, la validación no es satisfactoria y el cierre no puede avanzar a revisión. Una diferencia calculada se muestra sin compensarla ni aplicar tolerancias no aprobadas; `ADMIN` conserva la autorización de revisión y cierre.

#### Scenario: Efectivo contado con faltante

- Dado un cierre en borrador con efectivo esperado de 1,250.00 MXN
- Cuando se registra efectivo contado de 1,200.00 MXN
- Entonces se persiste `cashCountedTotal = 1200.00` y `cashDifferenceTotal = -50.00`.
- Y la validación expone la diferencia sin ocultarla ni compensarla automáticamente.

#### Scenario: Conteo pendiente

- Dado un cierre en borrador sin efectivo contado
- Cuando se valida o intenta revisar el cierre
- Entonces se devuelve `CASH_COUNT_REQUIRED` y no se permite avanzar a `REVIEWED`.

#### Scenario: Venta a crédito

- Dada una venta a crédito sin pago
- Cuando se calcula el ingreso del cierre
- Entonces la venta no se suma como efectivo recibido.

#### Scenario: Fuente monetaria única

- Dado un cierre en borrador
- Cuando se calculan ingresos
- Entonces solo se suman `Payment` confirmados y nunca campos monetarios duplicados en venta o reparto.

### Requirement: Pagos uno a uno

Todo pago de cobranza incluido debe conservar `Payment.accountReceivableId` requerido y aplicarse a una sola cuenta.

#### Scenario: Pago sin cuenta por cobrar

- Dado un pago sin `accountReceivableId`
- Cuando se intenta asociar
- Entonces la validación bloquea el cierre.

### Requirement: Gastos trazables

Todo gasto debe registrarse como `CashMovement` con ubicación, importe, motivo, usuario y fecha.

Cada alta de gasto, referencia de báscula o conteo físico requiere una clave de idempotencia única. El backend debe ejecutar la escritura, la invalidación de validación, el incremento de versión, el recálculo y el evento de auditoría en una sola transacción; si alguna etapa falla, no puede persistir una parte de la mutación.

#### Scenario: Gasto sin motivo

- Dado un cierre en borrador
- Cuando se intenta registrar un gasto sin motivo
- Entonces la API rechaza la operación.

#### Scenario: Repetición de gasto

- Dado un gasto registrado con una clave de idempotencia y el mismo payload
- Cuando el cliente repite la solicitud
- Entonces el sistema devuelve el cierre vigente sin crear otro gasto ni incrementar la versión.

### Requirement: Snapshots inmutables de transición

Al revisar, cerrar o reabrir, el sistema debe crear un `DailyCloseSnapshot` inmutable con la versión fuente, tipo de snapshot, payload serializado, hash, actor y fecha. El payload conserva las ventas, pagos, movimientos de inventario y caja, referencias de báscula, conteos físicos, diferencias y totales usados en la transición.

#### Scenario: Cierre con evidencia completa

- Dado un cierre revisado y validado
- Cuando `ADMIN` lo cierra
- Entonces el sistema guarda un snapshot `CLOSED` dentro de la misma transacción que la transición.
- Y si no se puede guardar el snapshot o su evento de auditoría, el cierre conserva su estado previo.

### Requirement: Validación previa al cierre

El sistema debe recalcular totales y detectar operaciones sin ubicación, asociaciones inconsistentes, diferencias y conflictos de versión.

#### Scenario: Operación sin ubicación

- Dada una operación asociada sin `OperationalLocation`
- Cuando se valida el cierre
- Entonces se devuelve `OPERATION_WITHOUT_LOCATION` como error bloqueante.

#### Scenario: Resultado de validación visible

- Dado un cierre en borrador cuya validación devuelve `valid = false`
- Cuando el usuario valida desde la UI
- Entonces la pantalla conserva y muestra los bloqueantes, diferencias y advertencias devueltos o derivados del cierre.
- Y no muestra el mensaje de éxito `Cierre validado`.

### Requirement: Cierre transaccional

Cerrar debe persistir estado, snapshot, responsable, fecha y auditoría en una transacción.

#### Scenario: Versión obsoleta

- Dado un cierre validado que cambió después
- Cuando `ADMIN` intenta cerrarlo con una versión anterior
- Entonces se rechaza con `DAILY_CLOSE_VERSION_CONFLICT` y no se persiste un cierre parcial.

### Requirement: Cancelación y reapertura administrativas

Solo `ADMIN` puede cancelar o reabrir, siempre con motivo y sin revertir automáticamente ventas, pagos o inventario.

Las únicas transiciones permitidas son `DRAFT -> REVIEWED`, `DRAFT -> CANCELLED`, `REVIEWED -> CLOSED`, `REVIEWED -> DRAFT`, `REVIEWED -> CANCELLED` y `CLOSED -> DRAFT`. `CANCELLED` es un estado final; cualquier otra transición se rechaza con `DAILY_CLOSE_INVALID_STATUS`.

#### Scenario: Reapertura autorizada

- Dado un cierre cerrado
- Cuando `ADMIN` lo reabre con versión y motivo válidos
- Entonces vuelve a `DRAFT` y conserva snapshot y auditoría previos.

#### Scenario: Venta con cierre cerrado

- Dada una venta asociada a un cierre `CLOSED`
- Cuando se intenta cancelar la venta
- Entonces el sistema exige reapertura versionada del cierre antes de permitir la cancelación operativa.

### Requirement: Separación de liquidación de ruta

El cierre fijo no debe incluir automáticamente cobros o devoluciones de ruta pendientes de `RouteSettlement`.

#### Scenario: Cobro en ruta

- Dado un pago asociado a una ruta activa
- Cuando se intenta incorporar automáticamente al cierre fijo
- Entonces el sistema lo excluye y señala su conciliación de ruta pendiente.

### Requirement: Reportes con frescura

Los reportes de punto de venta deben incluir `generatedAt`, `dataAsOf`, `freshnessSeconds` e `isStale` y reflejar operaciones confirmadas en hasta 60 segundos bajo condiciones normales.

#### Scenario: Cierre en borrador

- Dado un cierre todavía abierto
- Cuando se consulta el reporte diario
- Entonces las operaciones confirmadas recientes siguen visibles y el reporte identifica el estado del cierre.

### Requirement: Diferencias estructuradas y trazables

Toda diferencia monetaria o de cantidad detectada durante el recálculo debe conservarse como un registro asociado al cierre, con valor esperado, valor registrado, diferencia, unidad, tipo (`SURPLUS` o `SHORTAGE`), motivo, evidencia textual, usuario que justificó y administrador que autorizó cuando aplique. La evidencia MVP es una referencia textual a un folio, nota o documento; la carga binaria de archivos queda fuera de este cambio.

Una justificación debe invalidar la validación vigente, incrementar la versión del cierre y registrar un evento auditable. Solo `ADMIN` puede autorizar una diferencia justificada. Autorizar no crea movimientos de inventario, caja o ventas ni compensa automáticamente la diferencia. Las diferencias autorizadas permanecen visibles, pero no cuentan como pendientes de resolución.

#### Scenario: Diferencia justificada

- Dado un cierre en borrador con una diferencia de efectivo o kilos
- Cuando un usuario autorizado registra motivo y evidencia
- Entonces el sistema conserva los valores esperado, registrado y diferencia junto con el usuario que justificó
- Y obliga a validar nuevamente el cierre.

#### Scenario: Diferencia autorizada

- Dada una diferencia justificada
- Cuando `ADMIN` la autoriza con la versión vigente
- Entonces se conserva el administrador y la fecha de autorización
- Y no se modifica automáticamente la operación fuente.

### Requirement: Proceso guiado de cierre

La UI debe presentar el cierre como un proceso secuencial de seis pasos: verificar operaciones, conciliar inventario, revisar báscula, contar caja, revisar diferencias, y firmar y cerrar. La cabecera del cierre permanece visible durante el proceso y muestra sucursal, fecha operativa, `Caja/turno: Cierre único diario`, responsable, estado, última actualización y versión.

El diálogo final debe mostrar kilos, báscula, inventario, gastos, ventas, notas facturables, efectivo y diferencias sin resolver antes de confirmar la transición.

## RBAC

- `ADMIN`: acceso completo, revisión, cierre, cancelación y reapertura.
- `SELLER`: captura ventas, referencias y borrador de su ubicación.
- `WAREHOUSE`: consulta entradas, traspasos y kilos para conciliación.
- `COLLECTIONS`: consulta pagos e ingresos autorizados; no modifica inventario.
- `CASHIER`: decisión abierta, no forma parte del MVP.

Los costos de compra, la utilidad bruta, la utilidad neta, la calidad del costo y los snapshots de costo son información administrativa. El backend no debe enviarlos a `SELLER`, incluidos los costos anidados en partidas de venta, las líneas `PROFIT` y las respuestas de validación o actualización del cierre. `SELLER` conserva acceso a sus ventas, pagos, efectivo contado y diferencias de caja autorizadas.

#### Scenario: Vendedor sin costos ni utilidad

- Dado un cierre con costos, utilidad y partidas de venta con snapshots de costo
- Cuando `SELLER` consulta, actualiza o valida el cierre
- Entonces la respuesta no contiene costos de compra, utilidad bruta, utilidad neta, calidad del costo ni snapshots de costo
- Y conserva las ventas, pagos, efectivo contado y diferencias de caja permitidas.

## Requisitos no funcionales

- Respuestas y errores usan el formato API estándar.
- Toda transición conserva usuario, fecha, motivo y versión.
- Operaciones críticas futuras son transaccionales.
- La UI contempla loading, error, empty, success, unauthorized y conflict.
- Reportes casi en tiempo real no dependen del cierre manual.

## Decisiones abiertas

- Cierre único por día frente a turnos o cajas múltiples.
- Tolerancias de kilos y dinero y su impacto en el cierre.
- Fórmulas oficiales de costo, utilidad bruta, utilidad neta y utilidad por pollo.
- Política exacta de redondeo.
- Catálogo final de entradas, salidas, gastos, métodos y bancos.
- Política de folios por ubicación y documento.
- Reglas de reapertura y bloqueo de periodos.
