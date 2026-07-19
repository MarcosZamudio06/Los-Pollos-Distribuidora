# UI — Notas facturables

## Objetivo

Ofrecer una bandeja operativa para consultar notas facturables, crear solicitudes y conciliar facturas emitidas externamente, sin presentar acciones de CFDI, timbrado, PAC o SAT.

## Ruta y acceso

- Ruta protegida: `/billing/reportable-notes`.
- Navegación: “Notas facturables”.
- `ADMIN` y `BILLING`: acceso global conforme a permisos.
- `SELLER`: solo notas propias y creación permitida.
- `COLLECTIONS`: lectura de pagos y conciliación autorizada.
- `WAREHOUSE` y `DRIVER`: sin acceso al módulo.

## Pantalla

Debe incluir indicadores, filtros persistidos en URL, tabla paginada y ordenada desde backend, selección masiva de notas compatibles y panel lateral o pantalla de detalle.

El detalle muestra venta, partidas, perfil fiscal según rol, solicitudes, facturas externas, pagos, entrega y auditoría. Debe resolver loading, refreshing, error, empty, unauthorized y stale.

## Acciones

Permite solicitudes totales, parciales y agrupadas compatibles. Cancelar, rechazar, bloquear, revertir o autorizar excepciones requiere diálogo profesional, motivo obligatorio y foco accesible.

La UI reutiliza componentes y tokens del ERP, mantiene navegación por teclado, etiquetas accesibles, diseño responsive y oculta datos fiscales a roles no autorizados. El backend sigue siendo la autoridad de permisos.

## Exportación

CSV y XLSX respetan exactamente filtros, alcance y totales visibles. Las descargas muestran estado de progreso y errores sin perder los filtros activos.
