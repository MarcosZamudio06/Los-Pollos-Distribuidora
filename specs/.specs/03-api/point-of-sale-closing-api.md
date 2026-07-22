# API - Cierre diario de punto de venta

Define el contrato para capturar, conciliar, revisar y cerrar la operación diaria de una `OperationalLocation` fija. Este dominio es independiente de `RouteSettlement`.

## Convenciones

- Prefijo: `/api/point-of-sale-daily-closes`.
- Inventario, ventas, pagos y movimientos conservan su ubicación original.
- Tickets de báscula se capturan manualmente; no existe integración automática con hardware en el MVP.
- Ticket, nota y cierre son documentos internos; no son CFDI.
- Operaciones críticas de transición se ejecutan en transacción.
- Los totales monetarios solo incluyen `Payment` con estado `APPLIED`; `REGISTERED` no representa dinero recibido para el cierre.

Respuesta exitosa:

```json
{
  "success": true,
  "message": "Operación realizada correctamente",
  "data": {}
}
```

Respuesta de error:

```json
{
  "success": false,
  "message": "Descripción del error",
  "error": "ERROR_CODE",
  "statusCode": 400
}
```

## Estados y transiciones

```text
DRAFT -> REVIEWED -> CLOSED
DRAFT -> CANCELLED
REVIEWED -> DRAFT
REVIEWED -> CANCELLED
CLOSED -> DRAFT        solo ADMIN mediante reapertura auditada
```

No se elimina físicamente un cierre. Cancelar o reabrir requiere motivo y control de versión.

Headers recomendados en comandos críticos:

- `Idempotency-Key`

## POST /api/point-of-sale-daily-closes

Propósito: crear cierre en borrador.

Permisos: `ADMIN`, `SELLER` dentro de su ubicación.

Body:

```json
{
  "operationalLocationId": "string",
  "businessDate": "2026-06-19",
  "notes": "string opcional"
}
```

Validaciones:

- Ubicación requerida, activa y de tipo `BRANCH`, `MIXED` o `EXTERNAL_POINT_OF_SALE`.
- No crear un segundo cierre no cancelado para la misma ubicación y fecha.
- `SELLER` solo puede crear dentro de su alcance.

## GET /api/point-of-sale-daily-closes

Propósito: consultar resumen por ubicación y fecha.

Permisos: `ADMIN`; `SELLER`, `WAREHOUSE` y `COLLECTIONS` con proyección y alcance autorizados.

Query:

- `operationalLocationId`, `businessDate`, `dateFrom`, `dateTo`, `status`.
- `page`, `limit`.

Respuesta `data.items[]`:

- Identidad, ubicación, fecha, estado y responsables.
- Totales de kilos, ventas, ingresos, gastos, utilidad y diferencias.
- `warningCount`, `lastValidatedAt`, `createdAt`, `updatedAt`.

## GET /api/point-of-sale-daily-closes/:id

Propósito: obtener el cierre completo.

Respuesta `data`:

- Encabezado y totales.
- `lines[]`, `sales[]`, `payments[]`, `cashMovements[]`, `scaleTicketReferences[]`.
- `validation`: advertencias, bloqueos y versión validada.
- Auditoría de transiciones.

El backend debe ocultar secciones no autorizadas por rol.

## POST /api/point-of-sale-daily-closes/:id/lines

Propósito: agregar o actualizar manualmente una línea de entrada o salida en borrador. Las líneas `INCOME` y `PROFIT` son snapshots derivados y no se capturan mediante este endpoint.

Permisos: `ADMIN`, `SELLER`; `WAREHOUSE` solo líneas de inventario autorizadas.

Body:

```json
{
  "section": "INPUT",
  "conceptType": "PRODUCT_RECEIVED",
  "productId": "string opcional",
  "inventoryMovementId": "string opcional",
  "quantityKg": 120.5,
  "quantityPieces": 0,
  "amount": 0,
  "notes": "string opcional"
}
```

Validaciones:

- Solo `DRAFT`.
- La captura manual solo admite `section=INPUT` o `section=OUTPUT`.
- Rechazar `section=INCOME` y `section=PROFIT`; el backend las calcula desde las operaciones asociadas. Los pagos y la cobranza se derivan exclusivamente de `Payment`; `CashMovement` solo aporta entradas, salidas o ajustes operativos de caja separados.
- Un `amount` capturado manualmente no representa dinero recibido ni participa como fuente monetaria independiente.
- Referencias deben pertenecer a la misma ubicación y fecha aplicable.
- La línea no modifica inventario por sí misma.
- Piezas enteras y kilos decimales no negativos.

## POST /api/point-of-sale-daily-closes/:id/associations

Propósito: asociar ventas, notas, pagos y movimientos existentes al cierre.

Permisos: `ADMIN`, `SELLER`; `COLLECTIONS` puede asociar pagos autorizados sin modificar inventario.

Body:

```json
{
  "saleIds": ["string"],
  "paymentIds": ["string"],
  "inventoryMovementIds": ["string"]
}
```

Validaciones:

- Todas las operaciones deben pertenecer a la misma `OperationalLocation` y fecha de negocio.
- Una venta o movimiento no puede pertenecer a dos cierres no cancelados.
- Todo pago de cobranza conserva `accountReceivableId` obligatorio y una sola cuenta por cobrar.
- Un pago inmediato de contado puede asociarse al cierre mediante `saleId` sin `AccountReceivable`.
- `cashMovementIds` no forma parte de este contrato: los movimientos de caja del MVP se crean mediante el endpoint anidado `/:id/cash-movements` y quedan asociados al cierre desde su creación.
- Cobros de ruta no se asocian automáticamente; se concilian en `RouteSettlement`.

## POST /api/point-of-sale-daily-closes/:id/scale-ticket-references

Propósito: capturar manualmente ticket, etiqueta o reporte de báscula.

Permisos: `ADMIN`, `SELLER`.

Body:

```json
{
  "physicalFolio": "BAS-001",
  "saleId": "string opcional",
  "productId": "string opcional",
  "weightKg": 1.735,
  "pieceCount": 0,
  "unitPrice": 49,
  "amount": 85.02,
  "capturedAt": "2026-06-19T13:37:00-06:00",
  "notes": "Captura manual"
}
```

Validaciones:

- Solo captura manual; no aceptar payloads que pretendan representar sincronización de dispositivo.
- Folio único por ubicación y fecha, salvo corrección auditada.
- La venta asociada debe pertenecer a la misma ubicación.
- `capturedDate` debe coincidir con `businessDate` del cierre.
- Las correcciones históricas no se realizan en este endpoint; requieren un procedimiento administrativo separado y auditable.
- No genera venta, movimiento de inventario o CFDI.

## POST /api/point-of-sale-daily-closes/:id/cash-movements

Propósito: registrar gasto, entrada, salida o ajuste de caja.

Permisos: `ADMIN`, `SELLER` conforme a política; `COLLECTIONS` solo consulta.

Body:

```json
{
  "type": "EXPENSE",
  "movementChannel": "CASH",
  "amount": 120,
  "reason": "Compra operativa autorizada",
  "reference": "string opcional",
  "occurredAt": "2026-06-19T15:00:00-06:00"
}
```

Validaciones:

- Solo `DRAFT`.
- El backend asigna `pointOfSaleDailyCloseId` desde `:id`; el cliente no puede enviarlo ni reemplazarlo.
- Monto mayor a cero, motivo y ubicación requeridos.
- `CARD_VOUCHER` representa boucher/tarjeta y debe separarse de efectivo.
- `movementChannel` clasifica solo el medio operativo de la entrada/salida de caja.
- No sustituye `Payment` para cobranza ni duplica el `paymentMethod` de una venta o pago aplicado.
- `occurredAt` debe estar dentro del rango operativo del cierre: inclusivo desde el inicio y exclusivo en el siguiente inicio de jornada.
- Las correcciones históricas no se realizan en este endpoint; requieren un procedimiento administrativo separado y auditable.

## POST /api/point-of-sale-daily-closes/:id/validate

Propósito: recalcular totales y detectar diferencias antes de revisar o cerrar.

Permisos: roles con acceso de lectura al cierre; la respuesta se filtra por rol.

Respuesta `data`:

- `weightReconciliation`: recibidos, vendidos, sobrantes, faltantes, otras salidas y diferencia.
- `scaleReconciliation`: kilos e importes registrados frente a referencias de báscula.
- `incomeReconciliation`: efectivo, tarjeta/boucher, transferencia, cobranza, gastos y esperado.
- `profitSummary`: compra, venta, utilidad bruta y neta.
- `warnings[]`, `blockingErrors[]`, `validatedVersion`, `validatedAt`.

Validaciones:

- No ocultar diferencias.
- No aplicar tolerancias ni fórmulas no aprobadas.
- Bloquear si ventas, movimientos, pagos o caja carecen de ubicación.
- Bloquear si datos asociados cambiaron durante la validación.
- Bloquear con `CASH_COUNT_REQUIRED` si no existe efectivo contado.

## POST /api/point-of-sale-daily-closes/:id/cash-count

Propósito: persistir el efectivo físico contado y recalcular la diferencia de efectivo.

Permisos: `ADMIN`, `SELLER` dentro de su ubicación, solo en `DRAFT`.

Body:

```json
{
  "cashCountedTotal": 1200.00
}
```

Validaciones:

- `cashCountedTotal` debe ser mayor o igual a cero.
- El backend persiste `cashDifferenceTotal = cashCountedTotal - netCashExpected`.
- La diferencia se expone como advertencia; no se compensa ni se aplican tolerancias sin política aprobada.
- La revisión y el cierre con diferencia permanecen autorizados exclusivamente para `ADMIN`.

## POST /api/point-of-sale-daily-closes/:id/review

Propósito: pasar de `DRAFT` a `REVIEWED` con snapshot validado.

Permisos: `ADMIN`.

Body: `expectedVersion`, `notes` opcional.

Validaciones: ejecutar validación vigente y rechazar errores bloqueantes.

## POST /api/point-of-sale-daily-closes/:id/close

Propósito: confirmar el cierre diario.

Permisos: `ADMIN`.

Body:

```json
{
  "expectedVersion": 4,
  "reason": "Cierre verificado"
}
```

Validaciones:

- Estado `REVIEWED` y versión validada vigente.
- Sin operaciones asociadas sin ubicación.
- Recalcular y persistir snapshot de kilos, ingresos, gastos y utilidad.
- Ejecutar transición y asociaciones en transacción.
- Requerir idempotencia para evitar doble cierre accidental.

## POST /api/point-of-sale-daily-closes/:id/cancel

Propósito: cancelar sin eliminar historial.

Permisos: `ADMIN`.

Body: `expectedVersion`, `reason` requerido.

Validaciones: no cancelar silenciosamente movimientos fuente; cualquier reversa usa su dominio correspondiente.
Debe persistir actor, fecha, motivo, versión e idempotencia.

## POST /api/point-of-sale-daily-closes/:id/reopen

Propósito: reabrir un cierre `REVIEWED` o `CLOSED` a `DRAFT`.

Permisos: `ADMIN`.

Body: `expectedVersion`, `reason` requerido.

Validaciones:

- Registrar usuario, fecha, motivo y snapshot previo.
- Rechazar si el periodo está bloqueado por una política administrativa futura.
- No revertir ventas, pagos o inventario automáticamente.
- Requerir idempotencia para evitar doble reapertura.

## Códigos de error

- `LOCATION_REQUIRED`
- `LOCATION_INACTIVE`
- `LOCATION_NOT_POINT_OF_SALE`
- `LOCATION_NOT_AUTHORIZED`
- `DAILY_CLOSE_ALREADY_EXISTS`
- `DAILY_CLOSE_INVALID_STATUS`
- `DAILY_CLOSE_VERSION_CONFLICT`
- `DAILY_CLOSE_UNVALIDATED`
- `OPERATION_LOCATION_MISMATCH`
- `OPERATION_WITHOUT_LOCATION`
- `CASH_COUNT_REQUIRED`
- `SCALE_TICKET_DUPLICATE_FOLIO`
- `RECONCILIATION_BLOCKED`
- `FORBIDDEN`

## Decisiones abiertas

- Cierre único por día frente a turnos o cajas múltiples.
- Tolerancias de peso y dinero y si bloquean o solo advierten.
- Fórmulas oficiales de costo y utilidad.
- Catálogo final de conceptos, métodos y bancos.
- Política de folios y correcciones.
- Política de reapertura y bloqueo de periodos.
