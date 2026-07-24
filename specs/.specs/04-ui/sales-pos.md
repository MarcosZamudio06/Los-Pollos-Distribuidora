# UI — Punto de Venta

## Objetivo

Permitir registrar ventas de contado y crédito de forma rápida, descontando inventario desde una ubicación operativa definida, respetando crédito, condiciones comerciales, relaciones administrativas y documentos internos del MVP. Los abonos, la mora y la antigüedad viven en cobranza/cartera, no dentro de `paymentType`.

## Alcance TASK-054

Pantallas y componentes requeridos:

- `SalesPosPage`.
- `ProductSearch`.
- `Cart`.
- `CustomerSelector`.
- `PaymentMethodSelector`.
- `SaleChannelSelector`.
- `SaleDocumentTypeSelector`.
- `PhysicalFolioField`.
- `SaleSummary`.
- `ConfirmSaleButton`.
- `TicketModal`.
- `BillingRequestPanel`.

## Layout sugerido

Sección izquierda:

- Selector o indicador de ubicación operativa de descuento.
- Buscador de productos.
- Lista de productos encontrados con disponibilidad por ubicación.
- Filtros rápidos por categoría y unidad.

Sección derecha:

- Carrito.
- Cliente seleccionado.
- Resumen de cliente y crédito.
- Tipo de venta: contado o crédito.
- Canal de venta.
- Tipo de documento.
- Folio físico.
- Indicador de solicitud administrativa de factura.
- Estado de la solicitud administrativa si existe.
- Bloque de documentos de la venta con consulta y reapertura autorizada.
- Método de pago para venta de contado.
- Descuento autorizado.
- Resumen calculado.
- Botón confirmar venta.

## Búsqueda de productos

Debe consumir `GET /api/products` con `locationId` para mostrar disponibilidad operativa.

Cada resultado debe mostrar:

- Nombre.
- SKU.
- Presentación.
- Unidad operativa.
- Precio de referencia.
- Kilos disponibles en la ubicación.
- Piezas disponibles en la ubicación.
- Indicador de bajo stock.
- Estado de equivalencia cuando aplique.

No debe mostrar stock global como fuente de disponibilidad.

## Carrito

Columnas:

- Producto.
- Unidad capturada.
- Cantidad en kilos cuando aplique.
- Cantidad en piezas cuando aplique.
- Equivalencia aplicada o requerida.
- Precio unitario de referencia.
- Subtotal calculado para vista previa.
- Acción quitar.

El backend es fuente de verdad para precios, descuentos, subtotales y totales.

## Confirmación de venta

Debe enviar `POST /api/sales` con:

- `customerId` opcional en contado pagado al momento; requerido en crédito y en contraentrega sin pagos porque deja saldo pendiente.
- `locationId` requerido.
- `paymentType`: `CASH_SALE` o `CREDIT_SALE`.
- `saleChannel`.
- `documentType`.
- `physicalFolio` cuando aplique.
- `requiresAdministrativeInvoice`.
- `billingRequestId` cuando exista.
- `payments[]` con `amount`, `paymentMethod`, `cashTendered` opcional solo para efectivo y evidencia bancaria o de tarjeta cuando aplique para contado completamente pagado o abonos iniciales. El cliente no envía `changeGiven`.
- `discount` si está autorizado.
- `commercialPolicyId` cuando aplique.
- `administrativeOverrideReason` solo si existe autorización explícita.
- Items con `productId`, `presentationType`, `unit`, `quantityKg`, `quantityPieces` y `unitEquivalentId` cuando aplique.

Reglas de interpretación:

- `paymentType` clasifica solo el tipo de venta: contado o crédito.
- Los métodos de pago viven en `payments[].paymentMethod`, no en `Sale`.
- Si la venta es de contado y se paga al momento, el sistema registra un `Payment` por cada elemento de `payments[]` asociado a `saleId` sin crear una cuenta por cobrar artificial.
- Cada fila `CASH` permite capturar «Efectivo entregado» distinto de su monto aplicado y muestra el «Cambio» calculado. Al cambiar la fila a otro método se limpia ese dato; los tickets muestran solo efectivo entregado y cambio persistidos, sin inventarlos para pagos históricos.
- Una venta de contado contraentrega puede confirmarse sin `payments` y sin seleccionar un método, pero requiere cliente registrado para crear la cuenta por cobrar del saldo pendiente.
- Si la contraentrega deja saldo pendiente, genera `AccountReceivable`; el pago posterior se registra como cobranza con `accountReceivableId` obligatorio.

## Venta a crédito

Cuando `paymentType=CREDIT_SALE`:

- Cliente registrado es obligatorio.
- Debe mostrar resumen de crédito.
- Debe bloquear confirmación si el cliente está bloqueado o excede límite, salvo autorización administrativa explícita.
- Debe informar que la venta generará cuenta por cobrar.
- No debe registrar pago de cobranza desde POS; cobranza vive en su flujo propio.
- Debe permitir crédito sin pagos y crédito con uno o más abonos iniciales.
- Debe permitir captura rápida tipo libreta para menudeo con cliente, folio, producto, kilos, precio, monto, entregado por, cobrado por y métodos de pago cuando existan.
- Si la venta requiere solicitud administrativa, debe mostrarse como relación interna y no como CFDI.

## Solicitud administrativa

`BillingRequestPanel` debe permitir:

- Crear o enlazar solicitud administrativa interna.
- Ver estado de la solicitud.
- Consultar el saldo vinculado cuando exista cuenta por cobrar.
- Mostrar leyenda: relación interna, no CFDI.

## Ticket interno

Debe mostrar `TicketModal` a partir de `GET /api/sales/:id/ticket` o la referencia generada en la confirmación.

Debe incluir:

- Número de venta o ticket.
- Fecha.
- Vendedor.
- Cliente si existe.
- Ubicación operativa de descuento.
- Items con unidad, kilos, piezas, precio y subtotal.
- Total.
- Tipo de venta y método de pago.
- Estado.
- Leyenda: comprobante interno sin validez fiscal.
- Leyenda adicional cuando aplique: nota sencilla, nota grande o solicitud administrativa de factura sin validez fiscal.

No debe usar textos, campos ni acciones de CFDI, SAT, timbrado, PAC o factura fiscal.

## Acciones

- Agregar producto.
- Cambiar cantidad.
- Quitar producto.
- Seleccionar cliente.
- Crear cliente rápido conforme a permisos.
- Capturar folio físico y tipo documental.
- Enlazar solicitud administrativa.
- Marcar entregado por, cobrado por y segunda vuelta de cobranza cuando aplique.
- Consultar documentos asociados a la venta.
- Reabrir un documento cancelado con autorización explícita.
- Seleccionar tipo de venta.
- Seleccionar método de pago.
- Confirmar venta.
- Ver o imprimir ticket interno.

## Permisos

- `ADMIN`: vender, consultar y autorizar excepciones conforme a política.
- `SELLER`: vender y consultar ventas propias.
- `COLLECTIONS`: no registra ventas desde POS; consulta ventas a crédito en flujos autorizados.
- `WAREHOUSE` y `DRIVER`: sin acceso operativo al POS.

## Estados de pantalla

Toda vista debe contemplar:

- Loading.
- Error.
- Empty.
- Success.
- Unauthorized.

## Validaciones

- No confirmar carrito vacío.
- No permitir cantidad menor o igual a cero.
- No permitir cantidad mayor al stock mostrado por ubicación.
- Kilos permiten decimales.
- Piezas deben ser enteras.
- Requerir ubicación operativa de descuento.
- Requerir cliente para venta a crédito.
- Requerir cliente para contraentrega sin pagos.
- Requerir método y monto positivo para cada elemento de `payments[]`; la suma no puede superar el total de la venta.
- Mostrar total actualizado como vista previa.
- Deshabilitar botón mientras se confirma venta.
- Mostrar errores del backend por stock insuficiente, crédito bloqueado, permisos o conflicto.

## Después de confirmar

- Mostrar modal de venta exitosa.
- Permitir ver o imprimir ticket interno.
- Permitir abrir la consulta de documentos de la venta desde el mismo POS.
- Permitir reabrir un documento cancelado sin salir a un flujo paralelo.
- Limpiar carrito.
- Actualizar disponibilidad de productos de la ubicación afectada.

## Extensión: venta en punto externo

`SalesPosPage` debe reconocer cuando la ubicación seleccionada es `EXTERNAL_POINT_OF_SALE` y mostrar:

- Canal `EXTERNAL_POINT_OF_SALE`.
- Tipo de cliente: público general o cliente fijo.
- Documento interno: ticket/etiqueta de báscula, nota simple, nota grande o comprobante interno.
- Folio físico cuando aplique.
- Precio específico del cliente solo si el backend devuelve una política comercial autorizada.

La captura de ticket de báscula es manual. La UI puede registrar folio, producto, kilos, piezas, precio e importe mediante el flujo del cierre diario, pero no debe mostrar estados de conexión, sincronización o lectura de dispositivo.

La solicitud administrativa debe mostrarse como `BillingRequest` relacionada con la leyenda "Solicitud administrativa interna; no es CFDI". No debe mostrar timbrado, UUID fiscal, PAC, sellos o acciones SAT.
La consulta y reapertura de documentos debe ocurrir dentro de la misma venta, sin duplicar captura ni crear una pantalla paralela de documentos.

## Integración con cierre diario

- Una venta confirmada puede mostrar el cierre `DRAFT` de la ubicación y fecha, si existe.
- Asociar una venta al cierre no permite cambiar su ubicación, fecha, items, pago o movimiento de inventario.
- La UI debe advertir si la venta aún no está asociada al cierre, sin bloquear el reporte operativo casi en tiempo real.
- Las ventas a crédito se muestran separadas de efectivo; solo pagos aplicados pueden aparecer como ingreso de cobranza.
