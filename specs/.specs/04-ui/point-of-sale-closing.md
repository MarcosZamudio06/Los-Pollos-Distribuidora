# UI - Cierre diario de punto de venta

## Objetivo

Permitir capturar, revisar y conciliar la operación diaria de un punto externo por ubicación y fecha, haciendo visibles las diferencias de kilos y dinero antes del cierre.

## Pantallas y componentes

- `PointOfSaleDailyClosePage`.
- `DailyCloseLocationSelector`.
- `DailyCloseHeader`.
- `InputsSection`.
- `OutputsSection`.
- `IncomeSection`.
- `ProfitSection`.
- `ScaleTicketReferenceForm`.
- `CashMovementForm`.
- `ReconciliationSummary`.
- `DifferenceAlertList`.
- `DailyCloseAuditTimeline`.
- `ReviewDailyCloseDialog`.
- `CloseDailyCloseDialog`.
- `CancelOrReopenDialog`.

## Ruta de uso

1. Seleccionar `OperationalLocation` y fecha de negocio.
2. Abrir o crear el cierre `DRAFT`.
3. Revisar operaciones detectadas y asociar ventas, pagos y movimientos válidos.
4. Capturar referencias manuales de báscula y gastos.
5. Completar entradas, salidas y existencia restante.
6. Ejecutar validación y revisar diferencias.
7. Enviar a revisión y cerrar con permisos administrativos.

## Encabezado

Debe mostrar:

- Ubicación, tipo y estado activo.
- Fecha de negocio.
- Estado: borrador, revisado, cerrado o cancelado.
- Usuario que abrió, revisó y cerró.
- Última validación y versión.
- Metadatos de frescura de los datos operativos.

La selección se limita a ubicaciones activas dentro del alcance del usuario. No debe ofrecer stock global.

## Entradas

Debe mostrar por producto:

- Traspasos y movimientos recibidos desde matriz u otra ubicación.
- Kilos y piezas recibidos.
- Folio o referencia trazable.
- Diferencias frente a captura manual, sin modificar el movimiento fuente.

`WAREHOUSE` puede consultar y confirmar la evidencia de entradas conforme a permisos; no modifica ingresos.

## Salidas

Debe separar:

- Ventas con nota simple.
- Ventas con ticket/etiqueta de báscula.
- Ventas con nota grande o comprobante interno.
- Solicitudes administrativas relacionadas, separadas del documento operativo.
- Sobrantes y faltantes.
- Otras salidas, mermas o ajustes autorizados.

Cada fila muestra producto, kilos, piezas, importe, documento y referencia. Una línea del cierre no modifica inventario; cualquier ajuste usa el flujo de inventario.

## Ingresos

Debe separar visualmente:

- Efectivo.
- Boucher/tarjeta.
- Transferencia.
- Pagos de cobranza.
- Otros métodos autorizados.
- Gastos y salidas de caja.
- Efectivo neto esperado y diferencia.

Las ventas a crédito no se presentan como efectivo recibido. Todo pago de cobranza mostrado conserva una única `AccountReceivable` mediante `accountReceivableId`. Un pago inmediato de contado puede mostrarse ligado a `saleId` sin `AccountReceivable`.

## Utilidad

Debe mostrar:

- Costo de compra.
- Venta total.
- Utilidad bruta.
- Gastos.
- Utilidad neta.
- Utilidad por pollo o unidad equivalente solo cuando exista fórmula aprobada.

Si la fórmula sigue abierta, mostrar "Cálculo pendiente de política de negocio" y no inventar resultados.

## Referencias manuales de báscula

`ScaleTicketReferenceForm` incluye:

- Folio físico.
- Venta relacionada opcional.
- Producto.
- Kilos.
- Piezas.
- Precio unitario.
- Importe.
- Fecha y hora de captura.
- Notas.

La UI debe indicar "Captura manual; sin integración automática con báscula". No debe mostrar conexión, lectura en vivo, sincronización de dispositivo ni acciones fiscales.

## Gastos y movimientos de caja

`CashMovementForm` incluye tipo, `movementChannel`, importe, motivo, referencia y fecha. Motivo e importe son obligatorios. Boucher/tarjeta y transferencia deben permanecer separados del efectivo.
`movementChannel` solo clasifica el medio operativo de la entrada/salida de caja y no sustituye el `paymentMethod` de `Payment`.

## Resumen de conciliación

Debe mostrar dos grupos de diferencias:

- Kilos: recibidos, vendidos, reportados por báscula, sobrantes, faltantes y otras salidas.
- Dinero: ventas esperadas, efectivo, tarjeta/boucher, transferencias, cobranza, gastos y diferencia neta.

Las diferencias se muestran con valor, unidad, origen y severidad. La UI no las oculta ni compensa. Si no existe tolerancia aprobada, debe indicarlo.

## Acciones y RBAC

| Acción | ADMIN | SELLER | WAREHOUSE | COLLECTIONS |
| --- | --- | --- | --- | --- |
| Consultar cierre | Sí | Su ubicación | Datos de inventario | Datos de ingresos autorizados |
| Crear borrador | Sí | Su ubicación | No | No |
| Editar borrador | Sí | Su ubicación | Solo entradas autorizadas | No |
| Capturar referencia de báscula | Sí | Su ubicación | No | No |
| Registrar gasto | Sí | Conforme a política | No | No |
| Revisar | Sí | No | No | No |
| Cerrar | Sí | No | No | No |
| Cancelar o reabrir | Sí | No | No | No |

`CASHIER` no se agrega; queda como decisión abierta.

## Estados de pantalla

- Loading: esqueletos por sección y acciones deshabilitadas.
- Error: mensaje del backend, código y reintento seguro.
- Empty: cierre sin operaciones o lista sin resultados, con siguiente acción permitida.
- Success: datos y última validación visibles.
- Unauthorized: explicación de alcance sin filtrar datos sensibles.
- Conflict: versión obsoleta; recargar antes de volver a validar o cerrar.

## Validaciones UI

- Ubicación y fecha requeridas.
- Solo editar `DRAFT`.
- Kilos aceptan decimales no negativos; piezas son enteras no negativas.
- Importes deben ser mayores o iguales a cero; gastos requieren importe mayor a cero.
- Motivo requerido para gastos, cancelación y reapertura.
- No cerrar con errores bloqueantes o validación obsoleta.
- No asociar operaciones de otra ubicación.
- Deshabilitar acciones durante solicitudes.
- Mostrar errores estándar de API sin sustituir reglas del backend.

## Accesibilidad y revisión

- Las secciones deben usar encabezados semánticos y tablas con etiquetas.
- Las diferencias no pueden depender solo del color.
- Los diálogos de cierre, cancelación y reapertura deben resumir impacto, motivo y versión.
- La línea de tiempo de auditoría debe permitir verificar quién realizó cada transición.

## Decisiones abiertas

- Cierre único por día frente a turnos o cajas múltiples.
- Tolerancias y severidades de diferencias.
- Fórmula oficial de utilidad y utilidad por pollo.
- Catálogo final de gastos y otros conceptos.
- Política de reapertura y periodos bloqueados.
