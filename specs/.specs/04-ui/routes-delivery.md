# UI — Rutas y Reparto

## Objetivo

Administrar rutas, asignación de pedidos, experiencia móvil de repartidor, evidencia de entrega, cobros en ruta, segunda vuelta de cobranza, incidencias, devoluciones y liquidación operativa.

La experiencia móvil del chofer forma parte del MVP, pero no se asume operación offline hasta que exista decisión de negocio y arquitectura.

La planeación geoespacial utiliza React Leaflet con datos de OpenStreetMap. Photon, VROOM y OSRM se consumen exclusivamente a través de la API NestJS; el navegador no conoce sus URLs internas.

## Alcance TASK-071 — Administrador de rutas

Pantallas y componentes requeridos:

- `DeliveryRoutesPage`.
- `RoutePlannerPage` en `/delivery-routes/new`.
- `CreateRouteModal` queda deprecated y deja de invocarse desde el flujo primario; la acción Crear ruta navega al planificador.
- `AssignOrdersModal`.
- `RouteDetailPage`.
- `RouteEvidenceReview`.
- `RouteSettlementView`.

## Alcance TASK-072 — Repartidor

Pantallas y componentes requeridos:

- `MyRoutesPage`.
- `DeliveryOrderCard`.
- `UpdateDeliveryStatusDialog`.
- `DeliveryEvidenceCapture`.
- `RouteCollectionDialog`.
- `RouteSecondPassCollectionDialog`.
- `DeliveryIncidentDialog`.

## Pantalla de administrador

Debe consumir `GET /api/delivery-routes`.

Tabla de rutas:

- Nombre.
- Repartidor.
- Fecha programada.
- Ubicación operativa de origen.
- Ubicación `ROUTE_STOCK`.
- Estado.
- Pedidos.
- Pedidos pendientes.
- Liquidación asociada cuando exista.
- Acciones.

Filtros:

- Repartidor.
- Estado.
- Fecha programada.
- Ubicación operativa de origen.

Acciones:

- Crear ruta.
- Asignar pedidos confirmados al crear una ruta o a una ruta existente elegible.
- Ver detalle.
- Revisar evidencias.
- Abrir liquidación de ruta mediante `POST /api/delivery-routes/:routeId/settlement` cuando la ruta sea elegible y aún no exista liquidación asociada.
- Consultar liquidación mediante `GET /api/route-settlements/:id` cuando la ruta muestre `routeSettlementId`.
- Cerrar liquidación mediante `POST /api/route-settlements/:id/close` desde la vista de liquidación cuando el rol y estado lo permitan.

Las rutas optimizadas deben mostrar `mapAvailable`, distancia, duración y estado de optimización. Las rutas históricas sin mapa conservan las acciones y presentación textual existentes.

## Planificador geoespacial

Debe consumir:

- `GET /api/delivery-route-planning/eligible-sales`.
- `GET /api/geocoding/search`.
- `GET /api/geocoding/reverse`.
- `POST /api/delivery-route-plans`.
- `POST /api/delivery-routes` al confirmar.

Estructura:

- Página dedicada, no modal, por el tamaño y complejidad del mapa.
- Panel de planeación con nombre, fecha, origen, repartidor y ventas elegibles.
- Mapa principal con origen, marcadores numerados y recorrido optimizado.
- Lista ordenada sincronizada con los marcadores; la lista es la alternativa accesible y no depende del mapa.
- Resumen de distancia total, duración estimada, número de paradas y regreso al origen.

Flujo:

1. Seleccionar nombre, fecha, ubicación operativa de origen y repartidor activo.
2. Seleccionar una o varias ventas elegibles; no permitir paradas libres.
3. Proponer la dirección de entrega del cliente sin modificarla en su registro fuente.
4. Buscar cada dirección con Photon o colocar/mover manualmente el marcador.
5. Exigir coordenadas válidas para origen y todas las paradas.
6. Calcular la ruta. VROOM define el orden y OSRM devuelve el recorrido vial origen-paradas-origen.
7. Mostrar la previsualización con marcadores numerados y métricas.
8. Cualquier cambio de origen, repartidor o paradas invalida la previsualización y obliga a recalcular.
9. Confirmar la creación consumiendo `routePlanId` con `Idempotency-Key`.

Estados y errores:

- Dirección ambigua: mostrar alternativas y permitir pin manual.
- Photon no disponible: conservar la captura sin coordenadas, impedir optimizar y permitir reintentar.
- Parada inalcanzable: identificar la venta afectada, mantener el formulario y no permitir crear.
- VROOM u OSRM no disponible: mostrar error reintentable y no convertir el orden ingresado en una ruta supuestamente optimizada.
- Plan expirado o invalidado por concurrencia: recalcular antes de confirmar.
- Una sola parada sigue mostrando el recorrido origen-entrega-origen.
- Varias ventas en las mismas coordenadas permanecen como pedidos independientes y visibles en la lista.

Accesibilidad y responsive:

- Marcadores, colores y línea no son la única fuente de información.
- Todas las paradas se pueden seleccionar desde teclado en la lista.
- Foco visible y relación clara entre fila y marcador numerado.
- En móvil, mapa y lista se apilan; la creación sigue siendo administrativa y no se convierte en navegación GPS.
- La atribución de OpenStreetMap permanece visible.

## Crear ruta y asignar pedidos

Debe consumir `POST /api/delivery-route-plans` y `POST /api/delivery-routes` para crear rutas geoespaciales. `POST /api/delivery-routes/:id/orders` usa un nuevo plan completo para agregar pedidos a una ruta optimizada existente.

Campos:

- Nombre.
- Repartidor.
- Fecha programada.
- Ubicación operativa de origen opcional cuando la operación la defina.
- Ubicación `ROUTE_STOCK` asociada o autogenerada.
- Pedidos/ventas confirmadas.
- Dirección de entrega por pedido.
- Cuenta por cobrar asociada cuando la venta tenga saldo a crédito.

Validaciones:

- Repartidor requerido.
- Fecha requerida.
- La ruta debe mostrar o crear una ubicación `ROUTE_STOCK` antes de operar inventario.
- Solo ventas confirmadas.
- No asignar ventas canceladas.
- Conservar `accountReceivableId` cuando exista saldo a crédito.
- Para asignación adicional, no permitir rutas completadas, canceladas o con liquidación abierta/cerrada.
- No enviar ni editar `routeSettlementId` al asignar pedidos.
- No permitir crear una ruta geoespacial sin previsualización vigente.
- Para una ruta optimizada, cualquier pedido adicional exige recalcular todas las paradas antes de guardar.

## Detalle de ruta

Debe consumir `GET /api/delivery-routes/:id`.

Debe mostrar:

- Encabezado de ruta.
- Ubicación `ROUTE_STOCK` asociada.
- Pedidos con venta, cliente, dirección, estado, saldo por cobrar, monto cobrado, entregado por y cobrado por.
- Resumen de evidencias.
- Resumen de cobros por método y vuelta de cobranza.
- `routeSettlementId` solo si existe liquidación asociada.
- Mapa, paradas numeradas, distancia y duración cuando `mapAvailable=true`.

Relación visible con liquidación:

- Si `routeSettlementId` está presente, la UI debe mostrar identificador o enlace de liquidación asociada y habilitar la acción de consultar liquidación con `GET /api/route-settlements/:id`.
- Si `routeSettlementId` está ausente o es `null`, la UI debe mostrar que la ruta aún no tiene liquidación y ofrecer la acción de abrir liquidación solo cuando el rol y el estado de la ruta lo permitan.
- La UI no debe solicitar `routeSettlementId` al crear rutas, actualizar pedidos, registrar evidencia, registrar incidencias ni registrar cobros; solo debe mostrarlo cuando la API lo devuelva.

## Experiencia del repartidor

Debe mostrar solo rutas asignadas al usuario `DRIVER`.

Cuando `mapAvailable=true`, debe mostrar el recorrido estático aprobado por ADMIN, el origen, el regreso al origen y las paradas según `stopSequence`. El mapa no solicita ubicación del dispositivo ni recalcula el trayecto.

Cada pedido debe mostrar:

- Cliente.
- Dirección de entrega.
- Venta asociada.
- Estado.
- Saldo por cobrar cuando aplique y el rol tenga permiso.
- Entregado por.
- Cobrado por.
- Vuelta de cobranza.
- Notas.
- Evidencias capturadas.
- Acciones permitidas.
- Número de parada y duración/distancia del tramo cuando existan.

Estados de pedido soportados:

- Pendiente.
- En ruta.
- Entregado.
- No entregado.
- Cancelado.
- Rechazo parcial.
- Devuelto.

## Actualización de estado

Debe consumir `PATCH /api/delivery-orders/:id/status`.

Validaciones:

- El repartidor solo actualiza pedidos asignados.
- Al entregar, registrar fecha y hora de entrega.
- Rechazo parcial, devolución o incidencia requiere nota o motivo.

## Evidencia de entrega

Debe consumir `POST /api/delivery-orders/:id/evidence`.

Tipos permitidos:

- Foto.
- Firma.
- Geolocalización.
- Nota.

Restricciones:

- La combinación obligatoria de evidencia queda pendiente de negocio.
- La UI no debe imponer una combinación final no definida.
- No asumir almacenamiento ni sincronización offline.

## Cobros en ruta

Debe consumir `POST /api/delivery-orders/:id/collections`.

Campos:

- Cuenta por cobrar (`accountReceivableId`) requerida.
- Monto.
- Método de pago.
- Referencia.
- Fecha de pago.
- Vuelta de cobranza.

Reglas UI:

- Solo permitir cobro cuando exista saldo por cobrar y la política lo permita.
- No permitir monto mayor al saldo pendiente mostrado.
- Cada cobro del MVP se aplica a una sola cuenta por cobrar.
- Mostrar montos cobrados derivados de `Payment`, nunca de un campo monetario persistido en `DeliveryOrder`.
- Permitir identificar si el cobro corresponde a primera o segunda vuelta de cobranza.
- Mostrar `routeSettlementId` solo cuando ya exista liquidación asociada.
- Cuando el cobro devuelto por `POST /api/delivery-orders/:id/collections` incluya `payment.routeSettlementId`, la UI debe mostrar que ese cobro quedó relacionado con la liquidación de ruta correspondiente.
- Cuando `payment.routeSettlementId` sea `null` u omitido, la UI debe mostrar el cobro como asociado a la ruta, pero aún sin liquidación asociada.
- La relación entre cobros y liquidación debe visualizarse en el resumen de cobros de la ruta y en la vista de liquidación, sin permitir editar manualmente `routeSettlementId` desde la UI.

## Incidencias y devoluciones

Debe consumir `POST /api/delivery-orders/:id/incidents`.

Debe permitir:

- No entrega.
- Devolución.
- Rechazo parcial.
- Incidencia operativa.

Campos:

- Estado final de incidencia.
- Motivo obligatorio.
- Productos devueltos cuando aplique.
- Unidad, kilos y piezas según producto.

## Liquidación de ruta

Debe consumir `GET /api/route-settlements`, `GET /api/route-settlements/:id`, `POST /api/delivery-routes/:routeId/settlement` y `POST /api/route-settlements/:id/close` conforme a `route-settlements-api.md`.

Acciones requeridas:

- Abrir o calcular liquidación desde una ruta mediante `POST /api/delivery-routes/:routeId/settlement`. Al recibir respuesta exitosa, la UI debe reflejar el `routeSettlementId` asociado a la ruta cuando el contrato lo devuelva o al volver a consultar la ruta.
- Consultar liquidación desde la tabla o detalle de ruta usando `routeSettlementId` y `GET /api/route-settlements/:id`; también puede listarse mediante `GET /api/route-settlements` con filtros autorizados.
- Cerrar liquidación desde `RouteSettlementView` mediante `POST /api/route-settlements/:id/close`, capturando notas cuando aplique y mostrando errores de backend por pedidos sin estado final, diferencias o permisos.

Debe mostrar:

- Pedidos entregados, no entregados y con incidencia.
- Cobros esperados y cobrados por método.
- Cobros al entregar, abonos, transferencias/depositos y cobranza posterior.
- Pagos asociados con `accountReceivableId` como única fuente monetaria.
- Devoluciones o rechazos que afecten inventario.
- Diferencias contra `ROUTE_STOCK` y su resolución trazable.
- Diferencia.
- Estado de liquidación: abierta, cerrada o requiere revisión.

No sustituye reportes operativos casi en tiempo real ni corte contable.

## Permisos

- `ADMIN`: crear rutas, asignar pedidos, revisar evidencias e incidencias, abrir/cerrar liquidaciones.
- `DRIVER`: consultar y actualizar rutas propias, capturar evidencia, registrar incidencias y cobros permitidos.
- `COLLECTIONS`: consultar cobros, saldos y liquidaciones; conciliar conforme a permisos.
- `WAREHOUSE`: consultar devoluciones o movimientos relacionados cuando afecten inventario.
- `SELLER`: consulta de estado si se autoriza.

## Estados de pantalla

Toda vista debe contemplar:

- Loading.
- Error.
- Empty.
- Success.
- Unauthorized.
- Geocoding unavailable.
- Optimization unavailable.
- Unreachable stops.
- Expired plan.
- Legacy route without map.

## Validaciones

- No crear ruta sin repartidor.
- No crear ruta sin fecha.
- No optimizar sin ubicación operativa de origen geocodificada.
- No optimizar sin al menos una venta confirmada.
- No optimizar con una parada sin coordenadas válidas.
- No crear desde un plan expirado, consumido o invalidado.
- No mostrar una geometría distinta de la aprobada por ADMIN.
- No permitir que `DRIVER` consulte el mapa de una ruta ajena.
- No asignar ventas canceladas.
- No completar ruta con pedidos pendientes sin estado final.
- No registrar cobro sin cuenta por cobrar en MVP.
- No omitir entregado por, cobrado por o vuelta de cobranza cuando el flujo los requiera.
- Mostrar errores del backend por permisos, saldos, rutas ajenas o conflictos de liquidación.
