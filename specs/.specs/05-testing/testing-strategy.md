# Estrategia de Pruebas

## Objetivo

Validar que el MVP cumpla reglas operativas críticas sin regresar al modelo anterior de stock global y sin ampliar alcance fiscal. La estrategia prioriza pruebas que protegen dinero, inventario, saldos, permisos, rutas y reportes casi en tiempo real.

## Herramientas base

| Capa | Herramienta esperada | Uso principal |
|------|----------------------|---------------|
| Backend unitario | Jest | Servicios, validadores, reglas de dominio y casos de error. |
| Backend integración | Jest + Supertest + base de datos de prueba | Endpoints REST, transacciones, persistencia, permisos y formato API. |
| Frontend unitario/interacción | Vitest + Testing Library | Componentes, formularios, guards de UI, estados remotos y errores. |
| E2E prioritario | Playwright | Flujos de negocio completos de mayor riesgo. |

La base de datos de pruebas debe aislar datos por ejecución. Las pruebas de integración que modifiquen ventas, inventario, pagos o liquidaciones deben verificar persistencia real y rollback lógico cuando la operación falle.

## Pirámide de prioridad

1. **Backend unitario crítico**: cálculos, validaciones y permisos que no pueden depender de UI.
2. **Backend integración crítica**: endpoints y transacciones que modifican inventario, saldos, rutas o reportes.
3. **Frontend interacción crítica**: formularios y permisos visibles que previenen errores operativos.
4. **E2E prioritario**: solo flujos que cruzan módulos y cuyo fallo compromete operación diaria.

## Regla determinista para reportes casi en tiempo real

El criterio de latencia máxima de 60 segundos debe probarse sin esperas reales prolongadas, sin `sleep`, sin temporizadores aleatorios y sin depender del reloj de pared de la máquina de CI.

La validación se distribuye por capa:

| Capa | Qué valida | Método determinista |
|------|------------|---------------------|
| Contrato backend | El reporte expone una ventana verificable de datos o metadatos de actualización. | Validar `generatedAt`, `lastMovementAt`, `updatedAt` o marca equivalente definida en el contrato del reporte. |
| Integración controlada | Una operación confirmada en `T0` aparece en el reporte dentro de `T0 + 60s`. | Usar reloj inyectado, transacción con timestamps controlados o base de datos de prueba con fechas fijas; consultar el reporte simulando `T0 + 60s`. |
| Tolerancia temporal | El resultado no falla por milisegundos, serialización o precisión de base de datos. | Aceptar tolerancia pequeña y explícita de precisión técnica, sin extender el límite funcional de 60 segundos. |
| Frontend interacción | La UI muestra datos y metadatos de actualización entregados por API. | Mockear respuestas con `generatedAt` o metadatos equivalentes; no medir el SLA de 60 segundos en componentes. |
| E2E | El flujo completo refleja una operación confirmada en reportes autorizados. | Usar datos semilla/controlados y polling corto con timeout técnico acotado; no esperar 60 segundos reales como mecanismo de prueba. |

La prueba principal del criterio `<= 60 segundos` pertenece a integración backend controlada. El E2E solo verifica integración visible del flujo y no debe ser la fuente de verdad del SLA.

Cada prueba de reporte debe usar únicamente el metadato de frescura definido explícitamente por su contrato API correspondiente. Si el contrato del reporte no define un metadato verificable de frescura, la prueba queda pendiente/bloqueada hasta que el contrato API se actualice; la prueba no debe inventar campos, nombres de endpoints ni metadatos.

## Pruebas backend unitarias críticas

### Seguridad y permisos

- Validar JWT, expiración y usuario activo.
- Validar RBAC para roles `ADMIN`, `SELLER`, `WAREHOUSE`, `DRIVER` y `COLLECTIONS`.
- Validar que respuestas de usuario no expongan `passwordHash`.
- Validar permisos por alcance: vendedor propio, repartidor asignado y ubicación autorizada cuando aplique.

### Inventario y unidades

- Validar `presentationType` en alta y edición de producto.
- Rechazar stock negativo por ubicación.
- Calcular bajo stock por `InventoryBalance` y `locationId`, no por stock global.
- Rechazar operaciones nuevas contra `OperationalLocation.isActive=false` en ventas, compras, ajustes y traspasos.
- Validar kilos decimales y piezas enteras.
- Rechazar conversión kilo/pieza sin equivalencia oficial aprobada cuando el producto la requiera.
- Conservar equivalencia aplicada en venta o compra cuando corresponda.
- Registrar motivo obligatorio en ajustes, mermas, devoluciones, rechazos parciales o pérdidas.
- Pendiente/condicional: pruebas de redondeo exacto hasta que negocio defina política final.

### Traspasos

- Rechazar origen y destino iguales.
- Rechazar traspaso sin productos.
- Rechazar creación o solicitud de traspaso cuando origen o destino estén inactivos.
- Rechazar confirmación de traspaso existente si origen o destino quedaron inactivos antes de confirmar.
- Rechazar confirmación sin stock suficiente en origen.
- Generar salida en origen y entrada en destino con cantidades por kilo/pieza.
- Rechazar confirmación duplicada o sobre traspaso cancelado.

### Ventas

- Rechazar carrito vacío.
- Rechazar venta sin `locationId`.
- Rechazar venta con `locationId` de ubicación operativa inactiva antes de crear venta, movimientos, cuenta por cobrar o ticket interno.
- Rechazar stock insuficiente en ubicación de descuento.
- Calcular subtotal, descuento y total en backend.
- Ignorar precios enviados por frontend como fuente de verdad.
- Crear venta de contado con método de pago.
- Crear venta a crédito con cliente autorizado y cuenta por cobrar.
- Rechazar venta a crédito sin cliente.
- Rechazar venta a crédito con cliente bloqueado o límite excedido sin autorización administrativa explícita.
- Cancelar venta y restaurar inventario en ubicación original.
- Cancelar venta a crédito y ajustar o cancelar cuenta por cobrar.
- Rechazar doble cancelación.
- Bloquear cancelación si existen pagos aplicados hasta registrar reversa o reembolso auditable.
- Bloquear cancelación si la venta pertenece a un cierre POS cerrado o liquidación cerrada hasta reapertura versionada.
- Verificar idempotencia en creación de venta, pago inicial y cancelación.
- Pendiente/condicional: descuentos, override administrativo y selección automática de ubicación dependen de política comercial final.

### Clientes, crédito y políticas comerciales

- Crear cliente minorista y mayorista.
- Rechazar cliente sin nombre.
- Rechazar email inválido.
- Evitar duplicado por teléfono cuando aplique.
- Rechazar cliente inactivo en nuevas ventas.
- Calcular resumen de crédito con saldo pendiente, vencido y disponible.
- Identificar bloqueo por mora o límite excedido.
- Validar que políticas comerciales no desactiven reglas estructurales del MVP.

### Cuentas por cobrar y pagos

- Crear cuenta por cobrar para toda venta a crédito.
- Registrar pago parcial y actualizar saldo/estado.
- Registrar pago total y cerrar saldo.
- Requerir `Payment.accountReceivableId` en todo pago de cobranza del MVP.
- Permitir pago inmediato de contado sin `AccountReceivable` artificial cuando quede asociado a la venta.
- Tratar `Payment` como única fuente monetaria y rechazar duplicación contra campos derivados en venta, reparto o liquidación.
- Rechazar pago mayor al saldo pendiente salvo regla futura explícita.
- Rechazar pago sobre cuenta pagada o cancelada.
- Cancelar pago conservando historial y recalculando saldo.
- Verificar idempotencia en registro y cancelación de pagos.
- Distinguir pagos de cuentas por cobrar frente a ventas de contado.

### Compras

- Rechazar compra sin proveedor, sin ubicación receptora o sin productos.
- Rechazar compra con ubicación receptora inactiva antes de crear movimientos o incrementar inventario.
- Incrementar inventario por ubicación receptora.
- Registrar movimientos de compra con ubicación.
- Conservar unidad, cantidades y equivalencia aplicada cuando corresponda.
- Rechazar cancelación si produciría inventario negativo por ubicación.

### Rutas, cobros y liquidación

- Rechazar asignación de venta cancelada a ruta.
- Permitir solo pedidos confirmados en ruta.
- Restringir `DRIVER` a rutas y pedidos propios.
- Registrar `deliveredAt` al marcar entregado.
- Requerir motivo para no entrega, devolución, rechazo parcial o incidencia.
- Aceptar evidencia de tipos permitidos sin imponer combinación final no definida.
- Registrar cobro en ruta solo con saldo por cobrar, política permitida y `accountReceivableId`.
- Derivar montos cobrados por pedido y liquidación únicamente desde `Payment`.
- Rechazar cobro en ruta mayor al saldo pendiente.
- Calcular liquidación comparando esperado contra cobrado por método.
- Rechazar cierre de liquidación con pedidos sin estado final cuando aplique.
- Verificar carga a ruta con decremento en origen y aumento en `ROUTE_STOCK`.
- Verificar venta en ruta descontando `ROUTE_STOCK`.
- Verificar devolución desde `ROUTE_STOCK` hacia ubicación fija.
- Verificar ausencia de doble decremento entre carga y venta.
- Verificar idempotencia en creación, confirmación y cancelación de traspasos.
- Verificar idempotencia en apertura/cálculo, cierre y reapertura de liquidación.
- Pendiente/condicional: obligatoriedad de evidencia y tolerancias de merma/devolución quedan bloqueadas hasta decisión formal.

### Gobierno documental y concurrencia

- Validar que el roadmap solo use módulos canónicos.
- Validar que specs deprecated redirijan al spec canónico correcto.
- Verificar control de versión en cierre POS, reapertura POS, cierre de liquidación y reapertura de liquidación.

### Reportes

- Calcular ventas confirmadas por día, ubicación, vendedor, contado y crédito.
- Agrupar métodos de pago.
- Distinguir ventas de contado, ventas a crédito, pagos de cuentas por cobrar y cobros en ruta.
- Calcular bajo stock por ubicación y unidad.
- Calcular saldos vencidos y pagos registrados.
- Calcular pedidos por estado de reparto y liquidaciones abiertas/cerradas/en revisión.
- Validar permisos por rol en métricas: `ADMIN` global, `SELLER` propio, `WAREHOUSE` inventario, `COLLECTIONS` cobranza, `DRIVER` sin información financiera global.
- Validar por contrato que reportes operativos usen operaciones confirmadas y expongan metadatos verificables de actualización cuando aplique.
- Validar en integración controlada que ventas, compras, pagos, cobros en ruta y cambios de reparto confirmados en `T0` estén incluidos al consultar con tiempo controlado en `T0 + 60s`.
- Validar que los reportes de inventario se calculen por ubicación operativa y no por stock global.

### Ticket interno

- Generar ticket con venta, ubicación, items, unidades, kilos, piezas, total, tipo de venta y método de pago.
- Validar que el ticket sea comprobante interno del MVP.
- Validar ausencia de timbrado, PAC, UUID fiscal, factura fiscal, CFDI y SAT en endpoints, entidades operativas y UI del MVP.

## Pruebas backend de integración críticas

### API y formato

- Login correcto, login incorrecto, usuario inactivo, `me` sin token y refresh/logout cuando existan.
- Endpoints protegidos devuelven 401 sin token y 403 con rol incorrecto.
- Respuestas exitosas y de error respetan `api-conventions.md`.

### Inventario por ubicación

- El contrato API correspondiente de productos crea producto sin aceptar `stock` operativo global.
- El contrato API correspondiente de productos devuelve disponibilidad por ubicación cuando recibe `locationId`.
- El contrato API correspondiente de saldos de inventario requiere o agrupa claramente por ubicación, sin stock global.
- El contrato API correspondiente de ajustes de inventario registra movimiento con ubicación, unidad, cantidades y motivo.
- El contrato API correspondiente de ajustes de inventario rechaza ubicación inactiva sin modificar saldos ni crear movimiento.
- El contrato API correspondiente de movimientos de inventario permite filtrar por producto, ubicación, tipo y referencia.

### Ubicaciones, equivalencias y traspasos

- El contrato API correspondiente de ubicaciones crea ubicación sin asumir jerarquía final sucursal-almacén.
- El contrato API correspondiente de ubicaciones desactiva sin eliminar físicamente y bloquea uso en nuevas operaciones.
- El contrato API correspondiente de equivalencias valida factor mayor a cero, vigencia y una equivalencia activa por producto/par/periodo.
- El contrato API correspondiente de traspasos crea, consulta, confirma y cancela con movimientos transaccionales.
- Traspasos rechazan origen o destino inactivo al crear/solicitar y al confirmar si la ubicación quedó inactiva antes de la confirmación.

### Ventas y ticket

- El contrato API correspondiente de ventas confirma venta de contado y descuenta inventario por ubicación.
- El contrato API correspondiente de ventas confirma venta a crédito y genera cuenta por cobrar.
- El contrato API correspondiente de ventas rechaza stock insuficiente, carrito vacío, crédito inválido, falta de cliente en crédito y ubicación operativa inactiva.
- El contrato API correspondiente de cancelación de ventas restaura inventario en ubicación original y ajusta cobranza si aplica.
- El contrato API correspondiente de ticket de venta devuelve ticket interno sin datos fiscales operativos.

### Clientes, cobranza y pagos

- El contrato API correspondiente de clientes permite filtros por tipo, crédito, política y ruta asignada.
- El contrato API correspondiente de resumen de crédito calcula saldo, mora y disponibilidad de crédito.
- El contrato API correspondiente de cuentas por cobrar lista estados vigentes, parcialmente pagados, pagados, vencidos y cancelados.
- El contrato API correspondiente de pagos de cobranza requiere `Payment.accountReceivableId` y actualiza saldo transaccionalmente.
- El contrato API correspondiente de cancelación de pagos conserva historial y recalcula saldo.

### Compras

- El contrato API correspondiente de compras confirma entrada por ubicación y genera movimientos.
- El contrato API correspondiente de compras rechaza ubicación receptora inactiva sin crear movimientos ni incrementar inventario.
- El contrato API correspondiente de cancelación de compras revierte inventario cuando es posible y rechaza saldo negativo.

### Rutas, evidencia, cobros y liquidación

- El contrato API correspondiente de rutas crea ruta solo con ventas confirmadas.
- El contrato API correspondiente de rutas filtra rutas propias para `DRIVER`.
- El contrato API correspondiente de estado de pedidos impide que un repartidor actualice pedido ajeno.
- El contrato API correspondiente de evidencia registra evidencia permitida sin imponer combinación pendiente.
- El contrato API correspondiente de cobros en ruta registra pago con `accountReceivableId` y ruta; asocia `routeSettlementId` solo si ya existe liquidación.
- El contrato API correspondiente de liquidación calcula esperado, cobrado y diferencias.
- El contrato API correspondiente de cierre de liquidación valida pedidos sin estado final, diferencias y permisos.

### Reportes casi en tiempo real

- Después de confirmar venta, compra, pago, cobro en ruta o cambio de reparto con timestamps controlados, los contratos de reportes reflejan la operación confirmada al consultar dentro de la ventana `T0 + 60s` definida por el contrato de latencia del MVP.
- Cada reporte expone o permite verificar únicamente el metadato de actualización definido explícitamente por su contrato correspondiente; si el contrato no define metadato de frescura, la prueba queda pendiente/bloqueada hasta actualizar la especificación API.
- Los reportes no dependen de cierre de caja ni liquidación cerrada para mostrar operaciones confirmadas actuales.
- Cada reporte respeta permisos por rol y filtros de ubicación, usuario, cliente, ruta o estado cuando aplique.

## Pruebas frontend de interacción críticas

### Auth, layout y permisos

- Login muestra éxito o error según respuesta.
- Rutas protegidas redirigen o muestran 403 cuando corresponde.
- Sidebar y header muestran módulos permitidos por rol.
- Pantallas remotas cubren estados loading, error, empty, success y unauthorized.

### Inventario

- Product form valida nombre, precio positivo, costo no negativo, unidad y `presentationType`.
- Product list muestra saldos por ubicación y no muestra stock global.
- Ajuste de inventario exige ubicación, unidad, cantidad y motivo.
- Ajuste de inventario muestra error backend cuando la ubicación seleccionada está inactiva.
- Traspaso valida origen/destino, productos, piezas enteras y cantidades mayores a cero.
- Traspaso muestra error backend cuando origen o destino están inactivos.
- Equivalencias muestran factor, vigencia y estado sin calcular reglas finales solo en frontend.
- Product list muestra la presentación semántica para distinguir kilo, unidad entera y corte.

### POS y ventas

- POS requiere ubicación operativa, carrito con items y método de pago para contado.
- POS muestra error backend cuando la ubicación operativa seleccionada está inactiva.
- Venta a crédito requiere cliente y muestra resumen de crédito.
- UI bloquea crédito para cliente bloqueado o límite excedido salvo autorización explícita.
- Cantidades por kilo aceptan decimales y piezas requieren enteros.
- Botón de confirmación se deshabilita durante envío.
- Errores backend por stock, crédito, permisos o conflicto se muestran al usuario.
- Ticket modal muestra comprobante interno y no presenta acciones fiscales.

### Clientes y cobranza

- Customer form valida nombre, email y tipo de cliente.
- UI distingue cliente minorista y mayorista.
- Resumen de crédito muestra saldo pendiente, vencido, disponible y motivo de bloqueo.
- Registro de pago exige `accountReceivableId`, monto, método y no permite exceder saldo.
- Historial de pagos muestra ruta y liquidación cuando aplique.

### Compras

- Formulario de compra requiere proveedor, ubicación receptora y al menos un producto.
- Formulario de compra muestra error backend cuando la ubicación receptora está inactiva.
- Tabla de compra valida unidad, kilos, piezas enteras y costo no negativo.
- Cancelación exige motivo y muestra error si backend rechaza por inventario negativo.

### Rutas y reparto

- Administrador crea ruta solo con repartidor, fecha y pedidos válidos.
- Repartidor solo visualiza rutas propias.
- Actualizar pedido a entregado exige fecha/hora cuando aplique.
- Evidencia permite tipo foto, firma, geolocalización o nota, sin imponer combinación final pendiente.
- Cobro en ruta exige cuenta por cobrar, monto, método y saldo suficiente.
- Vista de liquidación muestra esperados, cobrados, diferencias, pagos con cuenta por cobrar y estado.
- UI no solicita ni permite editar manualmente `routeSettlementId` en creación de ruta, evidencia, incidencias o cobros.

### Dashboard y reportes

- Dashboard muestra `generatedAt` o indicador de actualización cuando el endpoint lo entregue.
- Reportes filtran por fecha, usuario, ubicación, tipo de venta, cobranza y ruta según rol.
- Reportes distinguen contado, crédito, pagos de cuentas por cobrar y cobros en ruta.
- Reportes de inventario muestran bajo stock por ubicación y unidad.
- La UI no mide el SLA de 60 segundos; solo presenta datos, estados remotos y metadatos entregados por API.

## Flujos E2E prioritarios

Estos flujos deben mantenerse pocos y estables. No todo escenario debe ser E2E.

1. **Autenticación y permisos**: iniciar sesión como roles principales, validar menú, ruta permitida y ruta denegada.
2. **Inventario por ubicación**: crear producto, ajustar saldo en ubicación, consultar bajo stock y verificar movimiento.
3. **Traspaso entre ubicaciones**: crear traspaso, confirmar con stock suficiente y verificar saldos origen/destino.
4. **Venta de contado**: vender desde POS con ubicación definida, generar ticket interno y verificar descuento de inventario.
5. **Venta a crédito y pago**: crear cliente con crédito, registrar venta a crédito, verificar cuenta por cobrar, registrar pago parcial y validar saldo.
6. **Compra**: registrar compra en ubicación receptora, verificar incremento de inventario y cancelación válida.
7. **Reparto y liquidación**: asignar venta confirmada a ruta, marcar entrega, capturar evidencia permitida, registrar cobro con cuenta por cobrar y abrir/cerrar liquidación.
8. **Reportes casi en tiempo real**: ejecutar una operación confirmada con datos controlados y verificar que dashboard o reporte autorizado la refleje usando metadatos de actualización, sin esperar 60 segundos reales.

## Validaciones de regresión obligatorias

Estas pruebas deben existir antes de considerar estable el MVP:

- Stock operativo siempre por `OperationalLocation`.
- `InventoryBalance` no permite saldos negativos.
- Venta descuenta inventario en ubicación de descuento.
- Compra incrementa inventario en ubicación receptora.
- Cancelación de venta restaura inventario en ubicación original.
- Traspaso genera salida y entrada trazables.
- Ubicaciones inactivas se rechazan en nuevas ventas, compras, ajustes y traspasos.
- Kilos permiten decimales; piezas son enteras.
- Conversión kilo/pieza requiere equivalencia aprobada cuando aplique.
- Venta de contado y venta a crédito quedan diferenciadas.
- Venta a crédito genera cuenta por cobrar.
- Todo pago de cobranza del MVP requiere `Payment.accountReceivableId`.
- Un pago inmediato de contado puede asociarse a la venta sin `AccountReceivable`.
- Pago no excede saldo pendiente salvo regla futura explícita.
- Cobros en ruta se distinguen de ventas de contado.
- Repartidor no opera rutas ajenas.
- Liquidación compara esperado contra cobrado.
- Reportes distinguen ventas, crédito, cobranza, ruta e inventario por ubicación.
- Reportes casi en tiempo real se validan con tiempo controlado y metadatos de actualización, no con esperas reales ni temporizadores aleatorios.
- Ticket interno no se presenta como factura fiscal, CFDI ni integración SAT.

## Decisiones abiertas y pruebas condicionales

Las siguientes pruebas no deben inventar comportamiento final. Deben marcarse como pendientes o condicionadas hasta decisión formal:

- Jerarquía final entre sucursal, almacén y ubicación operativa.
- Estrategia exacta para resolver ubicación de descuento en ventas.
- Política exacta de redondeo para kilos, piezas, equivalencias, precios, subtotales, saldos y pagos.
- Responsable y flujo final de aprobación/modificación de equivalencias kilo-pieza.
- Tolerancias de merma, diferencia de peso, devolución y rechazo parcial.
- Combinación obligatoria de evidencia de entrega.
- Alcance de autorizaciones comerciales para descuentos, crédito y excepciones administrativas.

## Criterios mínimos antes de producción

- Backend compila sin errores TypeScript.
- Frontend compila sin errores TypeScript.
- No existen errores críticos de ESLint.
- Pruebas unitarias críticas de backend pasan.
- Pruebas de integración críticas de backend pasan.
- Pruebas de interacción críticas de frontend pasan.
- E2E prioritarios pasan o tienen bloqueo documentado por decisión abierta.
- Permisos por rol validados en backend y frontend.
- No existen pruebas ni UI de flujos fiscales fuera del MVP.
