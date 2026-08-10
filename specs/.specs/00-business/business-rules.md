# Reglas de Negocio

## 1. Inventario

- No se permite vender un producto si el stock disponible es menor a la cantidad solicitada.
- Todo producto debe tener nombre, precio de venta, costo y stock inicial.
- Todo producto debe definir su catálogo semántico: kilo, unidad entera o corte.
- Todo producto debe definir su unidad de venta operativa permitida: kilos, piezas o ambas.
- Cuando un producto se venda por kilo y por pieza, debe existir una equivalencia operativa entre pieza y peso para reportes, inventario y validaciones.
- Las cantidades en kilos deben permitir decimales. Las piezas deben manejarse como unidades enteras, salvo que el negocio autorice una regla explícita distinta.
- Los kilos, piezas, equivalencias y subtotales deben redondearse conforme a una política de redondeo definida por el negocio antes de implementar base de datos y cálculos definitivos.
- El precio de venta debe ser mayor a cero.
- El costo debe ser mayor o igual a cero.
- El stock no puede ser negativo.
- Cada movimiento de inventario debe quedar registrado.
- Cada movimiento de inventario debe registrar la ubicación operativa afectada.
- Los ajustes manuales de inventario requieren rol de administrador o almacenista autorizado.
- Los productos con stock menor o igual al mínimo definido deben marcarse como bajo inventario.
- La merma, desperdicio, diferencia de peso o pérdida operativa debe registrarse como movimiento de inventario con motivo obligatorio.
- La tolerancia aceptable de merma o diferencia de peso queda pendiente de definición de negocio.

## 1.1 Sucursales, almacenes y ubicaciones

- El sistema debe soportar múltiples ubicaciones operativas para inventario.
- Una ubicación operativa puede representar sucursal, almacén o una combinación de ambos, según la decisión final de negocio.
- El stock disponible debe consultarse por ubicación operativa y no solo como total global.
- Las compras deben incrementar stock en una ubicación operativa definida.
- Las ventas deben descontar stock de una ubicación operativa definida.
- Los ajustes deben afectar únicamente la ubicación operativa indicada.
- Deben existir traspasos entre almacenes o ubicaciones cuando el negocio opere más de un punto de stock.
- Todo traspaso debe registrar origen, destino, productos, cantidades, fecha, usuario responsable y estado.
- No se permite confirmar un traspaso si la ubicación origen no tiene stock suficiente.
- Queda pendiente definir si el almacén de descuento de una venta se determina por vendedor, sucursal, caja, pedido o selección manual autorizada.

## 1.2 Ciclos de suministro CEDIS-sucursal

- `BranchSupplyCycle` coordina una sucursal, un CEDIS y una fecha de negocio; no es una ubicación ni una fuente de inventario.
- Solo puede existir un ciclo no cancelado por sucursal y fecha.
- Un ciclo admite múltiples suministros CEDIS → sucursal y múltiples devoluciones sucursal → CEDIS.
- Cada suministro o devolución crea un `InventoryTransfer` `REQUESTED`; crear o vincular no modifica inventario.
- La recepción física se confirma mediante el flujo existente de traspasos. Solo `CONFIRMED` genera `TRANSFER_OUT` y `TRANSFER_IN` en una transacción.
- `DRAFT`, `REQUESTED` e `IN_TRANSIT` no cambian inventario y bloquean la revisión/cierre del ciclo.
- Una transferencia no confirmada puede cancelarse con actor, fecha y motivo. Una confirmada requiere una operación compensatoria y nunca se revierte borrando o cancelando sus movimientos.
- El ciclo conserva vínculos, eventos y snapshots derivados append-only. Estos datos no sustituyen `InventoryBalance`, `InventoryMovement` ni `PointOfSaleDailyClose`.
- Refrescar el ciclo reconstruye su proyección; no confirma, cancela ni corrige transferencias.
- Un ciclo `CLOSED` o `CANCELLED` es de solo lectura para suministros, devoluciones y refresh.
- Una devolución confirmada se contabiliza una sola vez como `TRANSFER_OUT` en la sucursal; no se resta nuevamente en el cierre.
- KG y PIECE se mantienen como dimensiones separadas. No debe existir conversión automática sin equivalencia oficial aplicable y política de redondeo aprobada.
- Toda mutación crítica debe ser transaccional, idempotente y versionada.

## 2. Ventas

- Una venta debe contener al menos un producto.
- El total de venta se calcula con la suma de subtotales por producto.
- Cada subtotal se calcula como cantidad multiplicada por precio unitario.
- Los importes monetarios se calculan con decimal exacto, se redondean con `HALF_UP` en el límite monetario definido y se serializan como strings con dos decimales.
- Ningún servicio ni cliente puede usar `number` para sumar, multiplicar o comparar dinero.
- Una venta confirmada debe descontar inventario.
- Una venta confirmada debe descontar inventario desde la ubicación operativa asociada a la venta.
- Una venta cancelada debe regresar inventario si ya había sido descontado.
- Solo administradores pueden cancelar ventas de otros usuarios.
- El vendedor solo puede cancelar ventas propias si la política del negocio lo permite.
- Toda venta debe registrar fecha, usuario, total, `paymentType`, `collectionStatus`, estado operativo, ubicación de descuento y tipo de documento interno.
- `paymentType` clasifica únicamente el tipo de venta: contado (`CASH_SALE`) o crédito (`CREDIT_SALE`). No representa abonos, mora ni antigüedad.
- `collectionStatus` clasifica únicamente el estado del saldo o cobranza: no pagado, parcialmente pagado, pagado o cancelado.
- `agingStatus` clasifica únicamente la antigüedad o mora de una cuenta por cobrar: vigente, por vencer o vencida. No es un tipo ni un estado operativo de `Sale`.
- `paymentMethod` pertenece exclusivamente a `Payment`; `Sale` no lo persiste. Cuando se muestre junto a una venta, debe derivarse de sus pagos relacionados.
- Una venta a crédito requiere cliente registrado y autorización de crédito vigente.
- Una venta de contado (`CASH_SALE`) solo puede confirmarse cuando la suma de sus pagos aplicados iguala el total de la venta; no puede dejar saldo pendiente ni crear una cuenta por cobrar.
- Un pago parcial requiere cambiar explícitamente `paymentType` a `CREDIT_SALE`, sujeto a las validaciones de límite, mora y bloqueo crediticio.
- No se debe permitir una venta a crédito si el cliente está bloqueado por mora o excede su límite de crédito, salvo autorización administrativa explícita.
- El sistema debe calcular importes a partir de precios autorizados; los descuentos requieren autorización conforme a rol o política del negocio.
- La venta debe conservar `saleChannel`, `documentType`, folio físico cuando aplique, y quién entregó o cobró cuando el flujo lo requiera.
- Una venta asociada a un cierre POS `REVIEWED`, `CLOSED` o `CANCELLED` no puede crearse, cancelarse ni anularse; la operación requiere reapertura versionada y responde `DAILY_CLOSE_REOPEN_REQUIRED`.
- Las mutaciones de una venta POS asociada a un cierre `DRAFT` deben serializarse con el bloqueo del cierre e invalidar, versionar y recalcular el cierre dentro de la misma transacción.
- La venta facturable administrativa solo expresa relación comercial interna; no genera CFDI, SAT, PAC ni timbrado.

## 3. Compras

- Una compra debe contener proveedor y al menos un producto.
- Una compra de proveedor externo solo puede incrementar inventario en un CEDIS activo (`DISTRIBUTION_CENTER`).
- Una sucursal no puede recibir compras externas; solo recibe mediante un traspaso confirmado desde su CEDIS padre.
- Una compra confirmada debe incrementar inventario.
- El costo de producto puede actualizarse al registrar una compra si el administrador lo permite.
- No se puede eliminar una compra confirmada; debe cancelarse mediante estatus.
- La cancelación de una compra debe revertir el inventario si aplica.

## 4. Clientes

- El cliente puede ser opcional en venta de mostrador.
- Para ventas a crédito, el cliente es obligatorio.
- Un cliente debe tener nombre.
- Teléfono y dirección son opcionales, pero recomendados.
- No se deben duplicar clientes con el mismo teléfono si el teléfono existe.
- Un cliente mayorista o institucional es un cliente registrado que compra para reventa, negocio, restaurante, comercio o consumo recurrente de volumen, y que puede tener condiciones comerciales diferenciadas.
- Un cliente facturado debe conservar número interno, razón social, RFC, alias y correo administrativo.
- Un cliente mayorista o institucional debe tener clasificación o tipo de cliente definido.
- Las condiciones mayoristas e institucionales pueden incluir lista de precios, límite de crédito, días de crédito, ruta asociada, dirección fiscal o dirección de entrega.
- Las ventas mayoristas e institucionales deben conservar trazabilidad de cliente, vendedor, ubicación de descuento, condiciones de pago y entrega.

## 4.1 Cuentas por cobrar y cobranza

- Toda venta que deje saldo pendiente debe generar o actualizar una cuenta por cobrar asociada al cliente. Un pago inmediato de contado no crea una cuenta por cobrar artificial.
- Cada cuenta por cobrar debe registrar saldo original, saldo pendiente, fecha de venta, fecha de vencimiento, días de crédito, fecha del último pago, estado y cliente.
- Se permiten pagos parciales y pagos totales.
- Todo pago debe registrar fecha, monto, método de pago, banco cuando aplique, usuario que lo registró, referencia y documento aplicado.
- Un pago no puede exceder el saldo pendiente, salvo que exista una regla explícita para anticipos o saldos a favor.
- `AccountReceivable.status` debe identificar el estado de cobranza: no pagada, parcialmente pagada, pagada o cancelada.
- `AccountReceivable.agingStatus` debe identificar por separado el envejecimiento: vigente, por vencer o vencida.
- Un cliente debe considerarse moroso cuando tenga saldo vencido conforme a sus días de crédito o fecha de vencimiento.
- El límite de crédito debe validar el saldo pendiente acumulado del cliente antes de permitir nuevas ventas a crédito.
- Un cliente bloqueado por mora o exceso de límite no debe recibir nuevas ventas a crédito sin autorización administrativa explícita.
- El bloqueo automático por mora debe respetar la política comercial efectiva: `BLOCK_NEW_CREDIT` bloquea crédito nuevo, `WARN_ONLY` informa sin bloquear y la ausencia de modo no crea bloqueo automático.
- `Customer.creditStatus` conserva el estado administrativo; la mora y el exceso de límite producen una decisión efectiva derivada y no deben sobrescribir ese estado.
- Una cuenta entra en mora a las 00:00 del día calendario siguiente a `dueDate` en la zona horaria operativa. `DUE_SOON` comprende los siete días previos y el propio día de vencimiento.
- La cancelación de una venta a crédito debe ajustar o cancelar la cuenta por cobrar relacionada según corresponda.
- El crédito no recuperado al día siguiente conserva su condición de atrasado hasta que se pague o se cancele conforme a regla.

## 4.2 Clientes facturados y solicitud administrativa

- Un cliente facturado debe conservar número interno, RFC, razón social, alias o nombre comercial y correo administrativo.
- La solicitud administrativa de factura es una relación interna y no genera CFDI, SAT, PAC ni timbrado.
- El saldo global por cliente es la suma de todas sus cuentas por cobrar vigentes, por vencer, vencidas y atrasadas.
- Los pagos deben asociarse a una sola cuenta por cobrar en MVP y conservar banco, referencia y documento aplicado.
- Las notas canceladas no deben generar saldo ni afectar la cartera final.

## 5. Rutas y reparto

- Toda ruta operativa debe tener una `OperationalLocation` asociada de tipo `ROUTE_STOCK`.
- La carga de producto a ruta se realiza mediante `InventoryTransfer` desde almacén/sucursal hacia `ROUTE_STOCK`.
- La devolución de sobrante se realiza mediante `InventoryTransfer` desde `ROUTE_STOCK` hacia almacén/sucursal.
- Toda venta asignada a ruta descuenta inventario desde `ROUTE_STOCK`, no desde la ubicación origen de carga.
- No puede existir una ruta con ventas, devoluciones o diferencias sin ubicación operativa trazable.
- Toda diferencia detectada al cierre de ruta debe resolverse mediante liquidación y movimientos trazables; no puede ocultarse ni compensarse por fuera del flujo.
- Solo pedidos confirmados pueden asignarse a ruta.
- Una ruta puede tener varios pedidos.
- Un pedido asignado a ruta puede tener estados: pendiente, en ruta, entregado, no entregado, cancelado.
- El repartidor solo puede actualizar pedidos asignados a su usuario.
- La entrega debe registrar fecha y hora.
- La evidencia de entrega forma parte del alcance operativo del MVP para pedidos de reparto.
- La evidencia puede incluir fotografía, firma, geolocalización, notas de incidencia o combinación de estos elementos; la obligatoriedad exacta queda pendiente de decisión de negocio.
- El chofer debe poder registrar entrega, no entrega, devolución, rechazo parcial o incidencia.
- El chofer debe poder registrar cobros recibidos en ruta cuando el pedido tenga saldo por cobrar y la política del negocio lo permita.
- La cobranza puede ocurrir en una segunda vuelta por el mismo u otro repartidor, y debe conservar esa trazabilidad.
- La operación de reparto debe contemplar liquidación o cierre de ruta para comparar pedidos entregados, productos devueltos, dinero cobrado, transferencias/depositos y saldos que pasan a crédito atrasado.
- Queda pendiente definir si la experiencia móvil de choferes debe funcionar sin conexión, qué datos se almacenan temporalmente y cuál es la ventana máxima permitida sin sincronización.

## 6. Caja

- Cada dinero recibido debe registrar método de pago mediante `Payment`; `Sale` no persiste `paymentMethod`.
- `paymentType` en venta clasifica solo contado (`CASH_SALE`) o crédito (`CREDIT_SALE`).
- El estado de cobranza se representa con `collectionStatus` y la mora/antigüedad con `agingStatus`; no deben mezclarse con `paymentType`.
- El corte de caja debe sumar ingresos por método de pago y separar ventas a crédito sin efectivo recibido.
- Solo administradores pueden consultar cortes globales.
- Vendedores pueden consultar su propio corte diario.
- Los cobros de cuentas por cobrar deben distinguirse de ventas de contado del día para fines de corte y reporte.
- Los cobros recibidos por chofer deben considerarse dentro de la liquidación de ruta antes de integrarse al corte correspondiente.
- Los abonos y transferencias/depositos deben conservar su origen operativo antes de consolidarse en caja o cobranza.
- Toda venta registrada en un punto fijo requiere un `CashShift` abierto que pertenezca al cajero autenticado y a un `CashTerminal` activo cuyo `deviceId` coincida con el dispositivo registrado.
- La venta conserva `terminalId`, `cashShiftId`, `cashierUserId`, `businessDate`, `registeredAt` y `deviceId`; estos valores se derivan y sellan en backend, no se aceptan como autoridad del cliente.
- Todo pago o movimiento monetario recibido en un punto fijo conserva `cashShiftId`; no espera asociación posterior por ubicación y rango de fechas.

## 6.1 Facturación y comprobantes

- En el MVP, el comprobante de venta es un ticket, nota sencilla, nota grande o comprobante interno.
- El ticket interno no es CFDI y no debe presentarse como factura fiscal.
- La solicitud administrativa de factura es una relación comercial interna, no una factura fiscal.
- La emisión de factura fiscal, timbrado CFDI o integración directa con SAT queda fuera del MVP.
- El sistema puede conservar datos comerciales necesarios para una futura fase fiscal, sin asumir reglas técnicas de facturación fiscal en el MVP.
- La solicitud administrativa de factura no debe disparar CFDI ni sustituir un comprobante interno.

## 6.2 Reportes operativos

- Los reportes de ventas, inventario, cobranza, pagos con banco y reparto deben basarse en operaciones confirmadas.
- Para el MVP, “tiempo real” significa latencia máxima de 60 segundos en condiciones normales de operación.
- Los reportes deben permitir distinguir ventas de contado, ventas a crédito, cobros, saldos vencidos, cartera por cliente, stock por ubicación, pagos por método/banco y pedidos por estado de reparto.
- Los reportes financieros globales solo deben estar disponibles para roles autorizados.
- Los reportes operativos pueden mostrar datos casi en tiempo real sin sustituir cortes de caja, liquidaciones de ruta o cierres contables.

## 7. Seguridad

- Todas las acciones deben requerir autenticación excepto login.
- Los permisos deben controlarse por rol.
- Las contraseñas deben guardarse con hash seguro.
- No se deben exponer contraseñas en respuestas API.
- Los tokens deben tener expiración.

## 8. Puntos de venta externos

- Todo punto de venta externo debe existir como `OperationalLocation` activa antes de registrar operaciones.
- Todo envío de producto desde matriz a un punto externo debe registrarse como traspaso o movimiento de inventario trazable; nunca como modificación de stock global.
- Toda venta debe conservar la ubicación operativa desde la que descuenta inventario.
- Público general puede comprar sin cliente registrado; una venta a crédito, una nota grande o una solicitud administrativa de factura requiere cliente registrado.
- Los clientes fijos pueden usar precios específicos solo mediante política comercial o autorización trazable; el frontend no es fuente de verdad del precio.
- La venta debe identificar su canal y documento interno: ticket/etiqueta de báscula, nota simple, nota grande o comprobante interno.
- La solicitud administrativa de factura se modela por separado como `BillingRequest` y no como tipo documental de `SaleDocument`.
- El ticket de báscula se captura manualmente en el MVP. No se permite asumir lectura, sincronización o integración automática con la báscula.
- Ticket, etiqueta, nota y cierre diario son documentos internos y no deben presentarse como CFDI, factura fiscal o comprobante timbrado.
- El tipo canónico para pollerías o puntos fijos externos es `EXTERNAL_POINT_OF_SALE`.

## 8.1 Cierre diario de punto de venta

- Debe existir como dominio separado de `RouteSettlement` y asociarse a una `OperationalLocation` y una fecha de negocio.
- `PointOfSaleDailyClose` representa el consolidado de sucursal y fecha; no representa una terminal ni un turno.
- `CashTerminal` es una entidad administrada con `deviceId` único. `CashShift` conserva terminal, cajero, fecha de negocio, fondo inicial, entradas, retiros, gastos, conteo y diferencia.
- Solo puede existir un `CashShift` abierto por terminal. Varias terminales pueden operar en paralelo y una terminal puede tener turnos secuenciales durante la misma fecha.
- Solo puede existir un cierre diario no cancelado por ubicación y fecha; el cierre consolida sus turnos y no puede cerrarse mientras alguno permanezca abierto.
- El estado físico monetario consolidado selecciona por cada terminal el último turno no cancelado mediante `openedAt DESC`, `createdAt DESC` e `id DESC`; solo esos turnos aportan fondo, efectivo esperado, conteo y diferencia. La operación e historial completos de la jornada permanecen visibles.
- El efectivo esperado de cada terminal usa exclusivamente el fondo neto, pagos `APPLIED` en `CASH` y movimientos no iniciales de canal `CASH` asociados a su turno seleccionado. Un turno sucesor no vuelve a sumar los pagos del turno cuyo conteo recibió como fondo trasladado.
- Un turno seleccionado `OPEN` aporta su esperado vigente, mantiene nulo el conteo consolidado y bloquea el cierre. Si existen turnos pero todos están `CANCELLED`, aportan cero; el cálculo heredado solo aplica cuando no existe ningún `CashShift`.
- Reabrir un turno significa reactivar el mismo `CashShift` cerrado, conservando su terminal, cajero, fecha, ventas, pagos y movimientos históricos; no crea un turno sucesor ni movimientos iniciales nuevos. Solo puede hacerlo el cajero propietario autenticado desde el `deviceId` registrado de la terminal, con la contraseña de su sesión verificada contra el usuario autenticado; no se acepta un identificador de usuario enviado por el cliente.
- La reapertura de un `CashShift` exige que su cierre diario padre permanezca en `DRAFT` y rechaza turnos `OPEN` o `CANCELLED`. Al reactivar, limpia únicamente el estado de cierre obsoleto (`closedAt`, actor, modo, motivo, conteo y diferencia), conserva los datos operativos y aumenta la versión.
- Toda mutación que requiera un `PointOfSaleDailyClose` editable y toda transición de estado participan en el mismo bloqueo transaccional por cierre. Bajo el bloqueo se revalidan autorización, estado `DRAFT` y versión cuando aplique; el recálculo y la validación usan además una escritura final condicionada para no persistir resultados obsoletos.
- Debe iniciar en `DRAFT`; puede pasar a `REVIEWED`, `CLOSED` o `CANCELLED` conforme a permisos.
- No puede cerrarse si alguna venta, movimiento de inventario, movimiento de caja o pago incluido carece de ubicación operativa trazable.
- Debe conciliar entradas, ventas por nota, ventas por ticket/etiqueta, otras salidas, sobrantes y faltantes por producto y unidad.
- Debe separar efectivo, boucher/tarjeta, transferencia, cobranza y otros métodos autorizados.
- Los gastos en caja deben registrarse como `CashMovement` asociado a la ubicación y, cuando corresponda, al cierre.
- `CashMovement` clasifica entradas y salidas operativas de caja mediante `movementChannel`; no sustituye a `Payment` ni registra cobranza por sí mismo.
- La referencia de báscula debe conservar folio físico y datos capturados; nunca debe reemplazar a la venta ni modificar inventario por sí sola.
- Las diferencias entre venta registrada, referencia de báscula, existencia física e ingresos esperados deben mostrarse y conservarse; no deben ocultarse ni compensarse automáticamente.
- Las tolerancias pueden generar advertencias, pero no deben inventarse hasta que negocio las apruebe.
- Confirmar, cancelar o reabrir un cierre debe exigir motivo, usuario y sello de tiempo, y ejecutarse transaccionalmente cuando afecte saldos o estados relacionados.
- El cierre diario no retrasa ni sustituye los reportes operativos casi en tiempo real.

## 8.2 Pagos y cobranza dentro del cierre

- Todo pago de cobranza incluido en un cierre conserva `Payment.accountReceivableId` obligatorio y aplica a una sola cuenta por cobrar.
- `PaymentAllocation` permanece fuera del MVP.
- Un pago inmediato de venta de contado puede entrar al cierre asociado a `saleId` sin crear una cuenta por cobrar artificial.
- Un pago capturado en punto de venta debe conservar la ubicación operativa; un cobro en ruta se concilia mediante `RouteSettlement`, no mediante el cierre fijo, salvo transferencia administrativa explícita y trazable.
- Las ventas a crédito no deben sumarse como efectivo recibido; solo sus pagos aplicados se incluyen en ingresos cuando corresponda.

## 8.3 Permisos del cierre

- `ADMIN`: crea, revisa, cierra, cancela y reabre conforme a política.
- `SELLER`: captura ventas, referencias manuales y movimientos permitidos; consulta y edita el borrador de su ubicación.
- `WAREHOUSE`: consulta traspasos, entradas y kilos enviados para conciliación; no altera ingresos.
- `COLLECTIONS`: consulta cobros e ingresos autorizados; no modifica inventario.
- No se agrega `CASHIER` al MVP; su necesidad queda como decisión abierta.

## 8.4 Decisiones abiertas del cierre

- Definir tolerancias y escalamiento para diferencias de peso y dinero.
- Definir fórmulas oficiales de costo y utilidad.
- El sistema soporta múltiples terminales y turnos independientes por ubicación y fecha mediante `CashTerminal` y `CashShift`.
- Definir catálogo final de gastos, entradas, salidas y otros conceptos.
- Definir política de reapertura y bloqueo de periodos ya revisados.

## 9. Conciliación post-MVP de facturas externas

- Una factura registrada por el ERP debe haber sido emitida externamente; el sistema no emite, timbra ni cancela CFDI ante SAT.
- `SaleDocument` es la unidad facturable y `SaleItem` la unidad de detalle; `BillingRequest`, `Invoice`, `Sale` y `Payment` son conceptos separados.
- `LegalEntity` es el emisor fiscal y no equivale a una ubicación operativa.
- Toda agrupación debe compartir cliente, perfil fiscal, moneda, entidad emisora y condiciones compatibles.
- La política inicial permite `SIMPLE_NOTE` y `LARGE_NOTE`; `INTERNAL_RECEIPT` requiere habilitación explícita y `SCALE_TICKET` no es facturable por sí solo.
- La fecha límite se deriva de la política y zona horaria operativa; una excepción vencida requiere `ADMIN`, motivo y auditoría.
- No se puede solicitar ni aplicar un importe superior al saldo disponible.
- Vincular, cancelar o sustituir una factura no crea ni modifica ventas, pagos o movimientos de inventario.
- `PaymentAllocation` permanece fuera del modelo; el cobro se deriva desde `Payment` y `AccountReceivable`.

### Permisos

- `BILLING` consulta notas globales, aprueba o rechaza solicitudes, bloquea incidencias, vincula facturas externas y exporta información; no modifica inventario ni registra pagos.
- `SELLER` solo consulta notas propias y crea solicitudes permitidas.
- `COLLECTIONS` consulta pagos y conciliación autorizada, pero no vincula facturas.
- `WAREHOUSE` y `DRIVER` no acceden al módulo ni a datos fiscales sensibles.

El contrato completo está en `specs/modules/billing-reportable-notes/spec.md`.
