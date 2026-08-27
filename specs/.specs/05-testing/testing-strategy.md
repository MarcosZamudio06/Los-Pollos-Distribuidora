# Estrategia de Pruebas

## Objetivo

Validar que el MVP cumpla reglas operativas críticas sin regresar al modelo anterior de stock global y sin ampliar alcance fiscal. La estrategia prioriza pruebas que protegen dinero, inventario, saldos, permisos, rutas y reportes casi en tiempo real.

## Herramientas base

| Capa                          | Herramienta esperada                       | Uso principal                                                        |
| ----------------------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| Backend unitario              | Jest                                       | Servicios, validadores, reglas de dominio y casos de error.          |
| Backend integración           | Jest + Supertest + base de datos de prueba | Endpoints REST, transacciones, persistencia, permisos y formato API. |
| Frontend unitario/interacción | Vitest + Testing Library                   | Componentes, formularios, guards de UI, estados remotos y errores.   |
| E2E prioritario               | Playwright                                 | Flujos de negocio completos de mayor riesgo.                         |

La base de datos de pruebas debe aislar datos por ejecución. Las pruebas de integración que modifiquen ventas, inventario, pagos o liquidaciones deben verificar persistencia real y rollback lógico cuando la operación falle.

## Pirámide de prioridad

1. **Backend unitario crítico**: cálculos, validaciones y permisos que no pueden depender de UI.
2. **Backend integración crítica**: endpoints y transacciones que modifican inventario, saldos, rutas o reportes.
3. **Frontend interacción crítica**: formularios y permisos visibles que previenen errores operativos.
4. **E2E prioritario**: solo flujos que cruzan módulos y cuyo fallo compromete operación diaria.

## Artefactos fiscales

Las pruebas de `FiscalArtifactService` deben demostrar, sin almacenar payloads
fiscales en PostgreSQL:

- descarga XML/PDF/acuse desde el `FiscalProviderPort` y subida al
  `ObjectStoragePort` con SHA-256 y tamaño calculados del contenido real;
- key privada determinista y URL firmada temporal sin exponer `storageKey`;
- coincidencia entre UUID persistido, TFD y atributo `UUID` del XML;
- `STAMPED` sin XML/PDF como inconsistencia recuperable (`FAILED` con código
  estable), sin cambiar UUID ni emitir otro CFDI;
- fallos de proveedor, storage o metadata como estados recuperables y sin
  mensajes externos sensibles;
- ownership/scope para `ADMIN`, `BILLING`, `SELLER` y `COLLECTIONS`, con
  denegación para cualquier usuario fuera del alcance.

La integración debe usar un bucket privado o fake equivalente y verificar la
persistencia real de metadata (`type`, `storageKey`, `sha256`, `byteSize`,
`mimeType`, `createdAt`).

## Seguridad fiscal

La suite CFDI de seguridad debe demostrar:

- guards locales de autenticación y roles en cada controller fiscal, además de
  la política global, con `ADMIN`/`BILLING` permitidos y roles no fiscales
  rechazados;
- ownership de artefactos para `SELLER`, alcance de cuenta por cobrar para
  `COLLECTIONS` y rechazo de IDs arbitrarios antes de generar URL firmada;
- URL fiscal firmada limitada a cinco minutos aunque el TTL global esté mal
  configurado;
- allowlist exacta del origen PAC por ambiente antes de resolver credenciales;
- límite de 16 MiB tanto por `Content-Length` como durante streaming chunked,
  cancelando la lectura al excederlo;
- rechazo de XML con `DOCTYPE` o `ENTITY` antes de ObjectStorage o promoción de
  estado;
- logs con códigos internos estables, sin stack/código arbitrario del proveedor,
  Authorization, JWT, passwords, CSD, secretos de storage ni XML completo;
- escaneo versionado mediante gitleaks y la política de assets fiscales.

## Lectura fiscal e historial

Las pruebas de `FiscalInvoiceReadService` y sus controllers deben demostrar:

- paginación determinista y filtros de fecha, cliente, RFC, UUID, serie/folio,
  estado fiscal, entidad legal, ubicación y tipo CFDI;
- una consulta paginada batched más el conteo, sin bucles de consultas por
  factura ni reconstrucción desde `Customer` o `Product`;
- detalle basado en `Invoice.issuerSnapshot`, `Invoice.receiverSnapshot` e
  `InvoiceConcept`, con conceptos, impuestos, aplicaciones de
  `InvoiceSaleDocument`/`InvoiceSaleItemApplication`, artefactos, cancelación e
  historial de auditoría resumido;
- `status` sin cargar conceptos y con estado de operación/artefactos;
- importes monetarios serializados como strings decimales, ausencia honesta de
  snapshots legacy y `ADMIN`/`BILLING` como única política de lectura.

## UI de emisión CFDI nativa

Las pruebas Vitest de `InvoiceReconciliationPanel` deben demostrar:

- revisión server-owned de emisor, receptor, RFC, régimen, CP, UsoCFDI,
  conceptos, claves SAT, impuestos, FormaPago, MetodoPago y totales;
- ausencia de inputs para UUID, TFD, sellos, certificados o totales calculados;
- CTA `Emitir CFDI` visible solo para `ADMIN`/`BILLING`, deshabilitada con perfil
  incompleto, durante `STAMPING` y cuando ya existe una Invoice nativa;
- envío de `expectedVersion` y una `Idempotency-Key` estable sin payload fiscal
  propiedad del servidor;
- mapeo de `UNKNOWN` a `STAMP_UNKNOWN`, con mensaje de reconciliación distinto
  de `STAMP_ERROR`, además de loading, errores de validación y conflicto de
  versión;
- estado `STAMPED` con UUID, fechas, cancelación y botones XML/PDF solo para
  artefactos `AVAILABLE`, usando URL firmada recibida del backend;
- no doble submit ni reintento automático tras timeout/PAC indeterminado.

## Regla determinista para reportes casi en tiempo real

El criterio de latencia máxima de 60 segundos debe probarse sin esperas reales prolongadas, sin `sleep`, sin temporizadores aleatorios y sin depender del reloj de pared de la máquina de CI.

La validación se distribuye por capa:

| Capa                   | Qué valida                                                                          | Método determinista                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contrato backend       | El reporte expone una ventana verificable de datos o metadatos de actualización.    | Validar `generatedAt`, `lastMovementAt`, `updatedAt` o marca equivalente definida en el contrato del reporte.                                       |
| Integración controlada | Una operación confirmada en `T0` aparece en el reporte dentro de `T0 + 60s`.        | Usar reloj inyectado, transacción con timestamps controlados o base de datos de prueba con fechas fijas; consultar el reporte simulando `T0 + 60s`. |
| Tolerancia temporal    | El resultado no falla por milisegundos, serialización o precisión de base de datos. | Aceptar tolerancia pequeña y explícita de precisión técnica, sin extender el límite funcional de 60 segundos.                                       |
| Frontend interacción   | La UI muestra datos y metadatos de actualización entregados por API.                | Mockear respuestas con `generatedAt` o metadatos equivalentes; no medir el SLA de 60 segundos en componentes.                                       |
| E2E                    | El flujo completo refleja una operación confirmada en reportes autorizados.         | Usar datos semilla/controlados y polling corto con timeout técnico acotado; no esperar 60 segundos reales como mecanismo de prueba.                 |

La prueba principal del criterio `<= 60 segundos` pertenece a integración backend controlada. El E2E solo verifica integración visible del flujo y no debe ser la fuente de verdad del SLA.

Cada prueba de reporte debe usar únicamente el metadato de frescura definido explícitamente por su contrato API correspondiente. Si el contrato del reporte no define un metadato verificable de frescura, la prueba queda pendiente/bloqueada hasta que el contrato API se actualice; la prueba no debe inventar campos, nombres de endpoints ni metadatos.

## Pruebas backend unitarias críticas

### Seguridad y permisos

- Validar JWT, expiración y usuario activo.
- Validar RBAC para roles `ADMIN`, `SELLER`, `WAREHOUSE`, `DRIVER` y `COLLECTIONS`, incluyendo capacidades efectivas `collections.receive_cash`, `cash_shift.open_own` y `cash_shift.close_own`.
- Validar que respuestas de usuario no expongan `passwordHash`.
- Validar permisos por alcance: vendedor propio, repartidor asignado y ubicación autorizada cuando aplique.
- Validar permisos CEDIS: `ADMIN` global, `WAREHOUSE` en su CEDIS y `SELLER` en su sucursal, sin costos para `SELLER`.

### Inventario y unidades

- Validar `presentationType` en alta y edición de producto.
- Rechazar stock negativo por ubicación.
- Calcular bajo stock por `InventoryBalance` y `locationId`, no por stock global.
- Rechazar operaciones nuevas contra `OperationalLocation.isActive=false` en ventas, compras, ajustes y traspasos.
- Validar kilos decimales y piezas enteras.
- Rechazar conversión kilo/pieza sin equivalencia oficial aprobada cuando el producto la requiera.
- Conservar equivalencia aplicada en venta o compra cuando corresponda.
- Registrar motivo obligatorio en ajustes, mermas, devoluciones, rechazos parciales o pérdidas.
- Probar ajustes con replay de la misma clave y payload, colisión de clave con
  payload distinto, carrera concurrente, timeout simulado y recuperación tras
  `P2034`, verificando que el saldo y el movimiento no se dupliquen.
- Pendiente/condicional: pruebas de redondeo exacto hasta que negocio defina política final.

### Traspasos

- Rechazar origen y destino iguales.
- Rechazar traspaso sin productos.
- Rechazar creación o solicitud de traspaso cuando origen o destino estén inactivos.
- Rechazar confirmación de traspaso existente si origen o destino quedaron inactivos antes de confirmar.
- Validar que `DISTRIBUTION_CENTER` sea raíz, que `BRANCH` tenga padre CEDIS activo y que `parentId` no forme ciclos.
- Validar que la consulta de sucursales CEDIS devuelva únicamente hijas `BRANCH` activas directas.
- Rechazar desactivación con ciclos CEDIS abiertos, traspasos `IN_TRANSIT`, cierres `DRAFT`/`REVIEWED` o hijos activos.
- Rechazar confirmación sin stock suficiente en origen.
- Generar salida en origen y entrada en destino con cantidades por kilo/pieza.
- Rechazar confirmación duplicada o sobre traspaso cancelado.

### Ciclos CEDIS-sucursal

- Validar unicidad no cancelada por sucursal/fecha y la carrera de dos aperturas concurrentes.
- Validar múltiples suministros CEDIS → sucursal y devoluciones sucursal → CEDIS dentro del mismo ciclo.
- Verificar que crear/vincular transferencias no cambie balances ni genere movimientos.
- Confirmar transferencias vinculadas únicamente por `InventoryTransfersService` y comprobar salida/entrada atómicas.
- Verificar mediante contrato de esquema que `DeliveryRouteType`, `inventoryTransferId` y las restricciones condicionales de Fleet se mantengan sin volver obligatorio `vehicleId` para rutas históricas.
- Probar la confirmación de parada logística sin posición persistida, con precisión mayor a 100 metros, con posición stale y fuera del radio de 150 metros; en todos los casos verificar `422` y ausencia de actualización de `DeliveryRoute`.
- Probar la confirmación con posición persistida reciente, precisa y cercana al destino canónico; verificar que registra la llegada sin crear cobros ni movimientos de inventario.
- Probar la UI con `Abrir entrega`, `Llegué` y `Confirmar recepción` deshabilitados hasta que exista una posición GPS fresca, precisa y cercana, manteniendo la confirmación como acción explícita.
- Cancelar `DRAFT`, `REQUESTED` e `IN_TRANSIT` con motivo; rechazar cancelación de `CONFIRMED`.
- Rechazar productos o ubicaciones inactivas en creación y confirmación, conservando historia ya confirmada.
- Validar refresh desde transferencias/movimientos, snapshots append-only, bloqueantes y transición a `READY_FOR_REVIEW`.
- Validar que `CLOSED` y `CANCELLED` sean de solo lectura para comandos operativos.
- Validar idempotencia con mismo payload, conflicto por payload distinto y control por `expectedVersion`.
- Probar confirmaciones concurrentes contra el mismo saldo sin stock negativo.
- Mantener KG y PIECE separados y bloquear conversiones sin equivalencia y redondeo aprobados.
- Verificar que una devolución no se descuente dos veces durante el cierre diario.
- Validar alcance de `cedis.receive_supplies` para `ADMIN`, `WAREHOUSE` y `SELLER`.
- Validar recepción exacta, faltante y sobrante con movimientos físicos
  `TRANSFER_OUT`/`TRANSFER_IN` y variaciones trazables exclusivamente en
  `BranchSupplyReceiptItem`.
- Validar que la cantidad positiva de cada movimiento físico coincida con el
  delta entre saldos anterior y posterior por KG y PIECE.
- Validar nota obligatoria con diferencia, partidas completas, unidades y piezas
  enteras.
- Validar una recepción por suministro, idempotencia y conflicto por payload.
- Validar listado de envíos del día, orden de pendientes y detalle visible desde
  CEDIS.
- Validar notificación autorizada y recuperación por REST tras desconexión.

### Ventas

- Rechazar carrito vacío.
- Rechazar venta sin `locationId`.
- Rechazar venta con `locationId` de ubicación operativa inactiva antes de crear venta, movimientos, cuenta por cobrar o ticket interno.
- Rechazar stock insuficiente en ubicación de descuento.
- Calcular subtotal, descuento y total en backend.
- Ignorar precios enviados por frontend como fuente de verdad.
- Crear venta de contado con método de pago.
- Rechazar venta de contado sin sesión `PointOfSaleDailyClose` abierta y verificar que no persista efectos parciales.
- Verificar que ventas y pagos de punto fijo conserven `cashShiftId`, que el cierre se derive del turno y que cajero/dispositivo distintos sean rechazados.
- Cubrir la matriz `ADMIN`/`SELLER`/`COLLECTIONS` para abrir, consultar y cerrar turno propio, con ubicación ajena, turno ajeno, dispositivo incorrecto, estado padre no `DRAFT`, cierre administrativo, reapertura y movimientos; solo `COLLECTIONS` con las tres capacidades nuevas puede completar el flujo fijo de cobranza `CASH`.
- Rechazar `CASH_SALE` sin pagos o con pagos parciales, incluso cuando exista un cliente activo, sin crear venta ni cuenta por cobrar.
- Requerir cambio explícito a `CREDIT_SALE` para confirmar pagos parciales y ejecutar la evaluación de crédito.
- Crear venta a crédito con cliente autorizado y cuenta por cobrar.
- Rechazar venta a crédito sin cliente.
- Rechazar venta a crédito con cliente bloqueado o límite excedido sin autorización administrativa explícita.
- Cancelar venta y restaurar inventario en ubicación original.
- Cancelar venta a crédito y ajustar o cancelar cuenta por cobrar.
- Rechazar doble cancelación.
- Bloquear cancelación si existen pagos aplicados hasta registrar reversa o reembolso auditable.
- Bloquear cancelación si la venta pertenece a un cierre POS cerrado o liquidación cerrada hasta reapertura versionada.
- Verificar la vista previa administrativa de anulación con pagos, inventario, cartera, documentos, motivo y usuario autorizador.
- Verificar que `POST /sales/:id/void` revierta pagos, restaure inventario, cancele cartera y documentos en una sola transacción.
- Verificar que un fallo intermedio de la anulación no deje efectos parciales.
- Verificar idempotencia de la anulación completa y conflicto cuando se reutiliza la clave con otro payload.
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
- Rechazar pagos de cobranza en efectivo sin sesión abierta en la ubicación fija y verificar que el saldo no cambie.
- Rechazar pagos `CASH` fijos de `COLLECTIONS` sin `collections.receive_cash`, y conservar las rutas `TRANSFER`/`DEPOSIT`/`CARD`/`CHECK` y `CASH` de ruta sin dependencia del turno fijo.

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
- Aceptar evidencia de tipos permitidos y validar server-side la integridad de `PHOTO`, sin confiar en la compresión del frontend.
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
- Verificar que el backend rechace `DELIVERED` si el pedido no tiene evidencia `PHOTO` y permita la transición cuando solo falta `GEOLOCATION`.
- Verificar que el backend rechace una `PHOTO` inválida, un MIME/signature mismatch, una imagen fuera de tamaño/dimensiones y un `capturedAt` fuera de ventana.
- Verificar que una `PHOTO` válida persista hash, MIME, tamaño, metadata, `receivedAt` y `capturedByUserId` del actor autenticado.

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
- El contrato API de productos permite alta sin perfil fiscal, devuelve `CFDI_PRODUCT_PROFILE_INCOMPLETE` como indicador estable y no bloquea la operación comercial.
- El contrato API de productos acepta un perfil fiscal completo con seis campos, normaliza códigos y rechaza ClaveProdServ/ClaveUnidad, ObjetoImp, impuesto, TipoFactor o tasa/cuota inválidos.
- Cambiar el perfil fiscal de un producto no actualiza `SaleItem`, `PurchaseItem`, movimientos ni snapshots históricos.
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
- El contrato API correspondiente de clientes normaliza y valida RFC, código postal fiscal y códigos SAT; rechaza el perfil incompleto cuando `requiresBilling=true` y permite perfil vacío cuando es `false`.
- La respuesta de error de perfil fiscal conserva `code` y `fields[]` para asignar mensajes por campo sin exponer secretos.
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
- El contrato API correspondiente de evidencia registra tipos permitidos, valida la integridad de `PHOTO` en backend, sube el binario a Object Storage y devuelve su trazabilidad de recepción, captura y lectura firmada.
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
- Customer form separa dirección comercial, dirección de entrega y domicilio fiscal; usa selects para régimen/UsoCFDI y marca el perfil completo cuando `requiresBilling=true`.
- Customer form muestra errores fiscales por campo y no sustituye la validación autoritativa del backend.
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
- Evidencia permite tipo foto, firma, geolocalización o nota; `PHOTO` tiene validación server-side, persistencia en Object Storage y la revisión expone su actor, locator y metadatos de integridad.
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
9. **Jerarquía CEDIS**: consultar sucursales directas con alcance `ADMIN`/`WAREHOUSE` y verificar rechazo para `SELLER` fuera de su sucursal.

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

## Estrategia post-MVP para notas facturables

- Unitarias: evaluador puro, estados derivados, `Decimal`, agrupación, vencimiento, cancelación y sustitución.
- Integración PostgreSQL: migración/backfill, restricciones cruzadas, concurrencia, sobrefacturación y rollback total.
- Contrato: DTO común, filtros, ordenamiento, paginación, strings decimales, códigos y paridad entre tabla, resumen y exportación.
- E2E backend: total, parcial, agrupado, rechazo, cancelación, sustitución, reversión y matriz RBAC.
- Frontend: estados, filtros URL, selección compatible, detalle, acciones, accesibilidad y descarga.
- Conciliación: aplicaciones vigentes contra documentos/facturas y saldo de venta contra `Payment`/`AccountReceivable`.
- Regresión: vincular, cancelar o sustituir facturas no crea ni modifica ventas, pagos o inventario.
- Límite fiscal: se prueba registro de factura externa y UUID sin emisión CFDI, XML, timbrado, PAC o SAT; `PaymentAllocation` permanece ausente.

## Estrategia post-MVP para CFDI 4.0 nativo

- **Unitarias:** snapshot inmutable, ecuaciones de conceptos/impuestos,
  máquinas de estado de operación/factura/artefacto, permisos, clasificación de
  timeout y normalización de errores PAC.
- **Núcleo CFDI-05:** cubrir los trece estados de dominio, cada transición
  permitida y el rechazo de toda combinación no declarada; probar
  `Prisma.Decimal` sin aritmética binaria, asignación proporcional de cantidad
  y descuento, hash/snapshot profundamente inmutable, perfiles SAT, composición
  homogénea, FormaPago/MetodoPago, tipo de cambio, saldos disponibles y códigos
  de error estables. El test del loader debe demostrar consultas read-only y
  excluir aplicaciones canceladas o revertidas del consumo vigente.
- **Contrato de adaptador:** ejecutar la misma suite contra el fake neutral y
  Facturama sandbox; exigirla sin cambios a un futuro Finkok.
- **Integración PostgreSQL:** comando serializable, emisión única por solicitud,
  replay idempotente, dos claves concurrentes con un solo POST efectivo,
  secuencia fiscal, bloqueo `UNKNOWN`, reserva/reversión de aplicaciones,
  inmutabilidad de snapshot y constraints de factura/aplicaciones.
- **Runtime de timeout:** simular aceptación PAC y pérdida de respuesta;
  reconciliar a un solo `Invoice` y probar que no hubo segundo POST.
- **ObjectStorage:** staging, put-if-absent, readback de metadata, checksum,
  retry, signed URL autorizado y ausencia de delete para artefactos confirmados.
- **HTTP E2E:** matriz autenticada `cfdi.*`, DTO allowlist estricto, errores
  estables, strings decimales, campos fiscales solo servidor y redacción de
  secretos.
- **LegalEntity:** CRUD autenticado solo para `ADMIN`/`BILLING`, normalización
  RFC/código postal/régimen/serie, perfil incompleto permitido cuando CFDI está
  deshabilitado y rechazo de `.key`, contraseña CSD o token PAC.
- **Resolución de venta:** probar entidad activa e inactiva, ubicación sin
  emisor, emisor incompleto, certificado fuera de vigencia, mapeos históricos
  y solapados; una venta facturable no reserva inventario si la resolución
  falla.
- **Migración:** PostgreSQL desechable con expand/backfill/validate/rollback para
  facturas legacy activas, canceladas y sustituidas, más paridad exacta de
  reportes.
- **Contrato CFDI-04:** Prisma y SQL conservan `Invoice`,
  `InvoiceSaleDocument` e `InvoiceSaleItemApplication`; verifican enums
  separados, UUID nullable/único, snapshots/conceptos inmutables, artifacts sin
  bytes, certificados sin secretos y remediación legacy sin inferencia.
- **Regresión:** probar cero escrituras en ventas, pagos, cartera, balances y
  movimientos de inventario para toda operación fiscal.
- **Frontend:** confirmación autorizada, polling/reconciliación, artefactos,
  headers blancos y ausencia de inputs UUID/TFD/sellos/PAC.

### Estrategia CFDI-16 para REP 2.0

- **Dominio:** PUE contra PPD, pago `APPLIED`, concepto fijo de Pago,
  FormaDePagoP/MonedaP, impuestos DR/P/Totales y ecuaciones Decimal.
- **Asignación:** una venta en varias facturas, una factura con varias ventas,
  pago distribuido, capacidad por `InvoiceSaleDocument`, pago parcial y
  liquidación.
- **Cadena:** orden `paidAt,id`, parcialidad, saldos, sustitución que conserva
  número y rechazo de aplicación posterior fuera de orden.
- **PostgreSQL:** dos emisiones sobre el mismo pago, dos pagos sobre la misma
  factura, locks estables, constraints, replay y reserva `UNKNOWN`.
- **PAC:** contrato real Pagos 2.0, timeout antes/después de respuesta,
  recuperación sin segundo POST, XML/TFD/UUID y artefactos.
- **Cancelación:** pending/rejected/timeout no revierten; confirmación sí;
  dependencia posterior, motivo `01`, relación `04` y una sola cadena efectiva.
- **Operación:** cobranza fija, ruta, segunda vuelta y liquidación conservan el
  mismo `Payment`; REP produce cero cambios en cartera, caja, cierres, ventas e
  inventario.
- **Migración:** pagos legacy sin moneda/forma SAT se remedian sin inferencia y
  sin bloquear su lectura u operación económica.

Un release no puede declararse con mocks unitarios únicamente. La primera
activación exige PostgreSQL desechable, HTTP autenticado, runtime compatible con
ObjectStorage y evidencia del sandbox Facturama.

### Quality Gate CFDI

- El CI ordinario fija `CFDI_ENABLED=false` y `FISCAL_PROVIDER=NONE`; ninguna
  prueba de PR o `main` puede resolver credenciales, llamar un PAC o consumir
  timbres.
- Las suites unitarias conservan los thresholds globales vigentes y cubren
  estados, `Decimal`, impuestos, UsoCFDI, ObjetoImp, PUE/PPD, mappings,
  cancelación, REP 2.0 y Egreso mediante fake/fixtures sanitizadas.
- El job PostgreSQL parte de una base limpia, ejecuta `prisma migrate deploy` y
  todo el corpus E2E: idempotencia/unique, concurrencia, rollback, locks,
  advisory locks de reconciliación, sobrefacturación y sobre-acreditación.
- El gate de seguridad rechaza material fiscal versionado (`.key`, `.cer`,
  contenedores de llave o PEM privado) y CFDI XML que no esté bajo fixtures, no
  declare `cfdi-fixture:synthetic` o contenga RFC fuera del allowlist sintético.
- La verificación real de Facturama es un workflow exclusivamente
  `workflow_dispatch`, protegido por el environment `cfdi-sandbox`, fijo a la
  URL sandbox y con secrets de GitHub. Solo consulta un CFDI sandbox existente;
  no emite, cancela ni admite endpoint productivo.
- Backend/frontend typecheck, Docker build, dependency audit, gitleaks y los
  thresholds preexistentes siguen siendo requisitos; CFDI no reduce ningún gate.
