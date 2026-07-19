  # Plan de implementación — Reporte detallado de notas facturables

  ## 1. Estado actual

  ### Capacidades existentes

  - `Sale`, `SaleItem` y `SaleDocument` conservan venta, partidas, importes, ubicación, ruta y snapshots históricos en `backend/prisma/
  schema.prisma`.
  - La confirmación de venta, pagos, cuenta por cobrar, movimiento de inventario, documento interno y solicitud administrativa se ejecutan en una
  transacción serializable en `backend/src/modules/sales/sales.service.ts`.
  - `BillingRequest` **sí es operativo**, no solo estructura:
    - Está registrado en `backend/src/app.module.ts`.
    - Tiene listado, detalle, creación, actualización y cancelación en `backend/src/modules/billing-requests/`.
    - Implementa transiciones, historial, alcance por usuario y transacciones serializables.
    - Cuenta con rutas y pantallas en `frontend/src/features/billing-requests/`.
  - Existen reportes con filtros, frescura y RBAC en `backend/src/modules/reports/` y `frontend/src/features/reportes/`.
  - Ventas, pagos y cancelaciones ya incluyen idempotencia, versión o trazabilidad parcial.
  - RBAC funciona por roles persistidos y decoradores `@Roles`, con protección equivalente en `frontend/src/components/layout/routeAccess.ts`.

  ### Limitaciones comprobadas

  - `BillingRequest.saleId` es único: una solicitud solo admite una venta y cada venta solo una solicitud.
  - `AccountReceivable.billingRequestId` también está restringido por una cardinalidad incompatible con solicitudes parciales o repetidas.
  - No existen `Invoice`, `BillingRequestSaleDocument`, `InvoiceSaleDocument`, aplicaciones por partida ni relaciones de sustitución.
  - No existe `PaymentAllocation`; el pago MVP se vincula directamente a `Sale` o `AccountReceivable`.
  - No existe `GET /api/reports/billing-requests`, aunque está definido en los specs canónicos.
  - No hay infraestructura CSV/XLSX ni dependencia para Excel.
  - No existe auditoría transversal; `BillingRequestHistory` cubre únicamente cambios de estado de solicitudes.
  - No existe rol `BILLING` o equivalente; los roles actuales son `ADMIN`, `SELLER`, `WAREHOUSE`, `COLLECTIONS` y `DRIVER`.
  - Los datos fiscales de `Customer` se limitan principalmente a razón social, RFC, dirección y correo; no permiten validar un perfil fiscal
  completo.
  - La entidad emisora fiscal y la moneda no están modeladas.
  - `Sale.documentType` conserva el tipo solicitado, pero la creación actual persiste en `SaleDocument` únicamente un `INTERNAL_RECEIPT`. Esto
  impide usar hoy `SaleDocument` como raíz confiable del reporte.
  - `SaleItem` no conserva descuento, base gravable, impuesto y total por partida.
  - `docs/spec-factura/spec.md` está sin seguimiento Git y contradice el alcance fiscal vigente de los specs canónicos, que excluyen factura
  fiscal, UUID, SAT y `PaymentAllocation`.

  ## 2. Brechas y decisiones de arquitectura

  ### Bloqueos previos

  Antes de la Fase 1 debe canonizarse el nuevo alcance. El spec introduce una capacidad post-MVP que actualmente contradice PRD, arquitectura,
  reglas de negocio, base de datos, API, UI y pruebas canónicas.

  La actualización documental debe aprobar expresamente:

  - Registro de facturas fiscales externas y UUID, sin implementar emisión, PAC, XML, timbrado ni integración SAT.
  - Nueva entidad emisora `LegalEntity`, distinta de ubicación operativa.
  - Perfil fiscal mínimo del cliente y reglas de completitud.
  - Moneda de venta; migración inicial a `MXN`.
  - Política de documentos facturables y fecha límite.
  - Nuevo rol `BILLING`.
  - Permanencia de `PaymentAllocation` fuera del alcance.

  Sin estas decisiones, las fases de facturas, agrupación y validación fiscal quedan **BLOCKED**.

  ### Decisiones propuestas

  - Mantener `Sale`, `SaleDocument`, `BillingRequest`, `Invoice` y `Payment` como conceptos separados.
  - Tratar `Invoice` como registro y conciliación de una factura emitida externamente; este módulo no la timbra.
  - Usar `SaleDocument` como unidad facturable y `SaleItem` como unidad de detalle.
  - Sustituir las relaciones directas por:
    - `BillingRequestSaleDocument`, con importes solicitados.
    - `InvoiceSaleDocument`, con importes aplicados y reversión lógica.
    - `InvoiceSaleItemApplication`, para que el detalle por partida sea exacto y no un prorrateo artificial.
  - Mantener `Payment` ligado a venta/cuenta por cobrar. La conciliación con factura se deriva por `Invoice → SaleDocument → Sale`; no crear
  `PaymentAllocation`.
  - Derivar el estado de facturación mediante un servicio de dominio puro. No persistirlo como fuente de verdad.
  - Exponer importes JSON como cadenas decimales; generar celdas numéricas reales en Excel/CSV.
  - Implementar el reporte como módulo de facturación operativo, no dentro del servicio genérico de reportes.
  - Proteger los acumulados con transacción serializable, bloqueo ordenado de los `SaleDocument` involucrados y una restricción/trigger PostgreSQL
  de respaldo.

  ## 3. Plan por fases

  ### Fase 0 — Alineación canónica

  - Actualizar specs de negocio, arquitectura, entidades, base de datos, API, UI, permisos y pruebas.
  - Definir `LegalEntity`, perfil fiscal, moneda, política de facturabilidad, vencimiento y estados de factura.
  - Resolver formalmente la discrepancia entre `Sale.documentType` y los documentos realmente persistidos.
  - Convertir `docs/spec-factura/spec.md` en fuente canónica o enlazarlo desde los specs canónicos.

  ### Fase 1 — Modelo de datos

  - Normalizar `SaleDocument`:
    - Las ventas nuevas deben persistir el documento correspondiente a `Sale.documentType`.
    - El comprobante interno puede coexistir como documento adicional.
    - Backfill de documentos faltantes usando venta y snapshots existentes.
  - Agregar moneda a la venta y relación con `LegalEntity`; backfill `MXN` y mapear ubicación–emisor mediante tabla de conciliación previa.
  - Crear `Invoice` con identidad externa, serie, folio, UUID opcional, moneda, emisor, totales Decimal, estado, cancelación, sustitución y
  versión.
  - Crear las tres tablas de aplicación propuestas con importes `Decimal(14,2)`, timestamps, actor y reversión lógica.
  - Mantener `BillingRequest.customerId`; retirar `saleId` como relación autoritativa después del backfill.
  - Eliminar la unicidad incompatible de `BillingRequest.saleId` y `AccountReceivable.billingRequestId`; derivar ventas/cuentas desde los
  documentos asociados.
  - Extender `SaleItem` con descuento, base, impuesto y total históricos por partida.
  - Agregar índices para documento/estado/fecha, cliente, ubicación, vendedor, ruta, solicitud, factura, UUID y relaciones.
  - Ejecutar migración expand–backfill–validate–contract:
    1. Crear estructuras aditivas.
    2. Detectar datos ambiguos.
    3. Backfill.
    4. Conciliar totales.
    5. Activar restricciones.
    6. Retirar campos legacy.
  - No hacer inferencias automáticas cuando una venta tenga documentos ambiguos; producir un listado de remediación.

  ### Fase 2 — Reglas de negocio

  - Crear un evaluador puro de facturabilidad que reciba venta, documento, cliente, entrega, política, solicitudes y aplicaciones vigentes.
  - Derivar `NOT_BILLABLE`, `BILLABLE`, `PENDING_INFORMATION`, `REQUESTED`, `IN_PROCESS`, `PARTIALLY_INVOICED`, `FULLY_INVOICED`, `BLOCKED` y
  `CANCELLED`.
  - Calcular con `Prisma.Decimal`:
    - Importe facturable.
    - Importe solicitado activo.
    - Importe facturado vigente.
    - Pendiente de facturar.
    - Pagado vigente.
    - Saldo de cobro.
  - Excluir solicitudes rechazadas/canceladas y facturas canceladas o sustituidas.
  - Devolver códigos estructurados de bloqueo, no textos como fuente de verdad.
  - Incorporar políticas configurables para tipos documentales, `INTERNAL_RECEIPT`, entrega requerida y días límite.
  - Impedir importe solicitado o aplicado mayor al saldo disponible, tanto en aplicación como en base de datos.

  ### Fase 3 — Backend del reporte

  - Crear endpoints:
    - `GET /api/billing/reportable-notes`
    - `GET /api/billing/reportable-notes/summary`
    - `GET /api/billing/reportable-notes/:saleDocumentId`
    - `GET /api/billing/reportable-notes/export`
  - Definir un DTO único de filtros reutilizado por tabla, resumen y exportación, con búsqueda, ordenamiento permitido, paginación y filtros del
  spec.
  - Retornar:
    - `items`, `pagination`, `summary`.
    - Metadatos `generatedAt`, `dataAsOf`, `freshnessSeconds`, `isStale`.
    - Importes como cadenas decimales.
  - Implementar el read model mediante consultas agregadas/CTE parametrizadas:
    - Una consulta paginada para filas.
    - Una consulta agregada para indicadores.
    - Una consulta de detalle que cargue partidas y relaciones por lotes.
  - Centralizar el predicado de filtros para impedir discrepancias entre tabla, indicadores y exportación.
  - Añadir pruebas de cantidad de consultas para detectar N+1.

  ### Fase 4 — Solicitudes de facturación

  - Migrar creación desde una venta individual hacia una lista de documentos e importes solicitados.
  - Soportar solicitudes totales, parciales y agrupadas.
  - Conservar compatibilidad temporal con el contrato anterior solo durante la migración.
  - Implementar comandos explícitos:
    - `POST /api/billing/requests`
    - `GET /api/billing/requests/:id`
    - `POST /api/billing/requests/:id/approve`
    - `POST /api/billing/requests/:id/reject`
    - `POST /api/billing/requests/:id/cancel`
  - Validar cliente, moneda, emisor, perfil fiscal, impuestos, bloqueos y saldo dentro de la misma transacción.
  - Bloquear documentos en orden estable y usar `version`/`expectedVersion`.
  - Permitir reintento mediante una solicitud nueva vinculada al historial; no reabrir solicitudes terminales.
  - Conservar `BillingRequestHistory`, ampliándolo con cambios de importes y composición.

  ### Fase 5 — Relación con facturas

  - Implementar `POST /api/billing/requests/:id/link-invoice`.
  - Registrar una factura existente o crear su registro externo dentro de la misma transacción de vinculación.
  - Exigir que la suma por partidas coincida con la aplicación por documento y que esta no exceda el pendiente.
  - Mantener aplicaciones al cancelar una factura, pero excluirlas del importe vigente.
  - Modelar sustitución como relación explícita entre factura original y sustituta; nunca sobrescribir el UUID o folio histórico.
  - Permitir desvinculación únicamente como reversión auditable.
  - Verificar que ninguna operación de factura invoque servicios de venta o inventario.
  - Calcular pagos y saldos desde `Payment`/`AccountReceivable`, sin mover ni duplicar dinero.

  ### Fase 6 — Auditoría y permisos

  - Crear una bitácora acotada al dominio de facturación con actor, acción, entidad, antes/después, motivo, timestamp, IP, correlación y contexto.
  - Registrar creación/cambio de solicitud, excepciones, bloqueos, aplicaciones, reversiones, cancelaciones y sustituciones.
  - Agregar el rol `BILLING` a seeds, bootstrap, backend, frontend y pruebas.
  - Matriz propuesta:
    - `ADMIN`: acceso global, configuración, excepciones y auditoría completa.
    - `BILLING`: consulta global, aprobación, rechazo, bloqueo, vinculación y exportación.
    - `SELLER`: únicamente notas propias, consulta de estado y creación de solicitudes.
    - `COLLECTIONS`: consulta de pagos y conciliación, sin vincular facturas.
    - `DRIVER`: sin acceso al módulo ni datos fiscales; mantiene solo su información de entrega.
  - Aplicar alcance en backend; ocultar controles en frontend solo como capa adicional.

  ### Fase 7 — Frontend

  - Crear ruta protegida `/billing/reportable-notes` y navegación “Notas facturables”.
  - Reutilizar componentes, tokens y diálogos existentes del ERP.
  - Implementar:
    - Indicadores.
    - Filtros persistidos en URL.
    - Tabla paginada y ordenada desde backend.
    - Selección masiva solo de notas compatibles.
    - Panel lateral de detalle con venta, partidas, fiscal, solicitudes, facturas, pagos, entrega y auditoría.
    - Creación total/parcial/agrupada y acciones de revisión según permisos.
  - Resolver loading, refreshing, error, empty, unauthorized y stale.
  - Añadir confirmación profesional con motivo obligatorio para cancelar, rechazar, bloquear, revertir o autorizar excepciones.
  - Mantener navegación por teclado, foco, etiquetas accesibles, tablas responsivas y contenido fiscal oculto para roles no autorizados.

  ### Fase 8 — Exportaciones

  - Generar CSV y XLSX desde el mismo read model y filtros del reporte.
  - Usar `exceljs` en modo streaming para XLSX; CSV mediante serializador propio probado.
  - Incluir usuario, zona horaria, fecha, filtros, totales de control e identificadores.
  - Emitir importes como celdas numéricas, fechas como fechas y UUID/folios como texto.
  - Aplicar límites de filas, streaming y nombre de archivo determinista.
  - Registrar cada exportación en auditoría.

  ### Fase 9 — Pruebas y conciliación

  - Aplicar TDD por fase.
  - Unitarias:
    - Evaluador de facturabilidad.
    - Estados derivados.
    - Cálculos Decimal.
    - Compatibilidad de agrupaciones.
    - Cancelación y sustitución.
  - Integración PostgreSQL:
    - Migración y backfill.
    - Restricciones cruzadas.
    - Dos solicitudes/facturas concurrentes sobre el mismo documento.
    - Rollback completo ante sobrefacturación.
  - Contrato:
    - DTOs, filtros, ordenamiento, paginación, importes y códigos.
    - Igualdad de filtros entre tabla, resumen y exportación.
  - E2E backend:
    - Flujo total, parcial, agrupado, rechazo, cancelación, sustitución y reversión.
    - Matriz RBAC completa.
  - Frontend:
    - Estados de pantalla, filtros URL, selección masiva, detalle, acciones y descarga.
  - Conciliación:
    - Suma de aplicaciones vigentes contra documentos y facturas.
    - Saldo de venta contra pagos aplicados.
    - Conteo e importes entre tabla, indicadores y exportaciones.
    - Prueba explícita de que vincular/cancelar/sustituir facturas no crea `Sale`, `Payment` ni `InventoryMovement`.

  ## 4. Interfaces públicas principales

  - Los endpoints monetarios devolverán strings decimales.
  - Los comandos críticos recibirán `expectedVersion` e `Idempotency-Key`.
  - Las solicitudes recibirán `documents[]` con `saleDocumentId` e importes.
  - La vinculación recibirá datos de factura externa y aplicaciones por documento/partida.
  - Los errores de negocio expondrán códigos estables como `OVER_INVOICED`, `ACTIVE_REQUEST_EXISTS` o `MIXED_LEGAL_ENTITIES`.
  - El detalle del reporte devolverá relaciones resumidas; los datos sensibles dependerán del rol.

  ## 5. Criterios de terminación

  El módulo estará terminado cuando:

  - El alcance fiscal externo esté incorporado a los specs canónicos.
  - Los datos existentes estén migrados y conciliados sin registros ambiguos pendientes.
  - Facturación total, parcial, agrupada, cancelada y sustituida funcione sin exceder saldos.
  - Tabla, indicadores, detalle, CSV y XLSX produzcan los mismos totales bajo los mismos filtros.
  - Las operaciones concurrentes no puedan duplicar solicitudes ni sobrefacturar.
  - Toda acción relevante sea auditable y reversible sin eliminación física.
  - Backend y frontend apliquen la matriz RBAC acordada.
  - No se cree ni modifique inventario, ventas o pagos por vincular una factura.
  - Pasen pruebas unitarias, integración PostgreSQL, contrato, e2e, frontend, build y TypeScript.
  - Se complete una conciliación sobre datos migrados y una prueba controlada de rollback.

  ## Supuestos

  - La factura será registrada después de emitirse externamente; no se implementará emisión fiscal.
  - `PaymentAllocation` continuará fuera del modelo.
  - La moneda inicial para datos legacy será `MXN`.
  - `SaleDocument` será la unidad facturable y deberá normalizarse antes del reporte.
  - La Fase 1 no puede comenzar hasta resolver y aprobar la Fase 0.