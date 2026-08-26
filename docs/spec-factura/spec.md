# SPEC de origen — Reporte detallado de notas facturables

> Estado: insumo funcional enlazado. La fuente canónica es
> `specs/modules/billing-reportable-notes/spec.md`. En caso de diferencia,
> prevalece el spec canónico y los documentos transversales que este enlaza.
> Este documento describe conciliación legacy de facturas externas. La emisión
> CFDI 4.0 nativa es un bounded context separado; su autoridad es
> `specs/modules/cfdi/spec.md` y
> `docs/adr/ADR-001-native-cfdi-4-architecture.md`, con ejecución definida en
> `docs/adr/ADR-004-native-cfdi-issuance-execution.md`.

## 1. Objetivo

Implementar en el ERP un módulo que permita identificar, consultar, validar, solicitar y conciliar las notas de venta que pueden convertirse en factura.

El módulo debe funcionar como:

- Reporte operativo de notas pendientes de facturación.
- Bandeja de trabajo para el área de facturación.
- Herramienta de conciliación entre ventas, facturas y cobranza.
- Fuente auditable para detectar omisiones, duplicidades y sobrefacturación.

El reporte no debe basarse únicamente en un campo booleano como `isInvoiced`.

---

## 2. Conceptos principales

El sistema debe mantener separados los siguientes conceptos:

### SaleDocument

Documento comercial que representa la venta original.

Ejemplos:

- `SIMPLE_NOTE`
- `LARGE_NOTE`
- `INTERNAL_RECEIPT`
- `SCALE_TICKET`

La nota continúa existiendo aunque posteriormente sea facturada.

### BillingRequest

Solicitud formal para facturar una o varias notas.

No representa una factura fiscal ni debe reemplazar al documento de venta.

### Invoice

Raíz persistida de una factura legacy externa o de un CFDI nativo emitido por
el bounded context fiscal.

Puede estar relacionado con una o varias notas de venta.

### Payment

Pago realizado por el cliente.

### Conciliación de pagos

`Payment` permanece ligado a `Sale` o `AccountReceivable`. El estado de cobro
se deriva mediante `Invoice → SaleDocument → Sale`; `PaymentAllocation`
permanece fuera del modelo.

---

## 3. Definición de nota facturable

Una nota será facturable cuando:

- La venta exista.
- Se encuentre confirmada.
- No esté cancelada.
- Su tipo de documento permita facturación.
- Tenga un cliente identificado.
- Tenga un importe facturable mayor que cero.
- No haya sido facturada completamente.
- Cumpla las reglas comerciales, fiscales y operativas definidas.
- El importe pendiente de facturar sea mayor que cero.

Los documentos facturables deben ser configurables.

Inicialmente deben considerarse:

- `SIMPLE_NOTE`
- `LARGE_NOTE`
- `INTERNAL_RECEIPT`, únicamente cuando la política comercial lo permita.

`SCALE_TICKET` no debe considerarse facturable de forma independiente, salvo que el modelo actual del negocio lo requiera expresamente.

---

## 4. Estados de facturación

El sistema debe poder representar, como mínimo, los siguientes estados:

```text
NOT_BILLABLE
BILLABLE
PENDING_INFORMATION
REQUESTED
IN_PROCESS
PARTIALLY_INVOICED
FULLY_INVOICED
BLOCKED
CANCELLED
```

### Reglas generales

- `BILLABLE`: la nota cumple las condiciones para solicitar factura.
- `PENDING_INFORMATION`: faltan datos fiscales o comerciales.
- `REQUESTED`: existe una solicitud activa.
- `IN_PROCESS`: la solicitud está siendo procesada.
- `PARTIALLY_INVOICED`: una parte del importe ya fue facturada.
- `FULLY_INVOICED`: el importe facturable fue cubierto completamente.
- `BLOCKED`: existe una inconsistencia.
- `NOT_BILLABLE`: la nota no debe facturarse.
- `CANCELLED`: el proceso o documento fue cancelado.

El estado debe derivarse de las relaciones y reglas de negocio. No debe depender únicamente de una selección manual del usuario.

---

## 5. Cálculos principales

El sistema debe calcular:

```text
Importe pendiente de facturar
=
Importe facturable de la nota
-
Importe facturado vigente
```

El importe facturado vigente debe excluir:

- Facturas canceladas.
- Facturas sustituidas sin efecto vigente.
- Solicitudes rechazadas o canceladas.
- Relaciones duplicadas o inválidas.

También debe calcular:

```text
Saldo pendiente de cobro
=
Importe total de la venta
-
Pagos válidamente aplicados
```

Debe generarse una alerta cuando:

```text
Importe facturado vigente > Importe facturable
```

Esto representa una posible sobrefacturación.

---

## 6. Relaciones requeridas

La relación entre notas y facturas debe permitir:

- Una factura con varias notas.
- Una nota relacionada con varias facturas.
- Facturación parcial.
- Cancelación y sustitución de facturas.

Por lo tanto, la relación debe ser muchos a muchos.

### BillingRequestSaleDocument

Debe relacionar una solicitud de facturación con una o varias notas.

Campos conceptuales mínimos:

```text
id
billingRequestId
saleDocumentId
requestedSubtotal
requestedTax
requestedTotal
createdAt
```

### InvoiceSaleDocument

Debe relacionar las facturas emitidas con las notas de origen.

Campos conceptuales mínimos:

```text
id
invoiceId
saleDocumentId
subtotalApplied
taxApplied
totalApplied
createdAt
```

Debe impedirse que la suma de importes aplicados exceda el importe facturable de la nota.

---

## 7. Flujo operativo

```text
Venta confirmada
→ Evaluación automática de facturabilidad
→ Nota disponible en el reporte
→ Validación de datos fiscales
→ Creación de BillingRequest
→ Revisión o autorización
→ Emisión CFDI nativa o registro de factura legacy externa
→ Relación factura-nota
→ Conciliación de importes
→ Estado total o parcialmente facturado
```

La creación de la factura no debe generar una segunda venta ni afectar nuevamente el inventario.

---

## 8. Contenido del reporte

El reporte debe ofrecer una vista resumida por nota y una vista detallada por partida.

### Vista por nota

Una fila por documento de venta.

Campos mínimos:

- ID de venta.
- Folio de nota.
- Tipo de documento.
- Fecha de emisión.
- Fecha de entrega.
- Cliente.
- RFC o identificador fiscal.
- Punto de venta.
- Sucursal o ubicación.
- Vendedor.
- Ruta o reparto, cuando aplique.
- Subtotal.
- Descuento.
- Impuestos.
- Total.
- Importe facturable.
- Importe facturado.
- Importe pendiente de facturar.
- Importe pagado.
- Saldo pendiente de cobro.
- Estado de venta.
- Estado de entrega.
- Estado de pago.
- Estado de facturación.
- Motivo de bloqueo.
- Fecha límite de facturación.
- Días transcurridos.
- Solicitud de facturación relacionada.
- Facturas relacionadas.
- Serie, folio y UUID fiscal, cuando existan.

### Vista por partida

Una fila por producto o concepto vendido.

Campos mínimos:

- Folio de nota.
- Producto.
- Descripción.
- ClaveProdServ y ClaveUnidad SAT administradas en el perfil fiscal del producto; no se derivan de la unidad operacional.
- Cantidad.
- Unidad.
- Precio unitario.
- Descuento.
- Base gravable.
- Impuesto.
- Total.
- Cantidad o importe facturado.
- Cantidad o importe pendiente.

---

## 9. Filtros

El reporte debe permitir filtrar por:

- Rango de fechas.
- Punto de venta.
- Sucursal.
- Cliente.
- RFC.
- Vendedor.
- Ruta.
- Tipo de nota.
- Estado de facturación.
- Estado de pago.
- Estado de entrega.
- Con solicitud.
- Sin solicitud.
- Facturación parcial.
- Facturación completa.
- Datos fiscales completos o incompletos.
- Notas vencidas.
- Notas bloqueadas.
- Folio de nota.
- Serie o folio de factura.
- UUID fiscal.

La tabla debe incluir paginación, ordenamiento y búsqueda.

---

## 10. Indicadores

Los indicadores deben respetar los filtros activos.

Como mínimo:

- Número de notas facturables.
- Importe total facturable.
- Importe facturado.
- Importe pendiente de facturar.
- Notas con información incompleta.
- Notas parcialmente facturadas.
- Notas vencidas.
- Notas bloqueadas.
- Posibles casos de sobrefacturación.

---

## 11. Acciones

Dependiendo del rol, el módulo debe permitir:

- Consultar detalle de la nota.
- Abrir la venta original.
- Revisar datos fiscales.
- Crear solicitud de facturación.
- Agrupar notas compatibles.
- Solicitar facturación parcial.
- Consultar facturas relacionadas.
- Consultar pagos relacionados.
- Ver historial de cambios.
- Exportar el reporte.
- Marcar una nota como no facturable con motivo obligatorio.
- Corregir incidencias.
- Rechazar o cancelar solicitudes.
- Reintentar solicitudes rechazadas.

Las notas solo podrán agruparse cuando compartan:

- Cliente.
- Perfil fiscal.
- Entidad fiscal emisora.
- Moneda.
- Condiciones fiscales compatibles.
- Ausencia de bloqueos.

---

## 12. Validaciones de backend

Antes de crear una solicitud, el backend debe validar:

1. La nota existe.
2. La nota está confirmada.
3. La nota no está cancelada.
4. El tipo de documento es facturable.
5. El cliente está activo.
6. Los datos fiscales requeridos están completos.
7. El importe solicitado es mayor que cero.
8. El importe solicitado no excede el pendiente.
9. No existe una solicitud activa duplicada.
10. La suma de solicitudes activas no excede el pendiente.
11. Todas las notas agrupadas pertenecen al mismo cliente.
12. Todas las notas agrupadas usan la misma moneda.
13. Todas las notas pertenecen a la misma entidad fiscal.
14. Los impuestos pueden determinarse correctamente.
15. No existe una devolución o nota de crédito pendiente que invalide el importe.
16. El usuario cuenta con permisos suficientes.

Estas validaciones deben ejecutarse dentro de una transacción para evitar solicitudes o facturas concurrentes sobre el mismo saldo.

---

## 13. Motivos de bloqueo

El sistema debe guardar códigos estructurados:

```text
MISSING_TAX_ID
MISSING_FISCAL_PROFILE
CUSTOMER_INACTIVE
SALE_NOT_CONFIRMED
SALE_CANCELLED
DELIVERY_PENDING
INVALID_TOTAL
ZERO_BALANCE
ACTIVE_REQUEST_EXISTS
OVER_INVOICED
TAX_CALCULATION_ERROR
MIXED_CUSTOMERS
MIXED_CURRENCIES
MIXED_LEGAL_ENTITIES
RETURN_PENDING
CREDIT_NOTE_PENDING
```

La interfaz puede mostrar mensajes descriptivos, pero el backend debe conservar el código.

---

## 14. Permisos

### Vendedor

- Consultar sus notas.
- Consultar el estado de facturación.
- Completar información permitida.
- Crear solicitudes.

### Facturación o contabilidad

- Consultar notas autorizadas.
- Revisar solicitudes.
- Aprobar, rechazar o bloquear.
- Relacionar facturas.
- Exportar información.
- Resolver incidencias autorizadas.

### Administrador

- Consultar todas las ubicaciones.
- Configurar reglas.
- Autorizar excepciones.
- Reabrir procesos.
- Consultar auditoría completa.

### Repartidor

- Consultar información operativa de la entrega.
- No acceder a información fiscal sensible.
- No ejecutar procesos de facturación.

---

## 15. Auditoría

Debe registrarse:

- Usuario.
- Fecha y hora.
- Acción.
- Entidad afectada.
- Valor anterior.
- Valor nuevo.
- Motivo.
- Dirección IP o contexto de sesión, cuando la arquitectura lo permita.

Eventos auditables:

- Cambio de facturabilidad.
- Creación de solicitud.
- Cambio de importe solicitado.
- Aprobación.
- Rechazo.
- Cancelación.
- Vinculación de factura.
- Desvinculación.
- Cancelación o sustitución de factura.
- Autorización de una excepción.
- Cambio de motivo de bloqueo.

Las relaciones contables no deben eliminarse físicamente sin conservar evidencia.

---

## 16. Interfaz

La pantalla principal debe llamarse:

```text
Notas facturables
```

Debe incluir:

1. Encabezado y descripción.
2. Indicadores.
3. Filtros.
4. Tabla principal.
5. Acciones individuales.
6. Acciones masivas.
7. Panel lateral o pantalla de detalle.

Columnas resumidas recomendadas:

```text
Folio
Fecha
Cliente
Punto de venta
Total
Facturado
Pendiente
Estado
Antigüedad
Acciones
```

El detalle debe mostrar:

- Información de la venta.
- Partidas.
- Datos fiscales.
- Solicitudes.
- Facturas.
- Pagos.
- Entregas.
- Historial de auditoría.

---

## 17. API conceptual

```http
GET /billing/reportable-notes
GET /billing/reportable-notes/:saleDocumentId
GET /billing/reportable-notes/summary
GET /billing/reportable-notes/export

POST /billing/requests
GET /billing/requests/:id
POST /billing/requests/:id/approve
POST /billing/requests/:id/reject
POST /billing/requests/:id/cancel
POST /billing/requests/:id/link-invoice
```

La implementación debe respetar la arquitectura y convenciones actuales del proyecto.

---

## 18. Exportaciones

Formatos mínimos:

- Excel.
- CSV.

PDF será opcional si el proyecto ya cuenta con una infraestructura de reportes.

La exportación debe contener:

- Fecha de generación.
- Usuario.
- Filtros aplicados.
- Zona horaria.
- Totales de control.
- Identificadores internos.
- Folios visibles.
- Importes numéricos.
- Estados de nota, solicitud y factura.

---

## 19. Requisitos no funcionales

- Operaciones monetarias con `Decimal`, nunca con `float`.
- Consultas paginadas.
- Filtros ejecutados en backend.
- Índices para fechas, cliente, ubicación y estados.
- Protección por roles y permisos.
- Transacciones en operaciones críticas.
- Prevención de condiciones de carrera.
- Auditoría persistente.
- Exportaciones consistentes con los filtros.
- No duplicar afectaciones de inventario.
- No almacenar totales derivados innecesariamente si pueden calcularse de forma confiable.
- Evitar consultas N+1.
- Mantener compatibilidad con las convenciones actuales de NestJS, Prisma y React del proyecto.

---

## 20. Criterios de aceptación

La implementación será aceptada cuando:

1. El reporte muestre todas las notas facturables pendientes.
2. No muestre como pendientes las notas totalmente facturadas.
3. Permita facturación parcial.
4. Permita agrupar varias notas en una solicitud.
5. Permita relacionar una nota con varias facturas.
6. Permita relacionar una factura con varias notas.
7. No permita solicitar o facturar más que el importe disponible.
8. Excluya facturas canceladas del importe facturado vigente.
9. Detecte posibles casos de sobrefacturación.
10. Bloquee solicitudes duplicadas.
11. Identifique datos fiscales incompletos.
12. Mantenga trazabilidad completa.
13. Respete permisos por rol.
14. Los indicadores coincidan con la tabla y las exportaciones.
15. La facturación no genere una nueva afectación de inventario.
16. Las operaciones críticas sean transaccionales.
17. Los cálculos monetarios no presenten errores de precisión.
18. Existan pruebas unitarias, de integración y end-to-end para los flujos críticos.

## Anexo CFDI-15 — Catálogos SAT

Los datos fiscales controlados se leen desde `SatCatalog`/`SatCatalogVersion`/
`SatCatalogEntry`, no desde texto libre ni desde una consulta SAT en línea. La
primera carga exige una fuente oficial revisada, `sourceVersion`, checksum y
aprobación; la migración no siembra códigos inventados. El importador valida y
activa versiones atómicamente, y `Invoice`/`InvoiceConcept` mantienen sus
snapshots sin depender de descripciones futuras.

## Anexo CFDI-16 — Arquitectura REP 2.0

El REP se modela como `Invoice(PAYMENT_RECEIPT)` y conserva la infraestructura
fiscal común. `Payment` continúa como única fuente económica;
`PaymentReceipt`, `PaymentReceiptDetail` y `PaymentInvoiceApplication` son
snapshots fiscales que no cambian caja, cartera, ventas, rutas o inventario.

Una venta o documento puede estar facturado por varias `Invoice`. Por eso la
entrada REP es `paymentId` y cada pago se distribuye de forma determinista
sobre facturas PPD elegibles a través de `InvoiceSaleDocument`. La cadena de
cada factura determina UUID, parcialidad, saldo anterior, importe pagado y
saldo insoluto. Cobranza de ruta, pago parcial y segunda vuelta reutilizan el
mismo `Payment(APPLIED)`.

CFDI-16 canonizó la arquitectura y CFDI-17 implementa la emisión por pago sin
crear una segunda raíz fiscal. La decisión arquitectónica completa está en
`docs/adr/ADR-012-rep-2-payment-invoice-applications.md`; el contrato de
ejecución está en `docs/adr/ADR-013-rep-2-implementation.md`.

## Anexo CFDI-17 — Emisión REP 2.0

`POST /api/billing/payments/:paymentId/issue-cfdi` crea un `Invoice` tipo `P`
con `PaymentReceipt`, `PaymentReceiptDetail` y
`PaymentInvoiceApplication`. El servidor vuelve a resolver las facturas PPD
`STAMPED` mediante `InvoiceSaleDocument`, distribuye el importe con
`Prisma.Decimal` y persiste los snapshots antes de llamar a Facturama. Un
timeout deja el documento `UNKNOWN` y conserva la reserva para
`StampReconciliationJob`; nunca se repite el timbrado automáticamente.

Para documentos relacionados con `ObjetoImpDR=02`, los impuestos se toman del
snapshot inmutable de `InvoiceConcept`, se prorratean al importe pagado con
`Decimal` y se envían en los nodos `Taxes` de Pagos 2.0. Un desglose faltante o
inválido bloquea la emisión; el cliente no puede proporcionar esos valores.

XML/PDF se almacenan en ObjectStorage y la cancelación solo revierte las
aplicaciones al recibir confirmación fiscal. La ausencia de PostgreSQL
disposable no se interpreta como prueba de concurrencia.

## Anexo CFDI-18 — Nota de crédito CFDI E

La nota de crédito nace de `CreditAdjustment`, una operación comercial creada
y aprobada de forma explícita. `DeliveryIncident`, devoluciones físicas e
`InventoryMovement` son solo contexto operativo y nunca disparan un CFDI E.

El ajuste relaciona una o varias facturas de Ingreso timbradas mediante UUID y
`TipoRelacion` derivado (`01` crédito/bonificación/descuento; `03` devolución
aprobada), selecciona conceptos e importes y reserva saldo acreditable al
aprobar. La emisión crea una `Invoice` nativa tipo `EXPENSE`, usa snapshots
originales, llama `FiscalProviderPort` fuera de la transacción y conserva
`UNKNOWN` ante timeout para impedir doble timbrado.
