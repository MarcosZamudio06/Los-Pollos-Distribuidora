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

### Requirement: Cierre diario único y consolidado por ubicación

El sistema debe mantener un solo `PointOfSaleDailyClose` no cancelado por ubicación y fecha de negocio. Este registro representa el consolidado de sucursal y no una caja ni un turno. La base de datos debe imponer la regla mediante un índice único parcial para estados distintos de `CANCELLED`.

#### Scenario: Cierre duplicado

- Dado un cierre no cancelado para la ubicación y fecha
- Cuando se intenta crear otro
- Entonces el sistema responde `DAILY_CLOSE_ALREADY_EXISTS`.

#### Scenario: Aperturas simultáneas

- Dadas dos solicitudes simultáneas para la misma ubicación y fecha sin cierre previo
- Cuando ambas superan la consulta inicial de duplicados
- Entonces la base de datos persiste solo un cierre no cancelado.
- Y la otra solicitud responde `DAILY_CLOSE_ALREADY_EXISTS`.

### Requirement: Terminal persistente administrada

Cada caja física o navegador autorizado debe existir como `CashTerminal`, pertenecer a una ubicación operativa y conservar un `deviceId` único registrado por administración. El nombre o código de la terminal no puede capturarse libremente al abrir un turno ni sustituir la identidad del dispositivo.

#### Scenario: Dispositivo no registrado

- Dado un navegador cuyo `deviceId` no pertenece a una terminal activa
- Cuando un usuario intenta abrir turno o registrar una venta
- Entonces el backend responde `CASH_TERMINAL_DEVICE_MISMATCH`
- Y no crea turno, venta, pago ni movimiento.

### Requirement: Cutover supervisado de terminales migradas

Una terminal migrada con identidad `legacy:*` no puede operar hasta ser vinculada a un navegador real. Un usuario `ADMIN` o `SELLER` autenticado puede solicitar desde ese navegador un código temporal de un solo uso, ligado a su ubicación operativa y `deviceId`. Solo `ADMIN` puede consumirlo para vincular una terminal migrada de la misma ubicación. El código expira a los 15 minutos y solo se persiste su hash.

#### Scenario: Vinculación supervisada válida

- Dada una terminal migrada de la misma ubicación que el solicitante
- Y un código vigente que no ha sido consumido
- Cuando `ADMIN` confirma la vinculación
- Entonces la terminal conserva su identificador, código, nombre e historial
- Y reemplaza `legacy:*` por el `deviceId` real
- Y el código queda consumido sin poder reutilizarse.

#### Scenario: Código inválido o terminal ya vinculada

- Dado un código vencido, consumido o de otra ubicación
- O una terminal cuyo `deviceId` ya no inicia con `legacy:`
- Cuando se intenta confirmar la vinculación
- Entonces no cambia la terminal ni habilita la apertura de turno.

### Requirement: Turno monetario independiente

Cada apertura debe crear un `CashShift` asociado a un `CashTerminal`, al `PointOfSaleDailyClose` de la sucursal y fecha, y al cajero autenticado. El turno conserva `cashierUserId`, `businessDate`, `openedAt`, `closedAt`, `status`, `initialCashFund`, `initialCashIn`, `initialCashOut`, ventas, pagos, entradas, retiros, gastos, conteo y diferencia.

Una terminal puede tener varios turnos secuenciales en la misma fecha de negocio, pero solo uno abierto simultáneamente. Varias terminales de la misma sucursal pueden operar turnos abiertos en paralelo.

#### Scenario: Apertura con fondo y terminal registrada

- Dada una terminal activa cuyo `deviceId` coincide con el dispositivo solicitante
- Cuando el cajero abre un turno con fondo inicial de 1,500.00 MXN
- Entonces el servidor crea o reutiliza el cierre diario de la sucursal y fecha
- Y crea un turno independiente con terminal, cajero, fondo, estado abierto y hora del servidor
- Y cualquier depósito o retiro inicial queda asociado al turno.

#### Scenario: Venta sin turno

- Dada una venta de punto de venta sin un turno abierto del cajero y dispositivo actuales
- Cuando se intenta confirmar la operación
- Entonces el backend responde `CASH_SHIFT_REQUIRED`, `CASH_SHIFT_NOT_OPEN`, `CASH_SHIFT_CASHIER_MISMATCH` o `CASH_TERMINAL_DEVICE_MISMATCH`
- Y no crea venta, pago, movimiento de inventario ni cuenta por cobrar.

#### Scenario: Asociación directa y auditable

- Dado un turno abierto que pertenece al cajero autenticado y al dispositivo registrado
- Cuando se confirma una venta en el punto de venta
- Entonces la venta conserva `terminalId`, `cashShiftId`, `cashierUserId`, `businessDate`, `registeredAt` y `deviceId`
- Y los pagos y movimientos monetarios conservan `cashShiftId`
- Y el cierre diario consolida mediante los turnos, sin descubrir operaciones por rangos ambiguos.

### Requirement: Consolidación del cierre diario

El `PointOfSaleDailyClose` debe conservar todos los turnos, ventas, pagos y movimientos de la ubicación y fecha, pero el estado físico monetario consolidado debe incluir una sola posición vigente por terminal. Para cada `terminalId`, el backend excluye turnos `CANCELLED` y selecciona determinísticamente el último por `openedAt DESC`, `createdAt DESC` e `id DESC`.

Solo el turno seleccionado de cada terminal aporta fondo inicial neto, efectivo esperado, efectivo contado y diferencia al estado físico consolidado. El efectivo esperado de esa terminal se calcula con el fondo, depósito y retiro iniciales del turno seleccionado, más pagos `APPLIED` de método `CASH` asociados a ese turno, más movimientos no iniciales `CASH_IN` de canal `CASH`, menos `CASH_OUT`, `ADJUSTMENT` y gastos de canal `CASH` asociados al mismo turno. Los pagos y movimientos de turnos anteriores permanecen en los totales e historial de la jornada, pero no se vuelven a sumar sobre el fondo trasladado al turno sucesor.

Si el turno seleccionado está `OPEN`, su efectivo esperado vigente sí forma parte del consolidado, `cashCountedTotal` permanece nulo y el turno continúa como bloqueante. Si existen filas `CashShift` pero todas están `CANCELLED`, el estado físico de terminales aporta cero; los campos heredados del cierre solo se usan cuando no existe ninguna fila `CashShift`.

#### Scenario: Dos cajas en una sucursal

- Dadas `Caja 01` y `Caja 02` activas en la misma sucursal y fecha
- Cuando dos cajeros abren turnos en sus dispositivos registrados
- Entonces ambos turnos operan simultáneamente bajo el mismo cierre diario
- Y cada venta permanece atribuida a una sola terminal, turno y cajero.

#### Scenario: Reapertura secuencial en la misma terminal

- Dado un turno cerrado con conteo de 6,000.00 MXN
- Y un turno sucesor de la misma terminal que inicia con fondo trasladado de 6,000.00 MXN, recibe 200.00 MXN y cierra con 6,200.00 MXN
- Cuando se recalcula el cierre diario
- Entonces el estado físico consolidado de esa terminal registra efectivo esperado y contado de 6,200.00 MXN
- Y no suma 12,200.00 MXN por duplicar el conteo anterior y el fondo trasladado.

#### Scenario: Terminales paralelas y turno cancelado

- Dadas varias terminales con turnos en la misma jornada
- Y uno o más turnos cancelados
- Cuando se recalcula el cierre diario
- Entonces se suma la posición vigente seleccionada de cada terminal distinta
- Y ningún turno `CANCELLED` aporta fondo, esperado, conteo ni diferencia.

### Requirement: Cierre explícito de turnos antes de la jornada

La jornada debe cerrar sus turnos de caja de forma individual antes de permitir la transición del `PointOfSaleDailyClose` a `CLOSED`. Cada cajero captura el efectivo contado de su turno mediante `PATCH /api/cash-shifts/:id/close`; el sistema calcula y conserva la diferencia del turno. Abrir o cerrar un turno y registrar un movimiento del turno debe invalidar la validación vigente y recalcular el resumen diario dentro de la misma transacción, sin depender de una actualización posterior del frontend.

Toda mutación que requiera un cierre editable, incluidas las operaciones de `CashShift`, ventas POS, pagos asociados, gastos, conteo de efectivo, referencias de báscula, conteos de inventario, diferencias, validación y recálculo, debe serializarse con las transiciones de estado mediante el mismo bloqueo transaccional por identificador de cierre. Después de adquirirlo, el backend vuelve a comprobar autorización, estado `DRAFT` y versión esperada cuando aplique antes de escribir. Las mutaciones propias del cierre y de sus turnos se rechazan con `DAILY_CLOSE_NOT_EDITABLE` si una transición fuera de `DRAFT` gana la serialización; ventas POS, pagos asociados y otros dominios externos se rechazan con `DAILY_CLOSE_REOPEN_REQUIRED`. Si la mutación gana, revisión, cancelación o cierre observan su nueva versión y sus totales antes de intentar la transición.

El recálculo vuelve a comprobar `DRAFT` después de sincronizar operaciones y condiciona la escritura final por estado y versión. No puede persistir totales, validaciones o diferencias calculadas desde una lectura obsoleta después de que el cierre abandone `DRAFT`.

#### Scenario: Cajero cierra su turno

- Dado un `CashShift` abierto del cajero autenticado en el dispositivo registrado
- Cuando captura el efectivo contado y ejecuta `PATCH /api/cash-shifts/:id/close`
- Entonces el turno pasa a `CLOSED` con conteo, diferencia, actor y fecha
- Y el resumen diario refleja el turno cerrado y sus diferencias.

#### Scenario: Jornada con turnos abiertos

- Dado un cierre diario con uno o más `CashShift` en estado `OPEN`
- Cuando se intenta validar o cerrar la jornada
- Entonces la operación permanece bloqueada con `DAILY_CLOSE_HAS_OPEN_SHIFTS`
- Y la UI muestra "Hay turnos de caja abiertos. Cierra todos los turnos antes de finalizar la jornada.".

#### Scenario: Cancelación con turno abierto

- Dado un cierre diario `DRAFT` con uno o más `CashShift` en estado `OPEN`
- Cuando `ADMIN` intenta cancelar el cierre
- Entonces la operación permanece bloqueada con `DAILY_CLOSE_HAS_OPEN_SHIFTS`
- Y ningún turno abierto queda oculto, huérfano o impedido de cerrarse por la cancelación.

#### Scenario: Turno abandonado o terminal inaccesible

- Dado un turno abierto cuyo cajero o terminal no puede ejecutar el cierre normal
- Cuando un usuario con `cash_shifts.administrative_close` captura el efectivo y un motivo administrativo
- Entonces el mismo endpoint cierra el turno sin requerir el `deviceId` original
- Y conserva modo administrativo, motivo, actor, fecha, conteo y diferencia en la auditoría.

### Requirement: Reapertura exacta del turno de caja

Un turno `CLOSED` puede volver a `OPEN` únicamente en el mismo registro `CashShift`. La reapertura requiere al cajero propietario autenticado, el `deviceId` activo registrado de la terminal y la contraseña de la sesión confirmada por backend contra el `user.id` del principal autenticado. No existe una excepción administrativa de dispositivo para esta acción: el permiso de cierre administrativo no sustituye la propiedad del turno ni la terminal registrada.

La operación adquiere el bloqueo del cierre diario, comprueba que el padre esté en `DRAFT`, rechaza turnos `OPEN` o `CANCELLED` y conserva la regla de un solo turno `OPEN` por terminal. Limpia solo el estado de cierre obsoleto (`closedAt`, actor, modo, motivo, conteo y diferencia), conserva terminal, cajero, fecha, fondos, ventas, pagos y movimientos históricos, incrementa la versión, registra auditoría y recalcula el cierre. No crea un turno sucesor ni movimientos iniciales.

#### Scenario: Reabrir el mismo turno con contraseña válida

- Dado un turno `CLOSED` del cajero autenticado en su terminal registrada
- Y el cierre diario padre está en `DRAFT`
- Cuando el cajero confirma la reapertura con la contraseña de su sesión
- Entonces el `CashShift` conserva el mismo `id`, terminal, cajero, fecha, fondos, ventas, pagos y movimientos
- Y pasa a `OPEN` con `closedAt`, actor, modo, motivo, conteo y diferencia en `null`
- Y no se crea otro turno ni movimiento inicial
- Y el cierre diario se invalida y recalcula dentro de la misma transacción.

#### Scenario: Contraseña o identidad no autorizada

- Dado un turno `CLOSED`
- Cuando se envía una contraseña incorrecta, un usuario distinto al cajero propietario o un dispositivo distinto al registrado
- Entonces el backend rechaza la operación sin escribir el turno, movimientos ni auditoría de reapertura
- Y nunca valida la contraseña contra un identificador de usuario enviado por el cliente.

#### Scenario: Estado o cierre padre no elegible

- Dado un turno `OPEN` o `CANCELLED`, o un turno `CLOSED` cuyo cierre padre ya no está en `DRAFT`
- Cuando se solicita la reapertura
- Entonces la operación se rechaza sin crear turno ni movimiento y conserva todo el historial.

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

#### Scenario: Venta con cierre revisado o cerrado

- Dada una venta asociada a un cierre `REVIEWED` o `CLOSED`
- Cuando se intenta cancelar o anular la venta
- Entonces el endpoint responde `DAILY_CLOSE_REOPEN_REQUIRED`, no modifica pagos, inventario ni venta, y exige reapertura versionada del cierre antes de permitir la mutación operativa.

#### Scenario: Mutación de venta en borrador

- Dada una venta POS asociada a un cierre `DRAFT`
- Cuando se crea, cancela o anula la venta
- Entonces la operación adquiere el bloqueo del cierre antes de escribir
- Y relee estado y autorización bajo el bloqueo
- Y después de mutar invalida la validación vigente, incrementa la versión y recalcula el cierre dentro de la misma transacción.

### Requirement: Coordinación con ciclo CEDIS

El cierre MUST asociar el `BranchSupplyCycle` de la misma sucursal y fecha cuando exista. La validación y cierre MUST bloquearse si el ciclo carece de suministro confirmado, contiene transferencias pendientes o presenta errores de integridad.

#### Scenario: Cierre coordinado

- Dado un cierre `REVIEWED` y un ciclo `READY_FOR_REVIEW` con versiones vigentes
- Cuando `ADMIN` confirma el cierre
- Entonces cierre y ciclo pasan a `CLOSED` dentro de la misma transacción.

#### Scenario: Reapertura coordinada

- Dado un cierre y ciclo `CLOSED`
- Cuando `ADMIN` reabre el cierre con motivo y versión válidos
- Entonces el cierre vuelve a `DRAFT`, el ciclo a `OPEN` y ambos conservan snapshots y auditoría previos.

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

Para un `CashShift` `CLOSED` elegible en un cierre `DRAFT`, la UI debe mostrar al cajero propietario una acción `Reabrir turno`. La confirmación debe solicitar la contraseña de la sesión en un diálogo con etiqueta accesible, foco visible y campo de tipo contraseña; no debe mostrar ni aceptar un usuario alterno. Después de una reapertura correcta, la UI debe refrescar el mismo turno como `OPEN` y conservar visibles sus operaciones históricas.

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
- La política monetaria usa aritmética decimal exacta, importes en strings canónicos con dos decimales y redondeo `HALF_UP` centralizado.
- Catálogo final de entradas, salidas, gastos, métodos y bancos.
- Política de folios por ubicación y documento.
- Reglas de reapertura y bloqueo de periodos.
