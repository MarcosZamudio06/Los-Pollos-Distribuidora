## Flujo operativo canonico

### 1. Abastecimiento e inventario

1. Matriz recibe o compra producto.
2. Producto se registra por kilos, piezas o ambas unidades.
3. Matriz envia producto a pollerias externas o rutas mediante traspaso/movimiento trazable.
4. Cada ubicacion destino recibe kilos/productos como entrada operativa.
5. No se debe usar stock global para vender o reportar.

### 2. Venta en punto externo

1. Cliente compra al detalle o como cliente fijo.
2. La venta puede generarse por ticket de bascula, nota sencilla o nota grande.
3. El sistema registra producto, kilos/piezas, precio, importe, folio fisico y ubicacion.
4. Si es contado, registra pago.
5. Si es credito, genera cuenta por cobrar.
6. Al final del dia se realiza corte diario con entradas, salidas, ingresos, gastos y utilidad.

### 3. Venta de menudeo con reparto

1. Administracion o vendedor registra venta/nota para cliente de reparto.
2. Se asigna a ruta/repartidor.
3. Repartidor entrega producto.
4. La venta puede quedar pagada, a credito o con abono.
5. Puede existir segunda vuelta de cobranza por el mismo u otro repartidor.
6. La ruta se liquida con efectivo, transferencias, abonos, creditos pendientes y diferencias.

### 4. Clientes facturados

1. Cliente institucional/mayorista tiene numero interno, RFC, razon social, alias y correo.
2. Venta facturable se registra por nota/folio, producto, kilos, precio e importe.
3. Si queda a credito, genera cuenta por cobrar.
4. Pagos se registran por fecha, metodo, banco, referencia y documento aplicado.
5. Reportes muestran facturado, pagado, saldo final, vencido y por vencer.
6. No se genera CFDI en MVP.

---

## Modulos principales

- Auth.
- Usuarios/RBAC.
- Ubicaciones operativas.
- Productos y categorias.
- Equivalencias kilo-pieza.
- Inventario.
- Traspasos.
- Ventas/POS.
- Documentos de venta internos.
- Clientes.
- Politicas comerciales.
- Cuentas por cobrar.
- Pagos/cobranza.
- Compras/proveedores.
- Rutas/reparto.
- Liquidaciones de ruta.
- Cortes diarios de punto de venta.
- Reportes.
- Configuracion operativa.
