# Criterios de Aceptación de Pruebas

Estos criterios alinean QA con el MVP vigente: inventario por ubicación operativa, ventas de contado y crédito, cobranza, reparto, liquidación de ruta, ticket interno y reportes operativos casi en tiempo real. Las reglas críticas deben validarse principalmente en backend; el frontend debe cubrir interacción, permisos visibles y manejo de errores.

## Alcance transversal

- Dado un usuario no autenticado, cuando intenta acceder a una ruta protegida o endpoint privado, entonces el sistema bloquea el acceso.
- Dado un usuario autenticado con rol insuficiente, cuando intenta ejecutar una acción restringida, entonces recibe denegación de permisos y no se modifica información.
- Dado cualquier endpoint protegido, cuando responde datos de usuario, entonces no expone `passwordHash`, secretos ni datos sensibles innecesarios.
- Dado cualquier respuesta API exitosa o de error, cuando se consume desde frontend, entonces mantiene el formato definido en `api-conventions.md`.
- Dado un flujo que modifica ventas, compras, inventario, cuentas por cobrar, pagos, rutas o liquidaciones, cuando ocurre un conflicto de negocio, entonces la operación se rechaza sin dejar cambios parciales.

## Roles y permisos

- Dado un usuario `ADMIN`, cuando accede a módulos administrativos, entonces puede operar inventario, ventas, clientes, compras, cobranza, rutas, liquidaciones, reportes, usuarios, políticas comerciales y configuración operativa según specs.
- Dado un usuario `SELLER`, cuando opera POS, entonces puede registrar ventas autorizadas, consultar productos disponibles por ubicación y ver ventas propias; no puede modificar inventario, costos ni reportes financieros globales.
- Dado un usuario `WAREHOUSE`, cuando opera inventario o compras, entonces puede gestionar productos, saldos, ajustes, movimientos, traspasos y compras conforme a permisos; no puede registrar ventas ni consultar ingresos financieros globales.
- Dado un usuario `SELLER`, `WAREHOUSE` o `ADMIN` con `cedis.receive_supplies`, cuando consulta recepción CEDIS, entonces solo ve suministros dentro de su alcance operativo y puede recibirlos conforme a la ubicación autorizada.
- Dado un usuario `DRIVER`, cuando consulta reparto, entonces solo ve rutas y pedidos asignados a su usuario; no puede crear productos, modificar precios, cancelar ventas ni ver reportes financieros globales.
- Dado un usuario `COLLECTIONS`, cuando opera cobranza, entonces puede consultar cuentas por cobrar, saldos, pagos, cobros en ruta y liquidaciones autorizadas; no puede modificar inventario ni registrar ventas desde POS.
- Dado un usuario `COLLECTIONS` con `collections.receive_cash`, `cash_shift.open_own` y `cash_shift.close_own`, cuando cobra en efectivo en su ubicación, entonces puede abrir, consultar y cerrar su propio turno con el dispositivo registrado; no puede usar una ubicación ajena, un turno ajeno, cerrar administrativamente, reabrir ni registrar movimientos.
- Dado cualquier pantalla con navegación por rol, cuando el rol no tiene acceso a un módulo, entonces el menú y la ruta protegida no permiten operar ese módulo.

## Inventario por ubicación operativa

- Dado un producto válido, cuando se crea, entonces queda disponible en catálogo sin crear stock operativo global.
- Dado un producto creado con presentación semántica, cuando se consulta, entonces el sistema distingue `KG`, `WHOLE` o `CUT` y no lo infiere solo por el nombre.
- Dado un producto sin configuración fiscal, cuando se crea o edita, entonces continúa operable comercialmente y la API muestra `fiscalProfileStatus=INCOMPLETE` con `CFDI_PRODUCT_PROFILE_INCOMPLETE`.
- Dado un producto con `satProductServiceCode`, `satUnitCode`, `taxObjectCode`, `defaultTaxCode`, `defaultFactorType` y `defaultRateOrQuota` válidos, cuando se consulta, entonces muestra perfil fiscal completo sin alterar `ProductUnit`.
- Dado un código fiscal estructuralmente inválido, cuando se crea o edita el producto, entonces responde error de campo estable sin crear movimientos ni modificar históricos.
- Dado un producto con ventas históricas, cuando se actualiza su perfil fiscal, entonces las partidas y snapshots históricos permanecen idénticos.
- Dado una consulta de disponibilidad, cuando se solicita inventario, entonces el sistema muestra saldos por `locationId` mediante `quantityKg` y/o `quantityPieces`, no como stock global único.
- Dado una ubicación operativa inactiva, cuando se intenta usar en ventas, compras, ajustes o traspasos nuevos, entonces la operación se rechaza.
- Dado una ubicación operativa inactiva, cuando se intenta confirmar una venta con esa ubicación como `locationId`, entonces el backend rechaza la operación antes de descontar inventario y no crea venta, items, cuenta por cobrar, ticket ni movimientos.
- Dado una ubicación operativa inactiva, cuando se intenta confirmar una compra con esa ubicación como receptora, entonces el backend rechaza la operación antes de incrementar inventario y no crea movimientos de compra.
- Dado una ubicación operativa inactiva, cuando se intenta registrar un ajuste, merma, devolución, rechazo parcial o pérdida operativa con esa ubicación, entonces el backend rechaza la operación y no modifica `InventoryBalance` ni crea `InventoryMovement`.
- Dado una ubicación operativa inactiva como origen o destino de un traspaso nuevo, cuando se intenta crear o solicitar el traspaso, entonces el backend rechaza la operación y no crea `InventoryTransfer` ni `InventoryTransferItem`.
- Dado un traspaso existente, cuando su origen o destino queda inactivo antes de confirmarlo, entonces la confirmación se rechaza y no genera movimientos `TRANSFER_OUT` ni `TRANSFER_IN`.
- Dado un ajuste de inventario válido, cuando se confirma, entonces registra movimiento con producto, ubicación, usuario, unidad, cantidades y motivo obligatorio.
- Dado un ajuste confirmado con `Idempotency-Key`, cuando el cliente reintenta el mismo payload, entonces recibe el movimiento original y el saldo no cambia por segunda vez.
- Dada una clave de ajuste ya usada, cuando se reintenta con payload distinto, entonces responde `409 IDEMPOTENCY_CONFLICT` sin modificar saldo ni crear movimiento.
- Dadas dos solicitudes concurrentes con la misma clave, cuando ambas alcanzan el backend, entonces solo persiste un movimiento y la respuesta reintentada devuelve ese resultado.
- Dado una merma, devolución, rechazo parcial o pérdida operativa, cuando afecta inventario, entonces se registra como movimiento trazable con motivo obligatorio.
- Dado stock insuficiente en una ubicación, cuando se intenta vender, ajustar salida o confirmar traspaso desde esa ubicación, entonces la operación se rechaza sin saldo negativo.
- Dado un producto con bajo inventario, cuando se consulta bajo stock, entonces se evalúa por ubicación y por unidad aplicable.
- Dado un CEDIS, cuando se consulta su jerarquía, entonces es una raíz `DISTRIBUTION_CENTER` y sus sucursales directas son `BRANCH` con `parentId` igual al CEDIS.
- Dado un cambio de `parentId`, cuando formaría una autorreferencia o ciclo transitivo, entonces la API y la base rechazan la escritura.
- Dado un CEDIS o sucursal con ciclo CEDIS abierto, transferencia `IN_TRANSIT`, cierre `DRAFT`/`REVIEWED` o hijo activo, cuando se desactiva, entonces la operación se rechaza sin cambiar `isActive`.
- Pendiente/condicional: dado que la regla exacta para seleccionar ubicación de descuento sigue abierta, las pruebas deben validar que la venta conserve `locationId` y no asumir selección automática no definida.

## Unidades kilo, pieza y equivalencias

- Dado un producto `KG`, cuando se crea, entonces el sistema lo clasifica como producto vendido por kilo y no como corte o unidad entera.
- Dado un producto `WHOLE`, cuando se crea, entonces el sistema lo clasifica como unidad entera aunque use piezas operativas.
- Dado un producto `CUT`, cuando se crea, entonces el sistema lo clasifica como corte aunque pueda venderse por kilo o pieza.
- Dado un producto `KG`, cuando se captura cantidad, entonces acepta kilos decimales y no requiere piezas.
- Dado un producto `PIECE`, cuando se captura cantidad, entonces acepta piezas enteras y rechaza piezas decimales.
- Dado un producto `KG_AND_PIECE`, cuando se captura una operación con equivalencia, entonces conserva unidad capturada, `quantityKg`, `quantityPieces`, `unitEquivalentId` o factor aplicado cuando corresponda.
- Dado un cálculo que requiere convertir kilo/pieza, cuando no existe equivalencia oficial aprobada, entonces la operación se rechaza o queda bloqueada según flujo definido.
- Dado una equivalencia activa, cuando se usa en venta o compra, entonces la operación conserva la equivalencia aplicada para trazabilidad histórica.
- Pendiente/condicional: las pruebas de redondeo exacto quedan condicionadas a la política de redondeo aprobada por negocio.
- Pendiente/condicional: las pruebas de aprobación o modificación de equivalencias quedan condicionadas a la decisión de quién puede aprobarlas además de `ADMIN`.

## Traspasos de inventario

- Dado un traspaso válido, cuando se crea, entonces registra origen, destino, responsable, estado, productos, unidad y cantidades.
- Dado un traspaso con origen igual a destino, cuando se intenta guardar, entonces se rechaza.
- Dado un traspaso sin productos, cuando se intenta guardar, entonces se rechaza.
- Dado stock suficiente en origen, cuando se confirma un traspaso, entonces genera movimientos `TRANSFER_OUT` en origen y `TRANSFER_IN` en destino de forma transaccional.
- Dado stock insuficiente en origen, cuando se confirma un traspaso, entonces se rechaza sin modificar saldos.
- Dado un traspaso cancelado o ya confirmado, cuando se intenta confirmar de nuevo, entonces se rechaza.

## Ciclos de suministro CEDIS-sucursal

- Dado CEDIS y sucursal compatibles sin ciclo activo, cuando se abre el ciclo, entonces queda `OPEN` con actor, versión y evento auditables.
- Dadas dos aperturas concurrentes para la misma sucursal y fecha, cuando ambas se ejecutan, entonces solo persiste un ciclo no cancelado.
- Dado un ciclo mutable, cuando se registra un suministro, entonces crea y vincula un `InventoryTransfer` `REQUESTED` CEDIS → sucursal sin movimientos.
- Dado un ciclo mutable, cuando se registra una devolución, entonces crea y vincula un `InventoryTransfer` `REQUESTED` sucursal → CEDIS sin movimientos.
- Dado un ciclo con varios suministros y devoluciones, cuando se consulta, entonces cada transferencia aparece una sola vez con su estado real.
- Dado un suministro o devolución despachado por Fleet, cuando se consulta su ruta, entonces `DeliveryRoute.type` es `CEDIS_SUPPLY` o `BRANCH_RETURN` y `inventoryTransferId` identifica exactamente el `InventoryTransfer` vinculado.
- Dado una ruta histórica comercial sin unidad, cuando se ejecuta la migración logística, entonces conserva `type=SALE_DELIVERY` y `vehicleId=NULL` sin perder la relación con su conductor existente.
- Dado una ruta logística, cuando se valida su modelo, entonces `vehicleId` es obligatorio y origen, destino y coordenadas se resuelven desde `OperationalLocation` a través del `InventoryTransfer`, sin tablas paralelas.
- Dado un suministro o devolución, cuando se registra sin `assignedDriverId` o `vehicleId`, entonces el backend rechaza el comando antes de crear transferencia o ruta.
- Dado un suministro o devolución con IDs arbitrarios, cuando se registra, entonces el backend rechaza el comando si el conductor no es un `DRIVER` activo o la unidad no está activa/disponible.
- Dado un suministro CEDIS → sucursal o una devolución sucursal → CEDIS, cuando se registra con ubicaciones sin coordenadas, entonces no persiste transferencia, reserva, vínculo ni `DeliveryRoute` y devuelve un error de dominio de coordenadas.
- Dada una ruta logística `IN_PROGRESS` sin `VehiclePosition` persistida reciente, cuando se confirma la parada, entonces el backend responde `422` y no registra la llegada.
- Dada una posición persistida con precisión mayor a 100 metros, stale o a más de 150 metros del destino canónico, cuando se confirma la parada, entonces el backend responde `422` y no cambia `DeliveryRoute`.
- Dada una posición persistida reciente, con precisión de 100 metros o menos y dentro de 150 metros del destino, cuando se confirma explícitamente la parada, entonces registra la llegada y conserva la separación respecto a inventario, cobros y liquidación.
- Dado un producto inactivo, cuando se intenta crear o confirmar una transferencia del ciclo, entonces se rechaza sin cambios parciales.
- Dado un producto histórico que se desactivó después de confirmar, cuando se consulta o refresca, entonces conserva su snapshot y cantidades históricas.
- Dado stock insuficiente, cuando se confirma una transferencia vinculada, entonces no cambia ningún balance, movimiento, transferencia o snapshot.
- Dadas confirmaciones concurrentes sobre el mismo saldo, cuando solo una tiene stock disponible, entonces una confirma y la otra falla sin saldo negativo.
- Dado un traspaso `DRAFT`, `REQUESTED` o `IN_TRANSIT`, cuando se cancela con motivo, entonces queda `CANCELLED`, invalida la proyección y no crea movimientos.
- Dado un traspaso `CONFIRMED`, cuando se intenta cancelar, entonces se rechaza y conserva movimientos e historial.
- Dado al menos un suministro confirmado, cero pendientes e integridad válida, cuando se refresca, entonces crea snapshot append-only y lleva el ciclo a `READY_FOR_REVIEW`.
- Dado un refresh repetido con la misma clave y payload, cuando se reintenta, entonces devuelve la versión original sin duplicar snapshots ni eventos.
- Dado la misma clave con payload distinto, cuando se reintenta cualquier comando CEDIS, entonces responde `IDEMPOTENCY_CONFLICT`.
- Dado un ciclo `CLOSED` o `CANCELLED`, cuando se intenta suministrar, devolver o refrescar, entonces se rechaza sin modificar historial.
- Dado una devolución confirmada, cuando se concilia el cierre, entonces participa una sola vez mediante `TRANSFER_OUT` en la sucursal.
- Dado un suministro pendiente, cuando la sucursal registra cantidades recibidas iguales a las enviadas, entonces confirma salida y entrada sin diferencia.
- Dado un suministro pendiente con faltante, cuando se registra una nota y las cantidades recibidas, entonces la sucursal queda con lo recibido y la diferencia queda trazable en `BranchSupplyReceiptItem` sin movimiento `SHRINKAGE` sobre su saldo.
- Dado un suministro pendiente con sobrante, cuando se registra una nota y las cantidades recibidas, entonces la sucursal queda con lo recibido y la diferencia queda trazable en `BranchSupplyReceiptItem` sin un segundo movimiento `IN`.
- Dada una recepción con diferencia, cuando se concilia el ciclo CEDIS, entonces la cantidad entregada es la recibida y la variación de tránsito no se mezcla con mermas físicas de la sucursal.
- Dado un suministro ya recibido, cuando se intenta recibirlo nuevamente, entonces se rechaza o se devuelve la recepción original sin duplicar movimientos.
- Dado una diferencia sin nota, cuando se intenta recibir, entonces se rechaza sin confirmar la transferencia.
- Dado un cálculo que requiere conversión kilo/pieza sin equivalencia y redondeo aprobados, cuando se procesa, entonces se rechaza sin inventar el factor ni la regla.

## Clientes minoristas, mayoristas y políticas comerciales

- Dado un cliente minorista válido, cuando se crea, entonces queda disponible para ventas conforme a permisos.
- Dado un cliente mayorista válido, cuando se crea, entonces conserva `customerType=WHOLESALE` y condiciones comerciales autorizadas cuando aplique.
- Dado un cliente sin nombre, cuando se guarda, entonces el sistema rechaza la operación.
- Dado un teléfono duplicado usado como identificador comercial, cuando se crea o edita cliente, entonces el sistema rechaza el duplicado.
- Dado datos fiscales de cliente, cuando se capturan, entonces permanecen opcionales y no habilitan emisión fiscal en MVP.
- Dado un cliente inactivo, cuando se intenta seleccionarlo en una nueva venta, entonces el sistema lo rechaza.
- Dado una política comercial, cuando se configura, entonces no puede desactivar reglas estructurales como inventario por ubicación, cuentas por cobrar para crédito, traspasos ni ticket interno del MVP.

## Ventas POS de contado y crédito

- Dado un carrito vacío, cuando se confirma venta, entonces el sistema muestra error y no crea venta.
- Dado una venta de contado válida con stock suficiente en la ubicación indicada, cuando se confirma, entonces crea venta, items, movimientos de inventario, descuenta saldo por ubicación y registra método de pago.
- Dado un punto fijo sin turno abierto del cajero y dispositivo actuales, cuando se intenta una venta, entonces responde `CASH_SHIFT_REQUIRED` o un error de propiedad del turno y no persiste ningún efecto.
- Dado un turno válido, cuando se confirma una venta, entonces la venta conserva terminal, turno, cajero, fecha de negocio, registro y dispositivo; sus pagos conservan el turno.
- Dado una venta `CASH_SALE` sin pagos o con pagos cuya suma sea menor al total, cuando se confirma, entonces se rechaza aunque exista un cliente activo y no crea venta, movimientos ni cuenta por cobrar.
- Dado un pago parcial de una venta, cuando se confirma, entonces el operador debe cambiar explícitamente a `CREDIT_SALE` y se ejecutan las validaciones de límite, mora y bloqueo crediticio.
- Dado una venta a crédito válida para cliente autorizado, cuando se confirma, entonces crea venta, items, movimientos de inventario y una cuenta por cobrar asociada.
- Dado una venta a crédito sin cliente, cuando se confirma, entonces se rechaza.
- Dado un cliente bloqueado por mora o límite excedido, cuando se intenta venta a crédito sin autorización administrativa explícita, entonces se rechaza.
- Dado una venta, cuando el frontend envía precios o totales calculados, entonces el backend no los usa como fuente de verdad para confirmar importes.
- Dado una venta con producto por kilo/pieza, cuando se confirma, entonces conserva unidad, cantidades y equivalencia aplicada cuando corresponda.
- Dado una venta confirmada, cuando se cancela con permisos y motivo, entonces restaura inventario en la ubicación original y registra movimientos de reversa.
- Dado una venta a crédito cancelada, cuando tenía cuenta por cobrar relacionada, entonces la cuenta se ajusta o cancela conforme al estado operativo.
- Dado una venta ya cancelada, cuando se intenta cancelar otra vez, entonces se rechaza.
- Dado una venta con pagos aplicados, cuando se intenta cancelar sin reversa o reembolso auditable, entonces se rechaza.
- Dado una venta asociada a cierre POS cerrado o liquidación cerrada, cuando se intenta cancelar, entonces se exige reapertura versionada antes de continuar.
- Dado una venta cobrada confirmada, cuando ADMIN consulta la vista previa de “Anular venta”, entonces ve pagos a revertir, inventario a restaurar, cuenta por cobrar, documentos afectados, motivo y usuario autorizador.
- Dado una vista previa sin bloqueadores y un motivo válido, cuando ADMIN confirma “Anular venta”, entonces se revierten pagos, se cancela la venta, se restaura inventario, se actualiza cartera y se cancelan documentos internos de forma transaccional.
- Dado un reintento de “Anular venta” con la misma `Idempotency-Key`, cuando el payload coincide, entonces devuelve el resultado original sin duplicar reversas ni movimientos.
- Dado un fallo al aplicar cualquier efecto de “Anular venta”, cuando termina la operación, entonces no quedan pagos, inventario, cartera o documentos parcialmente modificados.
- Pendiente/condicional: las pruebas de descuentos y autorizaciones comerciales específicas quedan condicionadas a la política comercial final aprobada.

## Ticket interno del MVP

- Dado una venta confirmada, cuando se consulta el ticket, entonces muestra número, fecha, vendedor, cliente cuando exista, ubicación, items, unidad, kilos, piezas, tipo de venta, método de pago, total y estado.
- Dado el ticket interno, cuando se presenta en API o UI, entonces incluye leyenda de comprobante interno sin validez fiscal.
- Dado el MVP, cuando se generan comprobantes, entonces no existen acciones ni datos de timbrado, PAC, UUID fiscal, factura fiscal, CFDI ni integración SAT.

## Compras

- Dado una compra válida, cuando se confirma, entonces incrementa inventario en la ubicación receptora y registra movimientos trazables.
- Dado una compra sin proveedor, cuando se guarda, entonces se rechaza.
- Dado una compra sin ubicación receptora, cuando se confirma, entonces se rechaza.
- Dado una compra sin productos, cuando se confirma, entonces se rechaza.
- Dado una compra con cantidades por kilo, pieza o ambas, cuando se confirma, entonces conserva unidad, cantidades y equivalencia aplicada cuando corresponda.
- Dado una compra confirmada, cuando se cancela con permisos y motivo, entonces revierte inventario si es posible en la ubicación original.
- Dado una cancelación de compra que produciría inventario negativo por ubicación, cuando se intenta cancelar, entonces se rechaza.

## Cuentas por cobrar y pagos

- Dado una venta a crédito confirmada, cuando se completa la transacción, entonces existe una cuenta por cobrar con cliente, venta, saldo original, saldo pendiente, vencimiento y estado.
- Dado una cuenta por cobrar vigente, cuando se registra pago parcial válido, entonces disminuye saldo pendiente y marca estado parcialmente pagado cuando aplique.
- Dado una cuenta por cobrar vigente, cuando se registra pago total válido, entonces saldo pendiente queda en cero y estado pagado.
- Dado un pago de cobranza del MVP, cuando se registra, entonces `Payment.accountReceivableId` es requerido y el pago se aplica a exactamente una cuenta por cobrar.
- Dado un pago de cobranza en efectivo en una ubicación fija, cuando se registra sin sesión abierta, entonces se rechaza y no modifica el saldo de la cuenta por cobrar.
- Dado un pago de cobranza en efectivo en una ubicación fija, cuando `COLLECTIONS` no tiene `collections.receive_cash`, entonces se rechaza con `COLLECTIONS_CASH_PERMISSION_REQUIRED` y no consulta ni muta el turno o el saldo.
- Dado un pago `TRANSFER`, `DEPOSIT`, `CARD` o `CHECK`, o un cobro `CASH` de ruta con su contexto autorizado, cuando `COLLECTIONS` registra el pago, entonces no se exige `cash_shift.open_own` ni `cashShiftId` de caja fija.
- Dado una venta de contado completamente pagada, cuando se registra el pago inicial, entonces el `Payment` queda asociado a la venta sin crear una cuenta por cobrar artificial.
- Dado dinero recibido en el sistema, cuando se audita la fuente monetaria, entonces solo `Payment` puede ser fuente de verdad y cualquier total en reparto o liquidación debe ser derivado.
- Dado un pago mayor al saldo pendiente, cuando no existe regla futura explícita para anticipos o saldos a favor, entonces se rechaza.
- Dado una cuenta cancelada o pagada, cuando se intenta registrar pago, entonces se rechaza.
- Dado un pago cancelado, cuando se cancela con permisos y motivo, entonces conserva historial y recalcula saldo/estado de la cuenta por cobrar.
- Dado un cliente con saldo vencido, cuando se consulta resumen de crédito, entonces se identifica mora, saldo vencido y bloqueo cuando corresponda.
- Dado cobros de cuentas por cobrar, cuando se reportan en caja, entonces se distinguen de ventas de contado.

## Rutas, reparto, evidencia, cobros y liquidación

- Dado una ruta válida, cuando se crea, entonces contiene repartidor, fecha, pedidos confirmados y ubicación de origen cuando aplique.
- Dado una venta cancelada, cuando se intenta asignar a ruta, entonces se rechaza.
- Dado un repartidor autenticado, cuando consulta rutas, entonces solo ve rutas propias.
- Dado un pedido asignado, cuando el repartidor actualiza estado, entonces solo puede actualizar pedidos asignados a su usuario.
- Dado un pedido marcado como entregado, cuando se actualiza, entonces registra `deliveredAt`.
- Dado una no entrega, devolución, rechazo parcial o incidencia, cuando se registra, entonces conserva motivo obligatorio.
- Dado evidencia de entrega, cuando se captura, entonces acepta tipos permitidos: foto, firma, geolocalización o nota.
- Dado un pedido que cambia a `DELIVERED`, cuando no tiene `PHOTO`, entonces el backend rechaza la transición; la ausencia de `GEOLOCATION` no la bloquea.
- Dada una captura `PHOTO` enviada directamente a la API, cuando el valor no es una imagen válida o su MIME no coincide con la firma binaria, entonces el backend responde `400` sin persistirla.
- Dada una `PHOTO` válida, cuando se captura, entonces el backend persiste `sha256`, MIME, tamaño, dimensiones, `receivedAt` y `capturedByUserId` sin confiar en valores derivados por el cliente.
- Dada una evidencia con `capturedAt` fuera de la ventana permitida, cuando se captura, entonces el backend responde `400` sin persistirla.
- Dado un cobro en ruta, cuando se registra, entonces requiere `accountReceivableId`, saldo pendiente, método de pago y ruta asociada.
- Dado un cobro en ruta, cuando ya existe liquidación asociada, entonces el pago puede mostrar `routeSettlementId`; si no existe, el cobro permanece asociado a la ruta sin exigir liquidación previa.
- Dado un cobro en ruta mayor al saldo pendiente, cuando se intenta registrar, entonces se rechaza.
- Dado una ruta con pedidos, cobros, devoluciones o incidencias, cuando se abre o calcula liquidación, entonces compara esperado contra cobrado por método y registra diferencia.
- Dado una liquidación con pedidos sin estado final, cuando se intenta cerrar, entonces se rechaza o queda en revisión conforme a política.
- Dado una carga confirmada hacia `ROUTE_STOCK`, cuando se consulta inventario, entonces el origen disminuye y la ruta aumenta en una sola operación trazable.
- Dado una venta de canal `ROUTE`, cuando se confirma, entonces descuenta inventario de `ROUTE_STOCK` y no del almacén original.
- Dado una devolución de sobrante desde ruta, cuando se confirma el traspaso de regreso, entonces disminuye `ROUTE_STOCK` y aumenta la ubicación destino autorizada.
- Dado una ruta sin `ROUTE_STOCK`, cuando se intenta vender o devolver producto, entonces la operación se rechaza.
- Dado una carga a ruta ya confirmada y una venta posterior, cuando se auditan movimientos, entonces no existe doble decremento del mismo stock origen.
- Dado un POST de traspaso repetido con la misma `Idempotency-Key`, cuando el payload coincide, entonces el sistema devuelve el mismo resultado y no crea un segundo traspaso.
- Dado una confirmación o cancelación repetida del mismo traspaso con la misma `Idempotency-Key`, cuando se reintenta, entonces no se duplican movimientos ni cancelaciones.
- Dado una liquidación cerrada, cuando se intenta reabrir o cerrar de nuevo con versión obsoleta, entonces la operación se rechaza.
- Dado una apertura/cálculo o cierre de liquidación repetido con la misma `Idempotency-Key`, cuando se reintenta, entonces no se abre ni cierra dos veces la misma liquidación.
- Pendiente/condicional: las tolerancias de merma, diferencia de peso, devolución o rechazo parcial quedan condicionadas a definición de negocio.

## Gobierno documental

- Dado un spec deprecated de módulo, cuando se consulta, entonces redirige explícitamente al spec canónico.
- Dado el roadmap activo, cuando se inspecciona, entonces usa únicamente módulos canónicos para inventory, sales, reports y routes-delivery.

## Reportes y dashboard casi en tiempo real

- Dado ventas confirmadas del día, cuando `ADMIN` consulta dashboard o reporte diario, entonces ve totales actualizados por contado, crédito, método, vendedor y ubicación cuando aplique.
- Dado un `SELLER`, cuando consulta ventas o corte propio, entonces solo ve información propia salvo autorización explícita.
- Dado inventario bajo, cuando se consulta dashboard o reportes de inventario, entonces se muestra por ubicación operativa y unidad aplicable.
- Dado cuentas por cobrar, pagos y saldos vencidos, cuando `COLLECTIONS` consulta reportes autorizados, entonces ve saldos, pagos y vencimientos sin acceder a inventario operativo.
- Dado operaciones de reparto, cuando se consulta reporte de delivery, entonces distingue pedidos por estado, evidencias, cobros, liquidaciones e incidencias.
- Dado cobros en ruta, cuando se consultan reportes o corte, entonces se distinguen de ventas de contado y de pagos directos de cobranza.
- Dado operaciones confirmadas, cuando se consultan reportes operativos, entonces reflejan los cambios con latencia máxima esperada de 60 segundos en condiciones normales.
- Dado una operación confirmada con marca temporal controlada `confirmedAt=T0`, cuando una prueba de integración controlada consulta el reporte con un reloj inyectado o base de datos fijada en `T0 + 60s`, entonces el reporte incluye la operación; esta validación no debe depender de esperas reales, `sleep`, temporizadores aleatorios ni tiempo de pared no controlado.
- Dado un contrato de reporte casi en tiempo real, cuando se diseña su prueba, entonces la prueba usa únicamente el metadato de frescura definido explícitamente por ese contrato, como `generatedAt`, `lastMovementAt`, `updatedAt` o marca equivalente.
- Dado un reporte cuyo contrato API no define metadato de frescura verificable, cuando se intenta validar el criterio casi en tiempo real, entonces la prueba queda pendiente/bloqueada hasta que el contrato API se actualice; la prueba no debe inventar metadatos ni asumir nombres no especificados.
- Dado una consulta de reporte con filtros por ubicación, cuando existe inventario o movimiento en varias ubicaciones, entonces el resultado mantiene separación por `locationId` y no valida contra stock global.
- Dado reportes operativos, cuando se generan, entonces no dependen de cortes manuales ni liquidaciones cerradas para mostrar operaciones confirmadas actuales.

## Pruebas frontend de interacción críticas

- Dado el login, cuando el usuario captura credenciales válidas o inválidas, entonces la UI muestra sesión iniciada o error correspondiente.
- Dado una pantalla protegida, cuando el rol no está autorizado, entonces muestra estado `Unauthorized` o pantalla 403.
- Dado POS, cuando se agregan productos, cambia unidad/cantidad, selecciona cliente y confirma venta, entonces la UI valida campos, deshabilita envío durante confirmación y muestra errores backend sin ocultarlos.
- Dado inventario, cuando se filtra por ubicación o bajo stock, entonces la UI muestra saldos por ubicación y no muestra disponibilidad global.
- Dado traspasos, cuando se captura origen, destino y productos, entonces la UI valida origen/destino distintos, piezas enteras y cantidades mayores a cero.
- Dado cobranza, cuando se registra pago, entonces la UI requiere cuenta por cobrar, bloquea monto mayor al saldo y actualiza saldo al concluir.
- Dado experiencia de repartidor, cuando actualiza estado, evidencia, incidencia o cobro, entonces la UI valida permisos, campos requeridos y errores de rutas ajenas.
- Dado reportes y dashboard, cuando se cargan datos remotos, entonces la UI contempla estados loading, error, empty, success y unauthorized.
- Dado reportes y dashboard, cuando el endpoint entrega `generatedAt` o metadatos equivalentes de actualización, entonces la UI muestra el indicador sin usarlo como sustituto de la validación backend del criterio de 60 segundos.

## Flujos E2E prioritarios

- Autenticación y permisos: login, protección de ruta y acceso denegado por rol.
- Inventario base: crear producto, consultar saldo por ubicación, ajustar inventario con motivo y verificar movimiento.
- Traspaso: crear traspaso, confirmar con stock suficiente y verificar saldos/movimientos de origen y destino.
- Venta de contado: seleccionar ubicación, vender producto con stock suficiente, generar ticket interno y verificar descuento por ubicación.
- Venta a crédito y cobranza: crear cliente con crédito, registrar venta a crédito, generar cuenta por cobrar, registrar pago parcial y validar saldo.
- Compra: registrar compra en ubicación receptora, verificar incremento de inventario y cancelar cuando sea válido.
- Reparto y liquidación: asignar venta confirmada a ruta, entregar pedido con evidencia permitida, registrar cobro en ruta con cuenta por cobrar y abrir/cerrar liquidación según estado.
- Reportes: ejecutar operación confirmada y verificar que dashboard o reporte autorizado refleje el cambio usando datos de prueba controlados y metadatos de actualización; el E2E no debe esperar 60 segundos reales ni depender de temporizadores aleatorios.

## Validaciones que nunca deben regresar

- No vender sin stock suficiente en la ubicación de descuento.
- No permitir stock negativo por ubicación.
- No usar stock global como fuente de verdad operativa.
- No confirmar venta sin productos.
- No aceptar precios de frontend como fuente de verdad en ventas.
- No crear venta a crédito sin cliente autorizado.
- No permitir crédito a cliente bloqueado o excedido sin autorización administrativa explícita.
- No registrar un pago de cobranza sin `Payment.accountReceivableId` en MVP.
- No registrar pago mayor al saldo pendiente salvo regla futura explícita.
- No asignar ventas canceladas a ruta.
- No permitir que `DRIVER` opere rutas ajenas.
- No cerrar ruta o liquidación ignorando pedidos pendientes cuando el spec requiere estado final.
- No mostrar ticket interno como comprobante fiscal, CFDI ni integración SAT.

## Notas facturables y facturas externas post-MVP

- Dado un documento elegible, cuando se evalúa, entonces su estado se deriva de datos y políticas, no de un booleano manual.
- Dadas operaciones concurrentes sobre el mismo saldo, entonces nunca se excede el importe facturable.
- Dada una factura cancelada o sustituida, sus aplicaciones sin efecto se excluyen sin borrar historia.
- Notas con distinto cliente, perfil fiscal, moneda o emisor no pueden agruparse.
- `BILLING` puede revisar, aprobar, rechazar, vincular y exportar sin modificar inventario ni pagos.
- `SELLER` ve únicamente notas propias; `WAREHOUSE` y `DRIVER` no acceden al módulo ni a datos fiscales.
- Vincular, cancelar o sustituir facturas no crea ni modifica `Sale`, `Payment` o `InventoryMovement`.
- Con los mismos filtros, tabla, resumen, CSV y XLSX producen conteos e importes conciliados.
- Puede conservarse el UUID de una factura externa legacy sin convertirlo en
  una emisión nativa; las solicitudes `APPROVED` usan el flujo CFDI nativo
  documentado abajo y la identidad PAC sigue siendo server-owned.
- `PaymentAllocation` no existe como mecanismo del flujo.

## CFDI 4.0 nativo

- Dado un `LegalEntity` incompleto con `cfdiEnabled=false`, el CRUD permite
  conservarlo como registro legacy y expone `CFDI_LEGAL_ENTITY_FISCAL_PROFILE_INCOMPLETE`.
- Dado `cfdiEnabled=true`, RFC, lugar de expedición, régimen SAT, serie y
  metadata de certificado incompletos o inválidos, el backend rechaza la
  activación antes de persistir.
- Dada una venta facturable, solo un mapeo vigente a una entidad activa,
  habilitada, completa y con certificado vigente permite continuar; cero,
  solapados o inactivos bloquean con código estable y no dejan reserva de
  inventario.
- Las rutas administrativas de `LegalEntity` solo aceptan `ADMIN` y `BILLING`;
  no almacenan `.key`, contraseña CSD ni token PAC.
- Dada una solicitud `APPROVED`, repetir emisión con la misma idempotencia crea
  exactamente una raíz `Invoice` nativa y el mismo intento `STAMP`.
- Dadas dos claves concurrentes sobre la misma solicitud `APPROVED`, PostgreSQL
  permite como máximo una raíz, un intento y un POST efectivo al PAC.
- Dada una solicitud fuera de `APPROVED`, la emisión se rechaza antes de llamar
  al proveedor u ObjectStorage.
- Dada una solicitud `APPROVED` sin `Invoice` nativa, cuando el núcleo fiscal la
  construye, entonces resuelve emisor, receptor y partidas desde backend,
  recalcula con `Prisma.Decimal` y devuelve un snapshot profundamente inmutable
  sin UUID, TFD ni sellos.
- Dadas ventas de diferente cliente, moneda o entidad legal, perfiles fiscales
  incompletos, claves SAT inválidas, configuración de pago incoherente,
  ecuaciones distintas o importes superiores al saldo vigente, cuando se
  construye el documento, entonces falla con un código de dominio estable y no
  realiza ninguna escritura.
- Dado cualquiera de los trece estados fiscales de dominio, solo los eventos
  declarados pueden transicionar; todo otro evento devuelve
  `INVALID_STATE_TRANSITION` y no cambia el estado persistido.
- Dado un timeout después del envío, factura e intento quedan `UNKNOWN`,
  bloquean una segunda emisión y se reconcilian por referencia o
  emisor/serie/folio.
- Dado un rollback al persistir una respuesta PAC exitosa, el POST no se repite
  y un intento de recuperación marca la operación `UNKNOWN` para conciliación.
- Dada una emisión confirmada, UUID, TFD, sellos, datos SAT, identificadores PAC
  y artefactos provienen únicamente de la respuesta validada del proveedor.
- Dado un body con campos fiscales propiedad del servidor, la validación
  estricta lo rechaza.
- Dada cualquier operación fiscal, los valores y conteos de `Sale`, `Payment`,
  `AccountReceivable`, `InventoryBalance` e `InventoryMovement` permanecen
  iguales.
- Dada una caída de ObjectStorage después del timbrado, no se emite otro CFDI;
  el artefacto queda `FAILED` como inconsistencia recuperable, conserva el
  UUID confirmado y se publica con checksum al recuperarse.
- Dado XML/PDF disponible, cuando se solicita su descarga, entonces el backend
  verifica `AVAILABLE`, hash y tamaño, aplica ownership/scope y devuelve solo
  una URL firmada temporal sin exponer `storageKey`.
- Dado XML con UUID distinto al UUID persistido o al TFD, cuando se publica,
  entonces queda `FAILED` con código estable y no se sube como artefacto
  autoritativo.
- Dado un artefacto faltante de una factura `STAMPED`, cuando se consulta,
  entonces responde `FISCAL_ARTIFACT_MISSING` y queda abierta la recuperación
  sin cambiar el estado fiscal ni llamar `stamp`.
- Dado un acuse de cancelación posterior, cuando se recibe, entonces se
  persiste como `CANCELLATION_ACK` con la misma validación de hash y bucket
  privado.
- Dado un usuario `ADMIN` o `BILLING`, cuando consulta el historial fiscal,
  entonces obtiene paginación y filtros por fecha, cliente, RFC, UUID,
  serie/folio, estado fiscal, entidad legal, ubicación y tipo CFDI sin N+1.
- Dado el detalle de una `Invoice`, entonces emisor, receptor, conceptos,
  impuestos, totales, aplicaciones, artefactos, cancelación y auditoría se
  leen de snapshots/relaciones persistidas; no se consulta `Customer` o
  `Product` para reconstruir historia.
- Dada una factura legacy sin snapshots, entonces la API devuelve
  `snapshotAvailable=false` y no inventa datos fiscales actuales.
- Dado `SELLER`, `COLLECTIONS`, `WAREHOUSE` o `DRIVER`, cuando intenta leer
  historial/detalle/estado fiscal, entonces recibe `CFDI_INVOICE_READ_FORBIDDEN`;
  solo los alcances de descarga de artefactos expresamente documentados siguen
  vigentes.
- Dadas facturas existentes durante la migración, todas quedan
  `LEGACY_EXTERNAL`/`LEGACY` y conservan UUID, aplicaciones, estado,
  sustituciones, reportes y auditoría; UUID inválido o total inconsistente crea
  remediación estable sin completar ningún dato fiscal.
- Dada una `Invoice` nativa anterior al timbrado, su UUID puede ser nulo y no se
  presenta como emitida; al quedar `STAMPED`, UUID, TFD, certificados,
  proveedor certificador y sellos son obligatorios.
- Dado un cambio posterior en `Product`, `Customer` o `LegalEntity`, los
  snapshots de `Invoice`/`InvoiceConcept`/`FiscalCertificate` no cambian.
- Dado un `NATIVE_CFDI` `ACTIVE/STAMPED`, el endpoint de cancelación exige
  motivo SAT, razón interna, `expectedVersion` e idempotencia y carga UUID/
  referencia PAC únicamente desde backend.
- Dada la matriz RBAC, solo permisos `cfdi.*` autorizan endpoints fiscales;
  ocultar controles en frontend no es autorización.
- Facturama sandbox y un fake neutral satisfacen el mismo contrato del puerto;
  Finkok podrá ejecutar esa suite sin cambiar dominio o API.

### CFDI-11 — Revisión y emisión nativa en solicitudes

- Dada una solicitud `APPROVED` de `ADMIN` o `BILLING`, cuando se abre el
  detalle, entonces la UI reutiliza `InvoiceReconciliationPanel` y muestra una
  revisión fiscal de emisor, receptor, RFC, régimen, CP, UsoCFDI, conceptos,
  claves SAT, impuestos, FormaPago, MetodoPago y totales server-owned.
- Dada una revisión fiscal, cuando el operador observa campos de UUID, TFD,
  sellos, certificados o total, entonces son valores de solo lectura o no
  existen como inputs editables.
- Dado un perfil fiscal incompleto, cuando se abre la solicitud, entonces la
  UI identifica los campos/conceptos faltantes y deshabilita `Emitir CFDI`, sin
  sustituir la validación del backend.
- Dado un click en `Emitir CFDI`, cuando se envía, entonces solo se transmiten
  `expectedVersion`, `Idempotency-Key` y decisiones fiscales permitidas, y el
  segundo click queda bloqueado.
- Dado `STAMPING`, `STAMP_UNKNOWN`, `STAMP_ERROR` o `STAMPED`, cuando se
  actualiza el detalle, entonces cada estado se muestra explícitamente;
  `STAMP_UNKNOWN` instruye reconciliar y nunca se muestra como error genérico.
- Dado `STAMPED` con XML/PDF disponibles, cuando se solicitan, entonces la UI
  muestra UUID, fechas, cancelación y abre la URL firmada temporal sin exponer
  `storageKey`; artefactos pendientes permanecen visibles como pendientes.
- Dado `SELLER`, `COLLECTIONS`, `WAREHOUSE` o `DRIVER`, cuando se abre una
  solicitud aprobada, entonces no se muestra la CTA de emisión fiscal.

### CFDI-12 — Reconciliación de operaciones inciertas

- Dadas dos instancias de `StampReconciliationJob`, cuando solo una obtiene el
  advisory lock PostgreSQL `71823043`, entonces únicamente esa instancia
  reclama y consulta operaciones.
- Dada una operación `STAMP_UNKNOWN` con referencia PAC, cuando el proveedor
  confirma el CFDI, entonces el backend persiste UUID/TFD, completa `Invoice`,
  marca los intentos y recupera XML/PDF sin ejecutar `stamp` otra vez.
- Dado XML cuyo TFD UUID no coincide con el UUID del estado, entonces la
  factura permanece `UNKNOWN`, no se marca `STAMPED` y se abre
  `BillingDataRemediation`.
- Dado un timeout repetido, cuando se agota `CFDI_MAX_RETRIES`, entonces no se
  crea otro CFDI, la operación queda reconciliable y existe remediación con
  código estable.
- Dado un `FISCAL_PROVIDER_NOT_FOUND`, entonces solo se programan consultas
  `STATUS/RECOVERY` acotadas; el job nunca llama `stamp` automáticamente.
- Dado un artefacto faltante o una caída de ObjectStorage, entonces la factura
  confirmada conserva `STAMPED`/UUID y el artefacto queda recuperable.
- Dado un proceso sin base PostgreSQL real, las pruebas unitarias deben
  distinguir el lock simulado de la prueba de concurrencia PostgreSQL, que se
  reporta `NOT_TESTED` si no hay infraestructura.

### CFDI-13 — Cancelación fiscal confirmada

- Dada una factura `ACTIVE/STAMPED`, al reservar cancelación se persiste un
  intento `CANCEL`, versión, hash/idempotencia y auditoría sin revertir
  `InvoiceSaleDocument` ni `InvoiceSaleItemApplication`.
- Dado `PENDING`, `REJECTED` o timeout PAC, la factura permanece `ACTIVE`, el
  saldo facturable sigue reservado y no existe segundo request efectivo.
- Dada respuesta fiscal `CANCELLED` cuyo UUID coincide con el histórico, la
  misma transacción cambia `Invoice.status=CANCELLED`,
  `cancellationStatus=ACCEPTED` y revierte aplicaciones para liberar saldo.
- Dado un replay con la misma clave y payload, se devuelve el mismo estado sin
  llamar otra vez al PAC; payload distinto produce `IDEMPOTENCY_CONFLICT`.
- Dadas dos claves concurrentes en PostgreSQL, como máximo una reserva y una
  llamada efectiva alcanzan al proveedor.
- Dado motivo `01`, la ausencia de sustituto o un sustituto no `STAMPED`, sin
  UUID, de otra entidad o no posterior se rechaza antes de llamar al PAC; el
  UUID sustituto se resuelve desde `replacementInvoiceId`, nunca del request.
  El sustituto válido debe conservar una relación `04` exacta hacia el CFDI
  original; el nuevo CFDI se timbra antes de solicitar la cancelación.
- Ningún resultado de cancelación sobrescribe `Invoice.uuid`, ni modifica
  `Sale`, `Payment`, `AccountReceivable`, inventario o movimientos.

### CFDI-14 — Operación asíncrona de cancelación

- Dadas dos instancias de `CancellationStatusJob`, cuando solo una obtiene el
  advisory lock PostgreSQL `71823044`, entonces solo esa instancia reclama
  cancelaciones y cada lote contiene como máximo 50 facturas.
- Dada una cancelación persistida como `CANCEL_REQUESTED` o
  `CANCEL_PENDING_ACCEPTANCE` (`cancellationStatus=PENDING`), cuando el job
  consulta el proveedor, entonces crea un intento `STATUS` y nunca vuelve a
  enviar `cancel`.
- Dado un timeout que dejó `cancellationStatus=UNKNOWN` sin intento `STATUS`,
  entonces el siguiente lote lo reclama para consulta; un resultado terminal
  no se vuelve a encolar automáticamente.
- Dada una respuesta `PENDING`, timeout o 5xx transitorio, entonces la factura
  permanece `ACTIVE`, las aplicaciones y el saldo permanecen reservados y el
  siguiente intento se programa con backoff respetando `CFDI_MAX_RETRIES`.
- Dado un rechazo fiscal, entonces se proyecta `REJECTED`/`ERROR`, se registra
  auditoría sanitizada y no se libera saldo; al agotar reintentos se crea o
  actualiza `BillingDataRemediation` sin generar otro CFDI.
- Dada una respuesta `CANCELLED` con UUID, correlación y referencia PAC
  coincidentes, entonces la transacción cambia el estado fiscal, revierte
  aplicaciones, libera el saldo y persiste el acuse como `FiscalArtifact` si
  existe.
- Dado un acuse faltante, UUID divergente o fallo de ObjectStorage, entonces la
  confirmación fiscal no se duplica; el artefacto queda `FAILED`/recuperable o
  se abre remediación y el UUID histórico no cambia.
- Dado `GET /api/billing/invoices/:id/cancellation`, entonces `ADMIN`/`BILLING`
  reciben estado, próximo retry, operación, acuse y auditoría resumida sin
  `storageKey`; otros roles reciben `CFDI_INVOICE_READ_FORBIDDEN`.
- Dada la UI de una factura pendiente, entonces muestra `Pending` y deshabilita
  repetir cancelación; la consulta manual no usa polling agresivo ni sustituye
  el estado persistido del job.

### CFDI-15 — Catálogos SAT versionados

- Dado un archivo de catálogo con códigos únicos, cuando se importa, entonces
  queda en `STAGING` con checksum SHA-256 y sin llamar al SAT en tiempo real.
- Dado un código duplicado, descripción vacía, rango inválido o metadata no
  serializable, entonces la importación se rechaza antes de activar una
  versión.
- Dado un checksum proporcionado que no coincide con las entradas canónicas,
  entonces la importación falla con `SAT_CATALOG_CHECKSUM_MISMATCH`.
- Dada una versión `STAGING`, cuando pasa validación, entonces cambia a
  `VALIDATED`; una versión no validada no puede activarse.
- Dada una versión validada, cuando se activa, entonces PostgreSQL retira la
  versión anterior y cambia el puntero activo en una sola transacción.
- Dadas dos lecturas concurrentes durante una activación, entonces ninguna
  observa una combinación de versión/entradas de distintas cargas.
- Dado un catálogo soportado sin fuente importada, entonces el endpoint devuelve
  `configured=false` y entradas vacías; no se inventan códigos SAT.
- Dada una factura histórica, cuando cambia la descripción de una entrada SAT,
  entonces sus códigos/descripciones snapshot permanecen iguales y no se
  reconstruyen desde `Customer`, `Product` o `SatCatalogEntry`.
- Dado un usuario distinto de `ADMIN` o `BILLING`, cuando consulta el endpoint,
  entonces recibe el rechazo RBAC fiscal canónico.

### CFDI-16 — Arquitectura REP 2.0

- Dada una venta distribuida entre dos facturas PPD, cuando se prepara REP para
  un `Payment(APPLIED)`, entonces se crean dos aplicaciones fiscales hasta
  distribuir exactamente el pago y no se elige un UUID único por la venta.
- Dada una factura que agrupa varias ventas, cuando se aplica un pago, entonces
  no consume más que el tramo de `InvoiceSaleDocument` perteneciente a su venta.
- Dados pagos parciales sucesivos, cuando se emiten en orden `paidAt,id`,
  entonces `NumParcialidad` es monotónico y cada
  `ImpSaldoInsoluto = ImpSaldoAnt - ImpPagado` con Decimal.
- Dado un pago que liquida la factura, entonces la última aplicación deja
  `ImpSaldoInsoluto=0`; `AccountReceivable` no recibe una segunda escritura
  fiscal.
- Dado un pago cuyo monto excede el saldo PPD facturado elegible, entonces se
  rechaza con `REP_UNALLOCATED_PAYMENT_AMOUNT` y no se emite un REP parcial.
- Dado un pago posterior con otro anterior elegible sin representar, entonces
  se rechaza con `REP_OUT_OF_ORDER_PAYMENT` y no se altera la parcialidad.
- Dado `REGISTERED` o `CANCELLED`, entonces el pago no habilita emisión REP.
- Dado un cobro en ruta o segunda vuelta `APPLIED`, entonces usa el mismo
  `Payment`; `routeId`, `collectionPass` y `RouteSettlement` no crean dinero ni
  parcialidades adicionales.
- Dadas dos solicitudes concurrentes sobre el mismo pago, entonces PostgreSQL
  permite como máximo una reserva/emisión ordinaria.
- Dado timeout PAC, entonces el REP queda `UNKNOWN`, conserva sus aplicaciones
  reservadas y ningún replay ejecuta otro `stamp`.
- Dada solicitud de cancelación REP pendiente, entonces las aplicaciones
  continúan efectivas; solo `CANCELLED` confirmado las revierte.
- Dado un REP con una aplicación posterior dependiente, entonces su
  cancelación/sustitución se bloquea con
  `REP_DEPENDENT_APPLICATION_EXISTS` hasta resolver en orden inverso.
- Dada sustitución motivo `01`, entonces el nuevo REP conserva parcialidad y
  saldos del sustituido, relación `04` y una sola cadena interna efectiva.
- Dado un REP vigente, entonces cancelar económicamente su `Payment` o el CFDI
  de Ingreso relacionado se rechaza antes de modificar saldos.
- Dado un pago legacy sin moneda o FormaPago SAT verificable, entonces se abre
  remediación y solo REP queda bloqueado; cobranza, caja, ruta y reportes
  continúan usando `Payment` sin cambios.

### CFDI-21 — Auditoría de seguridad fiscal

- Dado cualquier controller que emite REP o Egreso, entonces JWT y la allowlist
  `ADMIN`/`BILLING` se aplican en runtime; `SELLER`, `COLLECTIONS` y `DRIVER`
  reciben rechazo antes de ejecutar el servicio.
- Dado un ID arbitrario de factura, entonces no se genera URL firmada para un
  `SELLER` ajeno, un `COLLECTIONS` sin cuenta por cobrar vinculada ni `DRIVER`.
- Dado un TTL global de ObjectStorage mayor, entonces una URL firmada fiscal
  nunca supera cinco minutos y no expone `storageKey`.
- Dada configuración Facturama, entonces solo se acepta el origen exacto del
  ambiente y se rechaza cualquier host, path o credencial embebida antes de
  resolver el secreto PAC.
- Dada una respuesta PAC mayor a 16 MiB, con o sin `Content-Length`, entonces
  se rechaza con código estable y la lectura chunked se cancela.
- Dado XML del proveedor con `DOCTYPE` o `ENTITY`, entonces no se persiste como
  artefacto ni promueve la factura a estado confirmado.
- Dado un error externo con Authorization, PAC/CSD passwords, private key, JWT,
  secreto de ObjectStorage o XML, entonces los logs conservan únicamente un
  código interno estable.
- Gitleaks y el validador de assets fiscales no encuentran secretos, llaves,
  certificados privados ni XML productivo versionado.
