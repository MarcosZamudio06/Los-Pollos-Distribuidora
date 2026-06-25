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
- Dado un usuario `DRIVER`, cuando consulta reparto, entonces solo ve rutas y pedidos asignados a su usuario; no puede crear productos, modificar precios, cancelar ventas ni ver reportes financieros globales.
- Dado un usuario `COLLECTIONS`, cuando opera cobranza, entonces puede consultar cuentas por cobrar, saldos, pagos, cobros en ruta y liquidaciones autorizadas; no puede modificar inventario ni registrar ventas desde POS.
- Dado cualquier pantalla con navegación por rol, cuando el rol no tiene acceso a un módulo, entonces el menú y la ruta protegida no permiten operar ese módulo.

## Inventario por ubicación operativa

- Dado un producto válido, cuando se crea, entonces queda disponible en catálogo sin crear stock operativo global.
- Dado un producto creado con presentación semántica, cuando se consulta, entonces el sistema distingue `KG`, `WHOLE` o `CUT` y no lo infiere solo por el nombre.
- Dado una consulta de disponibilidad, cuando se solicita inventario, entonces el sistema muestra saldos por `locationId` mediante `quantityKg` y/o `quantityPieces`, no como stock global único.
- Dado una ubicación operativa inactiva, cuando se intenta usar en ventas, compras, ajustes o traspasos nuevos, entonces la operación se rechaza.
- Dado una ubicación operativa inactiva, cuando se intenta confirmar una venta con esa ubicación como `locationId`, entonces el backend rechaza la operación antes de descontar inventario y no crea venta, items, cuenta por cobrar, ticket ni movimientos.
- Dado una ubicación operativa inactiva, cuando se intenta confirmar una compra con esa ubicación como receptora, entonces el backend rechaza la operación antes de incrementar inventario y no crea movimientos de compra.
- Dado una ubicación operativa inactiva, cuando se intenta registrar un ajuste, merma, devolución, rechazo parcial o pérdida operativa con esa ubicación, entonces el backend rechaza la operación y no modifica `InventoryBalance` ni crea `InventoryMovement`.
- Dado una ubicación operativa inactiva como origen o destino de un traspaso nuevo, cuando se intenta crear o solicitar el traspaso, entonces el backend rechaza la operación y no crea `InventoryTransfer` ni `InventoryTransferItem`.
- Dado un traspaso existente, cuando su origen o destino queda inactivo antes de confirmarlo, entonces la confirmación se rechaza y no genera movimientos `TRANSFER_OUT` ni `TRANSFER_IN`.
- Dado un ajuste de inventario válido, cuando se confirma, entonces registra movimiento con producto, ubicación, usuario, unidad, cantidades y motivo obligatorio.
- Dado una merma, devolución, rechazo parcial o pérdida operativa, cuando afecta inventario, entonces se registra como movimiento trazable con motivo obligatorio.
- Dado stock insuficiente en una ubicación, cuando se intenta vender, ajustar salida o confirmar traspaso desde esa ubicación, entonces la operación se rechaza sin saldo negativo.
- Dado un producto con bajo inventario, cuando se consulta bajo stock, entonces se evalúa por ubicación y por unidad aplicable.
- Pendiente/condicional: dado que el modelo final sucursal-almacén sigue abierto, las pruebas deben validar `OperationalLocation` como abstracción sin asumir jerarquía obligatoria.
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
- Pendiente/condicional: la obligatoriedad exacta de combinación de evidencia queda condicionada a decisión de negocio; las pruebas no deben imponer combinación final no definida.
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
