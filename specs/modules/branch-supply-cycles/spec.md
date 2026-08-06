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

### Suministros y devoluciones

El sistema MUST admitir múltiples suministros CEDIS → sucursal y múltiples devoluciones sucursal → CEDIS. Cada operación MUST crear un `InventoryTransfer` `REQUESTED` y vincularlo una sola vez al ciclo.

Una sucursal MUST NOT recibir inventario de proveedores externos ni mediante un traspaso genérico no vinculado. Todo suministro hacia una sucursal MUST originarse en su CEDIS padre y MUST pertenecer a un ciclo de suministro.

#### Scenario: Creación sin movimiento

- GIVEN un ciclo mutable y partidas válidas
- WHEN se registra un suministro o devolución
- THEN transferencia, vínculo y auditoría se crean atómicamente
- AND no cambia ningún balance ni se crea movimiento

### Confirmación y cancelación

Los comandos existentes de inventario MUST seguir siendo la única vía para confirmar o cancelar transferencias. Confirmar MUST aplicar `TRANSFER_OUT` y `TRANSFER_IN` atómicamente; cancelar MUST limitarse a transferencias no confirmadas.

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
en la sucursal únicamente lo recibido y registrar la diferencia como movimiento
trazable: `SHRINKAGE` cuando falte mercancía o `IN` cuando exista sobrante. Una
diferencia MUST requerir una nota no vacía.

#### Scenario: Recepción exacta

- GIVEN un suministro `REQUESTED` con stock suficiente en el CEDIS
- WHEN un usuario autorizado registra las mismas cantidades recibidas
- THEN se confirma el suministro, el CEDIS descuenta lo enviado y la sucursal recibe lo mismo
- AND la diferencia queda en cero

#### Scenario: Recepción con diferencia

- GIVEN un suministro `REQUESTED` con cantidades enviadas mayores que las recibidas
- WHEN la sucursal registra una nota y las cantidades físicas recibidas
- THEN el CEDIS descuenta lo enviado, la sucursal conserva como saldo lo recibido
- AND se registra una merma trazable por la diferencia

#### Scenario: Sobrante recibido

- GIVEN un suministro `REQUESTED` con una cantidad recibida mayor que la enviada
- WHEN la sucursal registra una nota y la cantidad física
- THEN el CEDIS descuenta lo enviado, la sucursal recibe un ajuste `IN` trazable

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
- THEN una confirma y la otra recibe stock insuficiente sin saldo negativo

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
