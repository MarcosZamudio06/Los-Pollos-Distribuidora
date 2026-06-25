# Convenciones API

## Prefijo

Todas las rutas deben iniciar con:

```text
/api
```

## Formato de respuesta exitosa

```json
{
  "success": true,
  "message": "Operación realizada correctamente",
  "data": {}
}
```

## Formato de respuesta con error

```json
{
  "success": false,
  "message": "Descripción del error",
  "error": "ERROR_CODE",
  "statusCode": 400
}
```

## Paginación

Para listados:

```text
?page=1&limit=10&search=texto
```

Respuesta:

```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "limit": 10,
    "totalPages": 0
  }
}
```

## Autenticación

Enviar token en header:

```text
Authorization: Bearer <token>
```

## Códigos HTTP

- 200: operación exitosa.
- 201: recurso creado.
- 400: datos inválidos.
- 401: no autenticado.
- 403: sin permisos.
- 404: recurso no encontrado.
- 409: conflicto de negocio.
- 500: error interno.

## Validaciones

Todos los endpoints que reciben body deben usar DTOs y validación.

## Reglas transversales del MVP

- Todas las rutas, excepto autenticación pública, requieren `Authorization: Bearer <token>`.
- Los permisos se validan por rol y por alcance operativo cuando aplique, por ejemplo vendedor propio, repartidor asignado o ubicación autorizada.
- Las respuestas no deben exponer `passwordHash`, secretos, tokens internos ni datos sensibles innecesarios.
- Las operaciones que modifican inventario, ventas, compras, cuentas por cobrar, pagos, rutas o liquidaciones deben devolver el recurso afectado con identificadores de trazabilidad.
- Las cantidades por kilo deben aceptar decimales; las cantidades por pieza deben ser enteras salvo decisión posterior de negocio.
- Todo endpoint que afecte inventario debe recibir o resolver explícitamente una ubicación operativa y conservarla en la respuesta.
- Los reportes operativos deben basarse en operaciones confirmadas y reflejar cambios con latencia máxima esperada de 60 segundos en condiciones normales.
- El comprobante del MVP es ticket o comprobante interno. No debe exponerse como CFDI, factura fiscal, timbrado SAT, PAC ni UUID fiscal.
- En el MVP, cada pago se aplica a una sola cuenta por cobrar mediante `accountReceivableId` requerido.

## Nombres de campos de unidad y ubicación

Para productos, ventas, compras, inventario y traspasos se deben usar estos nombres de referencia:

- `presentationType`: `KG`, `WHOLE` o `CUT` para el catálogo semántico del producto.
- `unit`: `KG`, `PIECE` o `KG_AND_PIECE` según el producto.
- `quantityKg`: cantidad en kilos cuando aplique.
- `quantityPieces`: cantidad en piezas cuando aplique.
- `unitEquivalentId`: equivalencia kilo-pieza oficial aplicada cuando exista.
- `appliedEquivalentFactor`: factor aplicado al momento de la operación cuando corresponda.
- `locationId`: ubicación operativa afectada o de descuento/recepción.
- `originLocationId` y `destinationLocationId`: ubicaciones de traspaso.
