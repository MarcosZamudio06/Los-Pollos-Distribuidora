# UI — Inventario

## Objetivo

Permitir administrar productos, categorías, catálogo semántico del producto, saldos por ubicación operativa, ajustes, movimientos, equivalencias kilo-pieza y traspasos de inventario sin depender de stock global por producto.

## Alcance TASK-033

Pantallas y componentes requeridos:

- `ProductListPage`.
- `ProductFormModal`.
- `InventoryAdjustmentModal`.
- `InventoryByLocationView`.
- `InventoryTransferView`.
- `InventoryMovementsView`.
- `LowStockBadge`.
- Servicio y hooks de productos.

## Pantalla principal: productos

Debe consumir `GET /api/products` y permitir consulta de disponibilidad por `locationId` cuando aplique.

Columnas:

- Nombre.
- SKU.
- Categoría.
- Presentación.
- Precio venta.
- Costo.
- Unidad operativa: `KG`, `PIECE`, `KG_AND_PIECE`.
- Equivalencia visible o estado de política de equivalencia.
- Ubicación operativa seleccionada.
- Saldo en kilos (`quantityKg`).
- Saldo en piezas (`quantityPieces`).
- Mínimo por ubicación.
- Bajo stock por ubicación.
- Estado activo/inactivo.
- Acciones.

No debe mostrar `stock` global como disponibilidad operativa.

## Filtros

- Búsqueda por nombre o SKU.
- Categoría.
- Presentación.
- Unidad operativa.
- Ubicación operativa (`locationId`).
- Bajo stock, solo con ubicación seleccionada.
- Activo/inactivo.

## Formulario de producto

Debe alinearse con `POST /api/products` y `PATCH /api/products/:id`.

Campos:

- Nombre.
- SKU opcional.
- Descripción.
- Categoría.
- Presentación: kilo, unidad entera o corte.
- Precio venta.
- Costo.
- Stock mínimo comercial del producto.
- Unidad operativa: kilo, pieza o ambas.
- Peso equivalente por pieza como dato operativo opcional mientras la equivalencia oficial no esté aprobada.
- Estado de política de equivalencia.

Restricciones:

- No capturar stock operativo en el formulario de producto.
- No modificar saldos desde el endpoint de producto.
- La presentación semántica del producto debe distinguir pollo entero de cortes y no debe inferirse solo por el nombre.
- Si el producto usa kilo y pieza, mostrar aviso de que la equivalencia oficial se gestiona en el flujo de equivalencias.

## Vista de saldos por ubicación

Debe consumir `GET /api/inventory/balances`.

Debe mostrar:

- Producto.
- Ubicación operativa.
- Kilos disponibles.
- Piezas disponibles.
- Mínimo en kilos.
- Mínimo en piezas.
- Estado de bajo stock.

La vista debe agrupar o filtrar claramente por ubicación. No debe consolidar como único stock global.

## Ajustes de inventario

Debe consumir `POST /api/inventory/adjustments`.

Campos:

- Producto.
- Ubicación operativa (`locationId`).
- Tipo de movimiento.
- Unidad.
- Cantidad en kilos cuando aplique.
- Cantidad en piezas cuando aplique.
- Motivo obligatorio.
- Referencia operativa opcional.

Tipos esperados incluyen ajuste, merma, devolución o pérdida operativa según API y reglas de negocio.

## Movimientos de inventario

Debe consumir `GET /api/inventory/movements`.

Filtros:

- Producto.
- Ubicación operativa.
- Tipo de movimiento.
- Referencia.
- Rango de fechas.

Columnas:

- Producto.
- Ubicación.
- Tipo.
- Kilos.
- Piezas.
- Saldos anteriores y nuevos.
- Motivo.
- Referencia.
- Usuario.
- Fecha.

## Traspasos de inventario

Debe consumir `GET /api/inventory-transfers`, `GET /api/inventory-transfers/:id`, `POST /api/inventory-transfers`, `POST /api/inventory-transfers/:id/confirm` y `POST /api/inventory-transfers/:id/cancel`.

Debe incluir:

- Lista de traspasos con origen, destino, estado, responsable, fechas y acción para consultar detalle.
- Formulario de traspaso con ubicación origen, ubicación destino, notas y productos.
- Vista o panel de detalle obtenido mediante `GET /api/inventory-transfers/:id`, mostrando encabezado, productos, unidad, kilos, piezas y movimientos `TRANSFER_OUT`/`TRANSFER_IN` cuando el traspaso ya esté confirmado.
- Consulta del detalle desde la lista por selección de traspaso o navegación a detalle usando el `id` del traspaso; la UI no debe reconstruir el detalle solo desde la lista.
- Acción de confirmar cuando el rol y estado lo permitan.
- Acción de cancelar con motivo.

Validaciones UI:

- Origen y destino requeridos.
- Origen y destino no pueden ser iguales.
- Al menos un producto requerido.
- No permitir cantidades menores o iguales a cero.
- Las piezas deben capturarse como enteros.
- Mostrar error de backend por stock insuficiente en origen.

## Equivalencias kilo-pieza

Debe existir vista o sección autorizada para consultar y gestionar equivalencias oficiales mediante API de equivalencias.

La integración UI debe consumir:

- `GET /api/products/:productId/equivalences` para listar equivalencias del producto seleccionado, filtrar por estado, par de unidades o fecha aplicable, y mostrar la equivalencia activa cuando exista.
- `POST /api/products/:productId/equivalences` para crear equivalencias en el flujo autorizado.
- `PATCH /api/product-equivalences/:id` para actualizar metadatos o estado permitido sin sobrescribir historial.
- `POST /api/product-equivalences/:id/activate` para activar una equivalencia aprobada.
- `POST /api/product-equivalences/:id/deactivate` para desactivar una equivalencia sin eliminarla físicamente.

La pantalla principal de productos y el detalle de producto deben mostrar las equivalencias visibles expuestas por `GET /api/products` y `GET /api/products/:id`. Cuando se requiera administrar equivalencias de un producto, la UI debe abrir la sección de equivalencias usando el `productId` y consultar `GET /api/products/:productId/equivalences`; no debe calcular ni persistir equivalencias solo en componentes frontend.

Debe mostrar:

- Producto.
- Unidad origen.
- Unidad destino.
- Factor.
- Modo de redondeo registrado.
- Vigencia.
- Estado: borrador, activa o inactiva.

Restricciones:

- No convertir kilo/pieza solo en frontend.
- No inventar regla final de redondeo.
- No modificar una equivalencia histórica sin preservar trazabilidad.

## Permisos

- `ADMIN`: acceso completo.
- `WAREHOUSE`: productos, saldos, ajustes, movimientos, traspasos y equivalencias conforme a política.
- `SELLER`: lectura de productos y disponibilidad para POS.
- `DRIVER`: sin acceso administrativo; solo referencias indirectas desde reparto.
- `COLLECTIONS`: sin acceso operativo a inventario, salvo reportes autorizados.

## Estados de pantalla

Toda vista debe contemplar:

- Loading.
- Error.
- Empty.
- Success.
- Unauthorized.

## Validaciones UI

- Nombre requerido.
- Precio de venta mayor a cero.
- Costo mayor o igual a cero.
- Unidad requerida.
- Stock por ubicación no negativo.
- Kilos permiten decimales.
- Piezas deben ser enteras.
- Motivo obligatorio en ajustes, mermas, devoluciones y pérdidas.
- Mostrar errores del backend sin ocultar conflictos de negocio.

## Extensión: conciliación de puntos externos

Las vistas por ubicación deben admitir `EXTERNAL_POINT_OF_SALE` y permitir a usuarios autorizados consultar:

- Traspasos recibidos desde matriz.
- Kilos y piezas enviados, recibidos y disponibles.
- Movimientos relacionados con un cierre diario.
- Ajustes autorizados por sobrante, faltante, merma o diferencia física.

La UI de inventario no debe editar `PointOfSaleDailyCloseLine` como sustituto de inventario. Si una diferencia requiere corrección física, debe abrir `InventoryAdjustmentModal` con la ubicación y referencia del cierre, exigir motivo y usar `POST /api/inventory/adjustments`.

Permisos adicionales:

- `WAREHOUSE` consulta entradas, traspasos y kilos enviados para conciliación.
- `SELLER` consulta disponibilidad de su punto, pero no registra ajustes sin permiso.
- `COLLECTIONS` no modifica inventario.

Las diferencias deben mostrarse como advertencias visibles y nunca compensarse automáticamente.
