# UI — Recepción de suministros CEDIS

## Acceso

La pantalla está disponible para `ADMIN`, `WAREHOUSE` y `SELLER` cuando poseen
`cedis.receive_supplies`. `SELLER` solo ve suministros destinados a su sucursal;
`WAREHOUSE` ve las sucursales directas de su CEDIS y `ADMIN` puede consultar el
alcance completo.

## Bandeja

- Ruta: `/cedis/incoming`.
- Selector de fecha operativa y estado.
- Envíos del día en una cuadrícula de dos columnas en escritorio y una en móvil.
- Los pendientes aparecen antes que los recibidos y dentro de cada grupo se
  ordenan por hora de solicitud descendente.
- Cada tarjeta muestra folio, origen, destino, hora, estado, nota del despacho,
  número de productos y totales de KG/piezas.
- La llegada de un suministro produce una actualización en tiempo real; REST
  sigue siendo la fuente de verdad y se consulta de nuevo tras reconexión.
- Deben resolverse loading, refreshing, error, empty, unauthorized y stale.

## Detalle y recepción

- Las cantidades enviadas son de solo lectura.
- Por partida se capturan KG y/o piezas según la unidad del producto.
- La diferencia se calcula como `recibido - enviado` y se actualiza en vivo.
- Una diferencia exige nota antes de confirmar.
- La confirmación muestra un resumen y evita doble envío mientras la mutación
  está pendiente.
- Después de confirmar, la vista muestra actor, fecha, nota, cantidades
  recibidas y diferencias sin permitir edición.

## Vista CEDIS

El detalle de la sucursal muestra el estado de recepción, cantidades recibidas,
diferencias, nota, empleado y fecha junto con las cantidades enviadas. No se
exponen costos sin `cedis.view_costs`.
