# UI — Solicitudes Administrativas de Factura

> Esta pantalla conserva el flujo administrativo durante la migración. La
> bandeja post-MVP y las solicitudes parciales o agrupadas se definen en
> `specs/.specs/04-ui/billing-reportable-notes.md`; la emisión nativa sigue
> `specs/modules/cfdi/spec.md`.

## Objetivo

Gestionar la relación interna de solicitudes administrativas. La aprobación
permanece separada de la operación fiscal nativa.

## Emisión nominativa y global

El panel de emisión obliga a elegir explícitamente factura nominativa o factura
global. La selección global fija UsoCFDI `S01`, MetodoPago `PUE` y Exportación
`01`, y requiere periodicidad, mes/bimestre y año mediante controles cerrados;
no permite campos fiscales libres ni envía datos del receptor. El backend sigue
siendo autoritativo y rechaza un periodo incompatible con las ventas.

## Alcance

Pantallas y componentes requeridos:

- `BillingRequestsPage`.
- `BillingRequestDetail`.
- `BillingRequestFormDialog`.
- `BillingRequestStatusBadge`.

## Listado

Debe consumir `GET /api/billing-requests`.

Columnas:

- Cliente.
- Venta.
- Estado.
- Fecha de solicitud.
- Fecha de revisión.
- Responsable de revisión.
- Acciones.

Filtros:

- Cliente.
- Venta.
- Estado.
- Rango de fechas.
- Ubicación operativa.

## Detalle

Debe mostrar:

- Cliente.
- Venta relacionada.
- Cuenta por cobrar asociada cuando exista.
- Motivo.
- Notas.
- Estado de la solicitud.

## Formulario

Debe permitir:

- Crear solicitud desde una venta confirmada.
- Capturar motivo administrativo.
- Revisar y actualizar estado administrativo.
- Asociar cuenta por cobrar cuando exista.
- Agregar notas internas.

## Restricciones

- Antes del cutover nativo, no mostrar acciones de emisión fiscal.
- En la fase nativa habilitada, una solicitud `APPROVED` muestra dentro de
  `InvoiceReconciliationPanel` la revisión fiscal server-owned y una sola CTA
  “Emitir CFDI” para `ADMIN`/`BILLING`. La UI envía únicamente
  `expectedVersion`, `Idempotency-Key` y las decisiones permitidas
  (`cfdiUse`, `paymentMethod`, `paymentForm`, `exportCode` y `tipoCambio` cuando
  corresponda).
- La revisión muestra emisor, receptor, RFC, régimen, CP, UsoCFDI, conceptos,
  `ClaveProdServ`, `ClaveUnidad`, `ObjetoImp`, impuestos, subtotal, descuento,
  total, FormaPago y MetodoPago. Los importes proceden de `cfdiReview` y no se
  recalculan ni editan en el navegador.
- Retirar del camino nativo el formulario legacy de serie, folio, UUID e
  importes. Ninguna entrada UI puede originar UUID, TFD, sellos, certificados,
  datos SAT recibidos, identificadores PAC, XML, PDF o acuses.
- La CTA queda deshabilitada con perfil incompleto, durante `STAMPING` o si ya
  existe una `Invoice` nativa. El estado `UNKNOWN` se presenta explícitamente
  como `STAMP_UNKNOWN`, nunca como un error genérico, y no habilita un segundo
  timbrado.
- Después de `STAMPED`, mostrar UUID, fechas, estado de cancelación y botones
  de XML/PDF únicamente cuando el artefacto esté `AVAILABLE`; la descarga usa
  la URL firmada temporal entregada por backend y nunca expone `storageKey`.
- Para una `Invoice` `STAMPED`, `InvoiceReconciliationPanel` muestra un
  formulario de cancelación con el catálogo fijo de motivos SAT `01`-`04` y
  exige motivo interno. Solo el motivo `01` muestra el identificador de la
  factura sustituta; el UUID sustituto siempre lo resuelve el backend.
- La UI muestra explícitamente `Pending`, `Cancelled`, `Rejected` y `Error`.
  Mientras está `Pending` deshabilita repetir la solicitud y explica que el
  saldo sigue reservado. “Actualizar estado fiscal” ejecuta una consulta
  manual a `GET /api/billing/invoices/:id/cancellation`; no se usa polling
  agresivo en el navegador ni se oculta un estado indeterminado.
- Mostrar loading, errores de validación con códigos estables, conflictos de
  versión/idempotencia y fallos de almacenamiento con copy accionable. Evitar
  doble clic mediante una única clave de idempotencia estable por intención.
- Todos los headers generados por esta UI deben ser blancos.
- No crear ni cancelar inventario.
- No sustituir al ticket, nota o comprobante interno.
