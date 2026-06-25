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

#### Scenario: Ubicación inactiva

- Dada una ubicación inactiva
- Cuando un usuario intenta crear un cierre
- Entonces el sistema rechaza la operación con `LOCATION_INACTIVE`.

### Requirement: Borrador único por ubicación y fecha

El sistema debe mantener un solo cierre no cancelado por ubicación y fecha mientras no exista una política de turnos o cajas múltiples.

#### Scenario: Cierre duplicado

- Dado un cierre no cancelado para la ubicación y fecha
- Cuando se intenta crear otro
- Entonces el sistema responde `DAILY_CLOSE_ALREADY_EXISTS`.

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

El módulo debe permitir capturar folio, producto, kilos, piezas, precio e importe de una referencia de báscula sin integración automática.

#### Scenario: Referencia capturada

- Dado un cierre en borrador
- Cuando `SELLER` registra una referencia válida
- Entonces se conserva la captura y puede compararse con ventas, sin generar inventario ni una nueva venta.

### Requirement: Conciliación de kilos

El sistema debe comparar kilos recibidos, vendidos, reportados por báscula, sobrantes, faltantes y otras salidas por producto.

#### Scenario: Diferencia detectada

- Dados totales que no concilian
- Cuando se valida el cierre
- Entonces se devuelve la diferencia con origen y unidad, sin ocultarla ni compensarla automáticamente.

### Requirement: Conciliación de ingresos

El sistema debe separar efectivo, boucher/tarjeta, transferencia, cobranza, otros ingresos y gastos.

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

#### Scenario: Gasto sin motivo

- Dado un cierre en borrador
- Cuando se intenta registrar un gasto sin motivo
- Entonces la API rechaza la operación.

### Requirement: Validación previa al cierre

El sistema debe recalcular totales y detectar operaciones sin ubicación, asociaciones inconsistentes, diferencias y conflictos de versión.

#### Scenario: Operación sin ubicación

- Dada una operación asociada sin `OperationalLocation`
- Cuando se valida el cierre
- Entonces se devuelve `OPERATION_WITHOUT_LOCATION` como error bloqueante.

### Requirement: Cierre transaccional

Cerrar debe persistir estado, snapshot, responsable, fecha y auditoría en una transacción.

#### Scenario: Versión obsoleta

- Dado un cierre validado que cambió después
- Cuando `ADMIN` intenta cerrarlo con una versión anterior
- Entonces se rechaza con `DAILY_CLOSE_VERSION_CONFLICT` y no se persiste un cierre parcial.

### Requirement: Cancelación y reapertura administrativas

Solo `ADMIN` puede cancelar o reabrir, siempre con motivo y sin revertir automáticamente ventas, pagos o inventario.

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

## RBAC

- `ADMIN`: acceso completo, revisión, cierre, cancelación y reapertura.
- `SELLER`: captura ventas, referencias y borrador de su ubicación.
- `WAREHOUSE`: consulta entradas, traspasos y kilos para conciliación.
- `COLLECTIONS`: consulta pagos e ingresos autorizados; no modifica inventario.
- `CASHIER`: decisión abierta, no forma parte del MVP.

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
