# PRD — Sistema para Distribuidora de Pollos

## 1. Objetivo del producto

Desarrollar un sistema empresarial para administrar la operación real de una distribuidora de pollos, permitiendo controlar ventas, inventario por ubicación, compras, clientes de menudeo, mayoristas e institucionales, reparto, cuentas por cobrar, clientes facturados, documentos internos de venta, caja y reportes operativos casi en tiempo real.

El sistema debe reducir errores manuales, mejorar el control de stock por kilos y piezas, agilizar la venta de mostrador, menudeo y reparto, dar seguimiento a entregas, cobranza y crédito atrasado, y proporcionar información confiable para la toma de decisiones operativas.

## 1.1 Alcance operativo del producto

El producto incluye cuatro superficies de uso dentro del alcance de negocio:

- Administración web para propietarios, administradores y personal autorizado.
- Interfaz web tipo escritorio para ventas/POS en mostrador y toma de pedidos.
- Interfaz web tipo escritorio para almacén, entradas, salidas, ajustes y traspasos.
- Aplicación móvil o experiencia móvil para choferes/repartidores.

La aplicación móvil para choferes forma parte del alcance real del MVP por la necesidad operativa de entrega, evidencia y liquidación. Su forma técnica definitiva queda pendiente para arquitectura; puede resolverse como aplicación móvil nativa, PWA o interfaz web móvil, pero el alcance de negocio sí debe considerarla.

## 2. Usuarios del sistema

### Administrador

Usuario con acceso completo al sistema.

Puede:

- Gestionar usuarios y roles.
- Administrar productos, inventario y precios.
- Registrar compras.
- Consultar ventas.
- Ver reportes.
- Configurar rutas de reparto.
- Cancelar ventas conforme a permisos.

### Vendedor

Usuario encargado del punto de venta.

Puede:

- Registrar ventas.
- Buscar productos.
- Aplicar descuentos autorizados.
- Imprimir o generar ticket.
- Consultar ventas propias del día.

No puede:

- Modificar costos de compra.
- Eliminar productos.
- Ver reportes financieros globales salvo autorización.

### Almacenista

Usuario encargado del control físico de inventario.

Puede:

- Consultar existencias.
- Registrar entradas de mercancía.
- Registrar ajustes autorizados.
- Ver productos con bajo stock.

No puede:

- Registrar ventas.
- Consultar ingresos financieros.

### Repartidor

Usuario encargado de entregas.

Puede:

- Ver pedidos asignados.
- Cambiar estado de entrega.
- Registrar evidencia de entrega.
- Consultar ruta asignada.
- Registrar cobros recibidos durante la ruta cuando el pedido lo permita.
- Registrar incidencias de entrega, rechazo o devolución.

No puede:

- Modificar precios.
- Crear productos.
- Cancelar ventas.

### Cobrador / Responsable de cobranza

Usuario encargado de dar seguimiento a cuentas por cobrar de clientes con crédito.

Puede:

- Consultar saldos vencidos y por vencer.
- Registrar pagos parciales o totales.
- Consultar historial de pagos del cliente.
- Identificar clientes bloqueados por mora o límite de crédito.

No puede:

- Modificar inventario.
- Cambiar precios de productos salvo autorización.
- Cancelar ventas sin permiso administrativo.

## 3. Módulos principales

- Autenticación y usuarios.
- Inventario.
- Ventas/POS.
- Cierre diario de punto de venta.
- Clientes.
- Compras.
- Rutas y reparto.
- Cuentas por cobrar y cobranza.
- Documentos de venta internos y relación administrativa de notas.
- Facturación básica y solicitudes administrativas de factura.
- Reportes.
- Configuración.

## 4. Alcance inicial MVP

El MVP real debe incluir:

- Inicio de sesión.
- Control de usuarios y roles.
- Catálogo de productos.
- Control de inventario por ubicación operativa.
- Manejo de productos clasificados como kilo, unidad entera o corte, con venta por kilo, por pieza o por ambas unidades cuando aplique.
- Registro de ventas.
- Descuento automático de stock.
- Registro de clientes, incluyendo clientes mayoristas, institucionales y facturados.
- Ventas de contado, ventas a crédito corto y ventas atrasadas para clientes autorizados.
- Cuentas por cobrar con saldos, vencimientos, abonos, pagos parciales y bloqueo por crédito.
- Registro de compras.
- Traspasos entre ubicaciones operativas, incluidas matriz, pollerías y rutas.
- Rutas de reparto con asignación de pedidos, cobro posterior y segunda vuelta de cobranza.
- Experiencia móvil para choferes con actualización de estados, evidencia y cobro en ruta.
- Registro de nota sencilla, nota grande, ticket/comprobante interno, solicitud administrativa de factura como relación administrativa separada y relación de cliente facturado.
- Reporte diario de ventas, crédito, abonos, transferencias y pagos con banco/referencia.
- Reportes operativos casi en tiempo real de ventas, inventario, cobranza, facturación administrativa y reparto.
- Pantalla de dashboard.
- Comprobante interno de venta/ticket.
- Configuración básica con Docker.

El MVP debe soportar sucursales y almacenes múltiples a nivel de negocio. Cada venta, compra, ajuste, traspaso y movimiento de inventario debe estar asociado a una ubicación operativa definida.

## 5. Fuera del alcance inicial

No se incluirá inicialmente:

- Integración directa con SAT.
- CFDI real.
- Pagos en línea.
- Optimización automática de rutas.
- Contabilidad completa.
- Nómina.
- Conciliación bancaria automática.
- Integraciones con básculas, lectores o hardware especializado salvo decisión posterior.
- Planeación avanzada de demanda o pronóstico automático.

Estos elementos podrán agregarse en fases posteriores.

La exclusión anterior de una app móvil nativa no excluye la necesidad de una experiencia móvil para choferes en el MVP. La decisión pendiente es técnica: nativa, PWA o web móvil.

## 5.1 Facturación y comprobantes

En el MVP, “facturación básica” significa comprobante interno o ticket de venta acompañado, cuando aplique, por una relación de solicitud administrativa. Ninguno debe presentarse como CFDI ni sustituir una factura fiscal.

La facturación fiscal con CFDI e integración SAT queda fuera del MVP y debe tratarse como fase posterior. El sistema puede preparar datos de cliente, folio y venta necesarios para una futura factura fiscal administrativa, sin implementar emisión fiscal en esta fase.

## 5.2 Reportes casi en tiempo real

Para el MVP, “tiempo real” significa que los reportes y dashboards reflejan operaciones confirmadas con una latencia aceptable de hasta 60 segundos en condiciones normales de operación.

Los reportes no deben depender de cierres manuales para mostrar ventas, inventario disponible, cuentas por cobrar, crédito atrasado o estados de reparto, aunque los cortes de caja y liquidaciones sí pueden tener procesos de cierre operativo.

## 5.3 Decisiones abiertas de negocio

Estas decisiones siguen abiertas y bloquean el diseño final de arquitectura, base de datos y flujos detallados:

- Definir si una sucursal siempre contiene uno o más almacenes, o si sucursal y almacén pueden operar como ubicaciones independientes.
- Definir si todas las ventas descuentan de un almacén configurado por usuario/sucursal o si el vendedor puede seleccionar almacén por venta.
- Definir las equivalencias oficiales entre piezas y kilos por producto, y quién puede modificarlas.
- Definir reglas exactas de redondeo para peso, precio, subtotales, saldos y pagos.
- Definir tolerancias permitidas de merma, diferencia de peso y devolución en reparto.
- Definir política exacta de folio físico por ubicación y tipo de documento.
- Definir si la experiencia móvil de choferes debe operar sin conexión y por cuánto tiempo.
- Definir si la evidencia de entrega requiere fotografía, firma, geolocalización o una combinación obligatoria.
- Definir política fiscal futura: mantener solo ticket interno en MVP, o preparar nota administrativa/solicitud de factura para una fase posterior.
- Definir catálogo final de bancos para pagos y transferencias.
- Definir si el manejo de canastillas de clientes entra o no al dominio operativo.

## 6. Indicadores de éxito

- El usuario puede registrar una venta en menos de 1 minuto.
- El inventario se actualiza automáticamente después de cada venta.
- El inventario se consulta por ubicación operativa.
- El administrador puede consultar ventas del día.
- El sistema evita vender productos sin stock en la ubicación correcta.
- El sistema permite identificar productos con bajo inventario.
- El responsable de cobranza puede identificar saldos vencidos, crédito corto, crédito atrasado y clientes bloqueados.
- El chofer puede actualizar entregas asignadas desde una experiencia móvil.
- Los reportes operativos reflejan operaciones confirmadas con latencia máxima de 60 segundos en operación normal.
- El sistema funciona localmente y en despliegue Docker.

## 7. Puntos de venta externos y cierre diario

El MVP debe soportar pollerías externas a la matriz como `OperationalLocation` activas. Estas ubicaciones venden al detalle a público general y clientes fijos, reciben producto mediante traspasos trazables y mantienen inventario propio por kilos, piezas o ambas unidades.

El flujo incluye:

- Venta al público general mediante ticket o etiqueta de báscula capturada manualmente.
- Venta a clientes fijos y de menudeo mediante nota simple o nota grande, con precios autorizados por cliente o política comercial.
- Registro del folio físico, producto, presentación semántica, kilos, piezas, precio e importe cuando aplique.
- Registro de quién entregó, quién cobró y si hubo segunda vuelta de cobranza.
- Cierre diario por ubicación y fecha con secciones de entradas, salidas, ingresos y utilidad.
- Conciliación de kilos recibidos, vendidos, sobrantes, faltantes y otras salidas.
- Separación de efectivo, boucher/tarjeta, transferencia/deposito, cobranza, abonos y gastos.
- Comparación visible entre ventas registradas y referencias manuales del reporte de báscula.
- Cálculo operativo de compra, venta, utilidad bruta y utilidad neta conforme a políticas aprobadas.

El cierre diario de punto de venta es distinto de `RouteSettlement`: el primero concilia la operación de una ubicación fija; el segundo liquida una ruta, repartidor, entregas, devoluciones y cobros en tránsito.

### 7.1 Glosario operativo

| Término | Definición |
| --- | --- |
| Matriz | Ubicación principal desde donde se envía producto a pollerías externas o rutas. |
| Punto de venta externo / pollería externa | `OperationalLocation` activa que vende al detalle a público general y clientes fijos fuera de la matriz. |
| Ticket de báscula / etiqueta | Comprobante comercial interno generado por una báscula y capturado manualmente como referencia en el MVP; no implica integración con hardware. |
| Nota de venta simple | Comprobante manual para cliente, sin validez fiscal. |
| Nota grande | Nota manual usada para control administrativo, crédito o relación de factura administrativa; no genera CFDI ni timbrado en el MVP. |
| Solicitud administrativa de factura | Relación comercial interna que prepara una futura factura administrativa sin emitir CFDI en el MVP. |
| Cliente facturado | Cliente institucional o mayorista con RFC, razón social, alias/comercial, correo y número interno para control administrativo. |
| Saldo global por cliente | Suma de cuentas por cobrar pendientes de un cliente, usada para cartera y bloqueo de crédito. |
| Pago aplicado | Pago asociado a una sola cuenta por cobrar, con método, banco y referencia. |
| Corte diario / cierre diario | Cierre operativo por ubicación y fecha que concilia kilos, ventas, ingresos, gastos, sobrantes, faltantes y utilidad. |
| Sobrante / faltante | Diferencia operativa entre producto recibido, producto vendido, otras salidas y existencia disponible al cierre. |

### 7.2 Límites del alcance

- Los tickets, etiquetas, notas y cierres son documentos internos; no son CFDI.
- SAT, CFDI, timbrado, PAC, UUID fiscal y cancelación fiscal permanecen fuera del MVP.
- La integración automática con básculas o lectores permanece fuera del MVP.
- El cierre diario no sustituye reportes casi en tiempo real ni bloquea su actualización.
- `Payment.accountReceivableId` continúa siendo obligatorio para pagos de cobranza y `PaymentAllocation` permanece fuera del MVP.

### 7.3 Decisiones abiertas específicas

- Tolerancias autorizadas para diferencias de kilos, efectivo y otros métodos de pago.
- Fórmula oficial de costo de compra, utilidad bruta, utilidad neta y utilidad por pollo o unidad equivalente.
- Política de redondeo para conciliaciones de peso e importes.
- Catálogo final de conceptos de entrada, salida, gasto y ajuste.
- Política de folios físicos por punto de venta y tipo de documento.
- Si un cierre puede reabrirse después de afectar un periodo administrativo y qué evidencia o motivo exige.
- Si debe existir un rol `CASHIER`; hasta decidirlo se reutilizan `ADMIN` y `SELLER`.
