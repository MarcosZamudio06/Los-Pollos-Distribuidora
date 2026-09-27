# Contrato de QR de producto

## Payload canónico

El QR de producto es un identificador derivado y versionado. El sistema no
persiste una imagen QR, un blob ni una cadena base64 en `Product` o en otra
tabla.

```text
ERP:PRODUCT:1:<productId>
```

Ejemplo:

```text
ERP:PRODUCT:1:cm123456
```

`<productId>` debe ser un identificador no vacío compuesto únicamente por
caracteres alfanuméricos, guion o guion bajo. El prefijo, el recurso y la
versión son sensibles a mayúsculas y minúsculas. No se aceptan espacios,
segmentos adicionales, versiones desconocidas ni valores con otros
separadores.

El helper compartido expone:

- `buildProductQrPayload(productId)`: valida el identificador y construye el
  payload canónico.
- `parseProductQrPayload(value)`: devuelve el `productId` únicamente cuando el
  valor coincide exactamente con el contrato; en otro caso devuelve `null`.

## Resolución en búsqueda de productos

La consulta existente mantiene los mismos filtros de actividad, ubicación,
existencia y permisos. Solo cambia el orden de resolución de una búsqueda con
texto:

1. Payload QR ERP válido → `Product.id` exacto.
2. Código de barras exacto.
3. SKU exacto.
4. Nombre parcial.

Un QR válido no puede escapar el `isActive`, el alcance de
`OperationalLocation`, `requireInventoryBalance`, las relaciones de inventario
ni los permisos del actor.

## Catálogo

Después de crear o consultar un producto, el catálogo puede generar el QR bajo
demanda. La vista muestra el nombre, SKU cuando existe, código de barras cuando
existe e identificador del producto. La imagen se genera únicamente en el
cliente y permite imprimir la etiqueta o descargar PNG/SVG. No se incrustan
logos.

## POS

El input `pos-product-search` acepta el payload QR entregado por un lector
USB/HID. El resultado se agrega mediante el mismo flujo de código de barras; un
escaneo repetido incrementa la cantidad existente y no crea una segunda lógica
de carrito.

## Pruebas mínimas

- Construcción y parseo del payload válido.
- Rechazo de payloads inválidos.
- QR de producto inexistente o inactivo.
- Conservación del alcance de ubicación e inventario.
- Escaneo QR en `pos-product-search` y repetición que incrementa cantidad.
- No regresión de barcode, SKU y nombre.
