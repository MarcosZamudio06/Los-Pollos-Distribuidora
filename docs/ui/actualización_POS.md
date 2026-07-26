# Actualización del POS

## Dirección visual

La pantalla representa una mesa de despacho de una distribuidora de pollo: una superficie clara de preparación, divisiones de acero, tinta oscura para datos y rojo únicamente para la acción irreversible.

Tokens principales:

- Porcelana: `#F5F7F4`.
- Acero: `#D7E0DD`.
- Tinta: `#17211E`.
- Rojo de acción: `#B62A22`.
- Ámbar de captura: `#E9A72F`.
- Verde de estado: `#23715A`.

La firma visual es el **riel de despacho**: el carrito central concentra la comanda y queda conectado al teclado numérico contextual para capturar kilos o piezas sin abrir otro formulario.

## Distribución

En escritorio, la vista utiliza el alto disponible y tres zonas con scroll interno. La página no debe crecer por cada partida o campo de cobro.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Sucursal · Caja · Vendedor       Online   Impresora   Báscula         Total │
├────────────────────────┬───────────────────────────────┬────────────────────┤
│ PRODUCTOS              │ RIEL DE DESPACHO             │ COBRO               │
│ [Escanea SKU / busca]  │ Producto · kilos · piezas    │ Cliente             │
│ Frecuentes recientes   │ Producto · kilos · piezas    │ Contado / crédito   │
│ Todos · categorías     │                              │ Pagos / cambio      │
│ resultados compactos   │ Teclado numérico contextual  │ Documento / folio   │
│                        │                              │ Solicitud admin.    │
│                        │                              │ TOTAL · CONFIRMAR   │
├────────────────────────┴──────────────────────────────┴──────────────────── ┤
│ F2 Buscar · F4 Cliente · F6 Pago · F8 Confirmar · F9 Nueva venta            │
└─────────────────────────────────────────────────────────────────────────────┘
```

En pantallas medianas las tres zonas se apilan con el total y la confirmación visibles dentro del flujo. En móvil se conserva la misma secuencia: productos, carrito y cobro.

## Interacción implementada

- La búsqueda recibe autofocus al abrir el POS y después de agregar un producto por código.
- `Enter` intenta resolver el valor exacto por SKU o nombre. Los lectores que funcionan como teclado pueden enviar SKU y `Enter`.
- Si la respuesta del catálogo llega después del `Enter`, la búsqueda mantiene el código pendiente y agrega el producto cuando el resultado exacto aparece.
- `Frecuentes recientes` muestra productos agregados durante la sesión actual. No se presenta como histórico global porque todavía no existe un contrato de frecuencia por ubicación.
- Los filtros de categoría se derivan de los productos devueltos por el catálogo actual.
- El teclado numérico modifica kilos o piezas del renglón activo y respeta decimales solo para kilos.
- `F2` enfoca productos.
- `F4` enfoca clientes.
- `F6` enfoca el primer control de pago.
- `F8` abre la confirmación.
- `F9` inicia una nueva venta.
- `Nueva venta` solicita confirmación cuando existe una captura en curso.
- La confirmación se bloquea durante el envío y conserva la misma clave de idempotencia para reintentos.
- El botón de pantalla completa usa la Fullscreen API cuando el navegador la permite.

## Estados operativos

- Conexión: se refleja con `navigator.onLine` y eventos `online` / `offline`.
- Impresora: se muestra `No configurada`; el navegador no permite afirmar que una impresora física está conectada sin un contrato de integración.
- Báscula: se muestra `Captura manual`; el MVP no integra hardware automáticamente.
- El stock siempre se muestra por ubicación operativa, nunca como stock global.

## Confirmación

El diálogo de confirmación presenta antes de registrar:

- Cliente y sucursal.
- Canal y tipo de venta.
- Documento interno y folio físico.
- Cada producto, kilos, piezas, precio unitario e importe.
- Subtotal, descuento autorizado, total pagado y saldo pendiente de esta venta.
- Saldo histórico del cliente cuando el backend lo entregó.
- Métodos de pago.
- Solicitud administrativa y su motivo.
- Autorización administrativa de crédito cuando aplica.

Las solicitudes administrativas se identifican como relación interna. Ningún texto del POS las presenta como CFDI, factura fiscal, timbrado o integración SAT.

## Límites de contrato

- `Product` actualmente expone `sku`, no un campo independiente de código de barras. La lectura implementada usa SKU como código compatible con lectores tipo teclado.
- Los descuentos no se capturan como porcentaje. El backend exige `discountAuthorizationId`; la UI muestra `No aplicado` hasta que exista una autorización seleccionable.
- La disponibilidad de impresora y báscula no se simula ni se marca como conectada.
