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

El detalle muestra venta, partidas, perfil fiscal según rol, solicitudes, facturas vigentes, historial de facturas, pagos, entrega y auditoría. Las facturas vigentes nunca mezclan aplicaciones revertidas ni facturas canceladas o sustituidas. Debe resolver loading, refreshing, error, empty, unauthorized y stale.

## Acciones

Permite solicitudes totales, parciales y agrupadas compatibles. Cancelar, rechazar, bloquear, revertir o autorizar excepciones requiere diálogo profesional, motivo obligatorio y foco accesible.

La UI reutiliza componentes y tokens del ERP, mantiene navegación por teclado, etiquetas accesibles, diseño responsive y oculta datos fiscales a roles no autorizados. El backend sigue siendo la autoridad de permisos.

## Exportación

CSV y XLSX respetan exactamente filtros, alcance y totales visibles. Las descargas muestran estado de progreso y errores sin perder los filtros activos.

## Bandeja de remediaciones

La ruta protegida `/billing/remediations` presenta una bandeja administrativa para `ADMIN` y lectura para `BILLING`. Muestra estado, código, venta, contexto de la inconsistencia, fecha de detección y resolución. `ADMIN` puede abrir un diálogo de resolución con motivo obligatorio y los campos de corrección correspondientes al código.

La interfaz nunca ofrece un cierre declarativo. Explica que el backend validará nuevamente los datos y solo marcará el caso como resuelto cuando la inconsistencia haya desaparecido. Tras una resolución válida refresca tanto la bandeja como las notas facturables para mostrar la facturabilidad recalculada.
# Selección fiscal de partidas

Al crear una solicitud, el operador selecciona partidas completas con saldo disponible. La interfaz muestra el total pendiente de cada partida y envía el desglose exacto de base, impuesto y total. No permite capturar manualmente un total documental ni asumir impuesto cero; cada nota seleccionada debe conservar al menos una partida.
