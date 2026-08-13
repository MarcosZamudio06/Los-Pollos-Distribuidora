# Module Spec — Ciclos de suministro CEDIS-sucursal

## Objetivo

Coordinar la jornada de suministro entre un CEDIS y una sucursal mediante ciclos que vinculan traspasos de inventario, sin crear stock ni movimientos paralelos.

## Requisitos

### Ciclo único y ubicaciones

El sistema MUST mantener como máximo un ciclo no cancelado por sucursal y fecha de negocio. El CEDIS MUST ser una ubicación activa `DISTRIBUTION_CENTER` y la sucursal una hija directa activa `BRANCH`.

#### Scenario: Apertura válida

- GIVEN CEDIS y sucursal compatibles sin ciclo activo para la fecha
- WHEN un usuario autorizado abre el ciclo
- THEN el ciclo queda `OPEN` con actor, fecha, versión y evento auditables

#### Scenario: Apertura concurrente

- GIVEN dos solicitudes para la misma sucursal y fecha
- WHEN se ejecutan concurrentemente
- THEN PostgreSQL conserva un solo ciclo activo y la otra solicitud recibe conflicto

### Motor de conciliación

El refresh MUST reconstruir la conciliación desde transferencias confirmadas,
ventas confirmadas de la sucursal y fecha, cierre diario, pagos, movimientos de
caja, gastos, mermas y diferencias. Por producto debe conservar las dimensiones
KG y PIECE y calcular `entregado`, `devuelto`, `vendidoEsperado`, `ventaEsperada`,
`costoEsperado` y `utilidadBrutaEsperada`. También debe proyectar vendido real,
venta real, costo real, utilidad bruta y neta, merma documentada y diferencia no
explicada.

`vendidoEsperado` MUST be `entregado - devuelto`. `ventaEsperada` (the expected
amount) MUST be `(entregado - devuelto) * unitPriceSnapshot`, and
`costoEsperado` MUST be `entregado * unitCostSnapshot`. A return reduces the
expected amount by the sale price of the quantity that was not sold.

Los snapshots de precio y costo se crean al primer suministro del producto por
ciclo. Son append-only y no se reemplazan si cambia el catálogo posteriormente.

Para `KG_AND_PIECE`, una cantidad medida directamente en kilos tiene prioridad
para valorar la operación; una cantidad capturada solo en piezas requiere una
equivalencia activa y su factor/redondeo persistidos. No se suman dos veces las
dimensiones equivalentes.

#### Scenario: Ejemplo de piezas

- GIVEN 10 piezas entregadas y 3 piezas devueltas
- WHEN se refresca la conciliación
- THEN `vendidoEsperado = 10 - 3 = 7` piezas
- AND con `unitPriceSnapshot = 100`, `ventaEsperada = 7 * 100 = 700`

### Suministros y devoluciones

El sistema MUST admitir múltiples suministros CEDIS → sucursal y múltiples devoluciones sucursal → CEDIS. Cada operación MUST crear un `InventoryTransfer` `REQUESTED` y vincularlo una sola vez al ciclo.

Una sucursal MUST NOT recibir inventario de proveedores externos ni mediante un traspaso genérico no vinculado. Todo suministro hacia una sucursal MUST originarse en su CEDIS padre y MUST pertenecer a un ciclo de suministro.

Toda transferencia `REQUESTED` o `IN_TRANSIT` MUST reservar en su ubicación de
origen las cantidades de cada dimensión. La mercancía permanece físicamente en
el origen hasta la confirmación; la reserva reduce la disponibilidad sin crear
una ubicación virtual ni un movimiento físico.

Una devolución MUST NOT superar, por producto y dimensión, la cantidad no
vendida disponible del ciclo: `entregado - vendidoReal - devueltoConfirmado`.
También MUST respetar la disponibilidad física actual de la sucursal; el
servidor debe rechazar el comando antes de crear una reserva si cualquiera de
los límites se excede.

#### Scenario: Creación sin movimiento

- GIVEN un ciclo mutable y partidas válidas
- WHEN se registra un suministro o devolución
- THEN transferencia, vínculo, reserva y auditoría se crean atómicamente
- AND no cambia las cantidades físicas del balance ni se crea movimiento

#### Scenario: Creación con stock insuficiente

- GIVEN un suministro CEDIS → sucursal cuya cantidad supera la disponibilidad no reservada en el CEDIS
- WHEN se registra el suministro
- THEN la operación se rechaza con `INSUFFICIENT_STOCK`
- AND no crea transferencia, vínculo, evento ni movimientos parciales
- AND no crea una reserva parcial
- AND la confirmación conserva una revalidación atómica para impedir saldo negativo

### Cola y recepción CEDIS de devoluciones

Una devolución `RETURN` solicitada queda `PENDING` mientras el `InventoryTransfer` esté `REQUESTED` o `IN_TRANSIT`; queda `COMPLETED` únicamente al confirmar y `CANCELLED` si se cancela. La cola de CEDIS conserva ciclo, sucursal, CEDIS, folio, productos, cantidades, notas, solicitante y timestamps. Solo `ADMIN` o `WAREHOUSE` con `cedis.receive_returns` y alcance del CEDIS pueden marcarla recibida. La acción reutiliza la confirmación atómica e idempotente de `InventoryTransfer`; no crea otra entidad ni movimientos alternos.

### Confirmación y cancelación

Los comandos existentes de inventario MUST seguir siendo la única vía para confirmar o cancelar transferencias. Confirmar MUST aplicar `TRANSFER_OUT` y `TRANSFER_IN` atómicamente; cancelar MUST limitarse a transferencias no confirmadas.

Confirmar MUST consumir exactamente la reserva del origen. Cancelar MUST
liberar exactamente la reserva del origen y no debe crear movimientos físicos.

#### Scenario: Confirmación con stock

- GIVEN una transferencia vinculada y stock suficiente en origen
- WHEN el destino confirma la recepción
- THEN inventario genera ambos movimientos y el ciclo queda invalidado para nuevo refresh

#### Scenario: Corrección posterior

- GIVEN una transferencia `CONFIRMED`
- WHEN se solicita cancelarla
- THEN la operación se rechaza y cualquier corrección requiere operación compensatoria auditable

### Recepción de suministros en sucursal

Cada suministro CEDIS → sucursal MUST conservar sus cantidades enviadas y admitir
como máximo una recepción física. La recepción MUST registrar por partida la
cantidad enviada, la cantidad recibida, la diferencia por KG y PIECE, el actor,
la fecha y una nota opcional. Las cantidades enviadas nunca se sobrescriben.

La confirmación desde sucursal MUST descontar del CEDIS lo enviado, incrementar
en la sucursal únicamente lo recibido y conservar la diferencia de tránsito en
`BranchSupplyReceiptItem`, separada del libro físico de `InventoryMovement`. Una
diferencia MUST requerir una nota no vacía. La conciliación MUST considerar como
entregado lo recibido y MUST NOT reclasificar el faltante de tránsito como merma
física de la sucursal ni el sobrante como una segunda entrada.

#### Scenario: Recepción exacta

- GIVEN un suministro `REQUESTED` con stock suficiente en el CEDIS
- WHEN un usuario autorizado registra las mismas cantidades recibidas
- THEN se confirma el suministro, el CEDIS descuenta lo enviado y la sucursal recibe lo mismo
- AND la diferencia queda en cero

#### Scenario: Recepción con diferencia

- GIVEN un suministro `REQUESTED` con cantidades enviadas mayores que las recibidas
- WHEN la sucursal registra una nota y las cantidades físicas recibidas
- THEN el CEDIS descuenta lo enviado, la sucursal conserva como saldo lo recibido
- AND la diferencia queda trazable en la recepción sin crear una merma física en la sucursal

#### Scenario: Sobrante recibido

- GIVEN un suministro `REQUESTED` con una cantidad recibida mayor que la enviada
- WHEN la sucursal registra una nota y la cantidad física
- THEN el CEDIS descuenta lo enviado, la sucursal recibe la cantidad física una sola vez
- AND el sobrante queda trazable en la recepción sin crear un segundo movimiento `IN`

#### Scenario: Recepción idempotente

- GIVEN una clave de idempotencia ya utilizada con el mismo payload
- WHEN se repite la recepción
- THEN devuelve la recepción original sin duplicar movimientos ni incrementar otra vez la versión del ciclo

### Refresh y elegibilidad

El sistema MUST reconstruir snapshots append-only desde transferencias y movimientos confirmados. `DRAFT`, `REQUESTED` e `IN_TRANSIT` MUST bloquear revisión; `CANCELLED` MUST conservarse con contribución cero.

#### Scenario: Ciclo listo

- GIVEN al menos un suministro confirmado, cero pendientes e integridad válida
- WHEN se refresca el ciclo
- THEN crea una nueva versión de snapshot y pasa a `READY_FOR_REVIEW`

El cierre CEDIS MUST rechazar transferencias pendientes, turnos de caja abiertos,
un cierre diario que no esté en `REVIEWED` o `CLOSED`, cantidades negativas,
diferencias obligatorias sin justificar y productos sin precio o costo snapshot
válido. Cuando el cierre diario esté en `REVIEWED`, el cierre CEDIS MUST
coordinar la transición de ambos agregados a `CLOSED` en una sola transacción.

El cierre MUST persistir un snapshot inmutable de la conciliación y un evento
append-only. La reapertura administrativa MUST requerir `ADMIN`, motivo y
`expectedVersion`, conservar los snapshots anteriores y llevar el ciclo a
`OPEN` sin revertir operaciones.

#### Scenario: Ciclo cerrado

- GIVEN un ciclo `CLOSED` o `CANCELLED`
- WHEN se intenta suministrar, devolver o refrescar
- THEN la operación se rechaza sin modificar historial

### Unidades, idempotencia y concurrencia

El sistema MUST mantener KG y PIECE como dimensiones separadas, exigir piezas enteras y MUST NOT convertir sin equivalencia oficial aplicable. Todo comando MUST ser transaccional, versionado e idempotente.

#### Scenario: Reintento seguro

- GIVEN una clave ya usada con el mismo payload
- WHEN se repite el comando
- THEN devuelve el resultado original sin duplicar ciclo, transferencia, vínculo, snapshot o movimiento

#### Scenario: Stock concurrente

- GIVEN dos confirmaciones que compiten por el mismo saldo
- WHEN el stock solo alcanza para una
- THEN una confirma y la otra recibe stock insuficiente sin saldo negativo ni reserva negativa

## Permisos

- `cedis.view`: lectura dentro del alcance.
- `cedis.dispatch`: suministros desde el CEDIS asignado.
- `cedis.receive_supplies`: recepción de suministros destinados a la sucursal autorizada.
- `cedis.receive_returns`: devoluciones hacia el CEDIS asignado.
- `cedis.reconcile`: refresh y conciliación.
- `cedis.close`: cierre coordinado.
- `cedis.view_costs`: costos y utilidad.

## Contratos relacionados

- `specs/.specs/03-api/branch-supply-cycles-api.md`.
- `specs/.specs/03-api/inventory-transfers-api.md`.
- `specs/modules/inventory/spec.md`.
- `specs/modules/point-of-sale-closing/spec.md`.
