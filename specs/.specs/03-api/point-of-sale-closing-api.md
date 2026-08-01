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

El estado de `PointOfSaleDailyClose` representa el consolidado de sucursal. La operación monetaria usa `CashShiftStatus`; un cierre no puede avanzar a `CLOSED` mientras exista un turno `OPEN`.

Headers recomendados en comandos críticos:

- `Idempotency-Key`

## POST /api/point-of-sale-daily-closes

Propósito: crear explícitamente un cierre consolidado en borrador. La apertura ordinaria de turno puede crear o reutilizar este agregado.

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
- La terminal y los fondos no pertenecen a este endpoint; se registran mediante `CashTerminal` y `CashShift`.

## GET/POST/PATCH /api/cash-terminals

Propósito: consultar o registrar terminales persistentes administradas.

- `GET` permite `ADMIN` y `SELLER` dentro de su ubicación.
- `SELLER` debe enviar su `deviceId` y sólo recibe la terminal activa que coincide; no puede enumerar identidades de otros dispositivos.
- `POST` requiere `ADMIN` y recibe `operationalLocationId`, `code`, `name` y `deviceId`.
- `PATCH /api/cash-terminals/:id` permite a `ADMIN` enlazar una terminal migrada al dispositivo real, renombrarla o desactivarla.
- `deviceId` es globalmente único; `code` es único dentro de la ubicación.
- El nombre o código no sustituyen la prueba de dispositivo.

## POST /api/cash-terminal-activations

Propósito: solicitar desde el navegador bloqueado un código temporal para cutover supervisado.

- Permite `ADMIN` y `SELLER` autenticados con ubicación operativa asignada.
- Recibe `deviceId` y `operationalLocationId` opcional. Para `SELLER` la ubicación siempre se deriva del usuario; `ADMIN` puede indicar la ubicación que está recuperando.
- Invalida cualquier código pendiente previo para el mismo dispositivo.
- Devuelve un código de un solo uso y `expiresAt`; el código vence a los 15 minutos y solo se almacena su hash.
- No vincula una terminal ni permite abrir turno por sí mismo.

## POST /api/cash-terminals/:id/activate

Propósito: vincular de forma supervisada una terminal migrada al navegador que solicitó el código.

- Requiere `ADMIN` y recibe `activationCode`.
- La terminal debe conservar un `deviceId` con prefijo `legacy:`.
- El código debe existir, estar vigente, no consumido y pertenecer a la misma ubicación de la terminal.
- La actualización de terminal y consumo del código son atómicos.
- Conserva el identificador e historial de la terminal y mantiene la unicidad global de `deviceId`.

## GET /api/cash-shifts/current

Propósito: obtener exclusivamente el turno abierto del usuario autenticado para `deviceId`.

No busca el último turno de la sucursal ni devuelve el turno de otro cajero.

## POST /api/cash-shifts

Propósito: abrir un turno independiente en una terminal registrada.

Body: `terminalId`, `deviceId`, `businessDate`, `initialCashFund`, `initialCashIn`, `initialCashOut`, `notes` opcionales.

- Terminal activa, ubicación autorizada y coincidencia exacta de dispositivo.
- La ubicación debe estar activa, habilitada para punto de venta y la fecha no puede ser futura.
- Solo un turno abierto por terminal.
- Crea o reutiliza el cierre diario consolidado de sucursal y fecha solo cuando está en `DRAFT`; un cierre revisado o cerrado requiere reapertura explícita.
- Los movimientos iniciales conservan `cashShiftId`.

## PATCH /api/cash-shifts/:id/close

Propósito: cerrar el turno con conteo independiente.

Body normal: `deviceId`, `cashCountedTotal`.

Body administrativo para un turno abandonado o una terminal inaccesible: `cashCountedTotal`, `administrativeReason`. No se envía ni se inventa el `deviceId` original.

El backend valida cajero o privilegio administrativo, calcula efectivo esperado y persiste `cashDifferenceTotal` sin alterar las diferencias de otros turnos.
Los depósitos y retiros iniciales se representan también como movimientos auditables, pero se contabilizan una sola vez en el efectivo esperado.

- El cierre normal exige cajero propietario y coincidencia exacta del `deviceId`.
- El cierre administrativo exige `cash_shifts.administrative_close`, motivo no vacío y conserva `closeMode=ADMINISTRATIVE` y `closeReason`.
- Toda modalidad conserva actor, fecha, conteo y diferencia; el cierre administrativo registra además un evento auditable asociado al cierre diario.
- Los códigos `CASH_SHIFT_NOT_OPEN`, `CASH_SHIFT_CASHIER_MISMATCH`, `CASH_TERMINAL_DEVICE_MISMATCH`, `CASH_SHIFT_ADMINISTRATIVE_REASON_REQUIRED` y `CASH_SHIFT_ADMINISTRATIVE_PERMISSION_REQUIRED` son estables.

## POST /api/cash-shifts/:id/movements

Propósito: registrar un gasto, entrada o retiro contra el turno abierto del cajero y dispositivo actuales.

Body: `deviceId`, `type` (`EXPENSE`, `CASH_IN` o `CASH_OUT`), `amount`, `reason` y `reference` opcional.

- Requiere el header `Idempotency-Key`; repetir la misma clave y payload devuelve el movimiento previo.
- Rechaza reutilizar la clave con otro payload.
- Valida turno abierto, cajero o privilegio administrativo y coincidencia exacta del dispositivo registrado.
- El backend deriva ubicación y cierre diario desde el turno; el cliente no puede reemplazarlos.

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
- La proyección de `SELLER` conserva ventas, pagos, gastos, efectivo contado y diferencias de caja, pero omite `purchaseCostTotal`, `grossProfitTotal`, `netProfitTotal`, `costQuality` y cualquier otro dato de costo o utilidad.
- `WAREHOUSE` recibe únicamente la proyección autorizada de inventario y kilos; `COLLECTIONS` recibe únicamente la proyección autorizada de cobranza e ingresos; `ADMIN` recibe los totales financieros completos.

## GET /api/point-of-sale-daily-closes/:id

Propósito: obtener el cierre completo.

Respuesta `data`:

- Encabezado y totales.
- `cashShifts[]`, `lines[]`, `sales[]`, `payments[]`, `cashMovements[]`, `scaleTicketReferences[]`.
- `validation`: advertencias, bloqueos y versión validada.
- Auditoría de transiciones.

El backend debe ocultar secciones no autorizadas por rol.
En particular, para `SELLER` debe omitir los snapshots de costo dentro de `sales[].items[]`, las líneas de sección `PROFIT` y los conceptos de utilidad. La omisión debe ocurrir también en `refresh` y en la respuesta de `validate`, no solo en la UI.

`data.differences[]` conserva para cada diferencia `code`, `scope`, `referenceKey`, `unit`, `expectedValue`, `recordedValue`, `differenceValue`, `differenceType`, `status`, `reason`, `evidence`, `justifiedBy`, `justifiedAt`, `authorizedBy` y `authorizedAt`. La respuesta también incluye `openedBy`, `reviewedBy`, `closedBy` y `unresolvedDifferenceCount` cuando el rol tenga acceso a la proyección.

Cada elemento de `cashShifts[]` incluye terminal, cajero, estado, apertura, cierre, fondo, entradas, retiros, conteo y diferencia.

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
- Las ventas de contado y pagos en efectivo deben llegar ya asociados al cierre mediante `pointOfSaleDailyCloseId`; no dependen de esta asociación posterior.
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
  "saleDocumentId": "string opcional",
  "productId": "string opcional",
  "grossWeightKg": 1.835,
  "tareWeightKg": 0.100,
  "netWeightKg": 1.735,
  "pieceCount": 0,
  "unitPrice": 49,
  "amount": 85.02,
  "capturedDate": "2026-06-19",
  "scaleDeviceId": "string opcional",
  "notes": "Captura manual"
}
```

Validaciones:

- Solo captura manual; no aceptar payloads que pretendan representar sincronización de dispositivo.
- Requiere el header `Idempotency-Key`; repetir la misma clave y payload devuelve el resultado previo sin crear otra referencia.
- Folio único por ubicación y fecha, salvo corrección auditada.
- La venta y el documento asociado deben pertenecer a la misma ubicación, corresponder entre sí y el documento debe ser `SCALE_TICKET`.
- `capturedDate` debe coincidir con `businessDate` del cierre.
- Las correcciones históricas no se realizan en este endpoint; requieren un procedimiento administrativo separado y auditable.
- No genera venta, movimiento de inventario o CFDI.

## POST /api/point-of-sale-daily-closes/:id/expenses

Propósito: contrato compatible para registrar un gasto contra un turno del cierre diario. El endpoint preferente para nuevas integraciones es `/api/cash-shifts/:id/movements`.

Permisos: `ADMIN`, `SELLER` conforme a política; `COLLECTIONS` solo consulta.

Body:

```json
{
  "cashShiftId": "string",
  "deviceId": "string",
  "amount": 120,
  "reason": "Compra operativa autorizada",
  "reference": "string opcional",
  "occurredAt": "2026-06-19T15:00:00-06:00"
}
```

Validaciones:

- Solo `DRAFT`.
- Requiere turno abierto del cajero autenticado y coincidencia exacta del dispositivo registrado.
- Requiere el header `Idempotency-Key`; repetir la misma clave y payload devuelve el resultado previo sin crear otro movimiento.
- El backend valida que `cashShiftId` pertenezca al cierre `:id`; el cliente no puede reemplazar la ubicación ni el cierre derivados.
- Monto mayor a cero, motivo y ubicación requeridos.
- `CARD_VOUCHER` representa boucher/tarjeta y debe separarse de efectivo.
- `movementChannel` clasifica solo el medio operativo de la entrada/salida de caja.
- No sustituye `Payment` para cobranza ni duplica el `paymentMethod` de una venta o pago aplicado.
- `occurredAt` debe estar dentro del rango operativo del cierre: inclusivo desde el inicio y exclusivo en el siguiente inicio de jornada.
- Las correcciones históricas no se realizan en este endpoint; requieren un procedimiento administrativo separado y auditable.

## Atomicidad y snapshots

- Las altas de gastos, referencias de báscula y conteos físicos ejecutan creación, versión, recálculo y evento de auditoría dentro de una sola transacción.
- Las transiciones a `REVIEWED`, `CLOSED` o de vuelta a `DRAFT` por reapertura persisten un `DailyCloseSnapshot` inmutable con payload JSON, hash, versión fuente, actor y fecha.
- Si falla el recálculo, el evento o el snapshot, toda la mutación revierte.

## POST /api/point-of-sale-daily-closes/:id/validate

Propósito: recalcular totales y detectar diferencias antes de revisar o cerrar.

Permisos: roles con acceso de lectura al cierre; la respuesta se filtra por rol.

Respuesta `data`:

- `weightReconciliation`: recibidos, vendidos, sobrantes, faltantes, otras salidas y diferencia.
- `scaleReconciliation`: kilos e importes registrados frente a referencias de báscula.
- `incomeReconciliation`: efectivo, tarjeta/boucher, transferencia, cobranza, gastos y esperado.
- `profitSummary`: compra, venta, utilidad bruta y neta.
- `warnings[]`, `blockingErrors[]`, `validatedVersion`, `validatedAt`.

La respuesta de `SELLER` debe excluir `profitSummary` y cualquier campo de costo o utilidad del cierre; conserva únicamente la información de ingresos y diferencias de caja autorizada para su operación.

Validaciones:

- No ocultar diferencias.
- No aplicar tolerancias ni fórmulas no aprobadas.
- Bloquear si ventas, movimientos, pagos o caja carecen de ubicación.
- Bloquear si datos asociados cambiaron durante la validación.
- Bloquear con `CASH_COUNT_REQUIRED` si no existe efectivo contado.
- Solo una validación sin errores actualiza `validatedVersion` y `validatedAt`; todo intento registra `lastValidationAttemptAt` sin marcar el cierre como validado.

## PATCH /api/point-of-sale-daily-closes/:id/differences/:differenceId/justify

Propósito: registrar el motivo y la evidencia textual de una diferencia activa.

Permisos: `ADMIN` o `SELLER` dentro de su ubicación.

Body:

```json
{
  "version": 4,
  "reason": "Conteo validado con encargado",
  "evidence": "Folio CAJA-22"
}
```

La operación solo admite cierres `DRAFT`, incrementa la versión, invalida la validación vigente y registra `DIFFERENCE_JUSTIFIED` en una transacción.

## PATCH /api/point-of-sale-daily-closes/:id/differences/:differenceId/authorize

Propósito: autorizar una diferencia previamente justificada.

Permisos: `ADMIN`.

Body: `{"version": 4}`.

La operación solo admite una diferencia `PENDING_AUTHORIZATION`, incrementa la versión, invalida la validación vigente y registra `DIFFERENCE_AUTHORIZED` en una transacción. No modifica operaciones fuente.

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
- `INITIAL_CASH_AMOUNT_INVALID`
- `INITIAL_CASH_OUT_EXCEEDS_AVAILABLE`
- `CASH_SESSION_REQUIRED`
- `CASH_SESSION_NOT_OPEN`
- `CASH_SESSION_LOCATION_MISMATCH`
- `SCALE_TICKET_DUPLICATE_FOLIO`
- `RECONCILIATION_BLOCKED`
- `FORBIDDEN`
- `DAILY_CLOSE_DIFFERENCE_NOT_FOUND`
- `DAILY_CLOSE_DIFFERENCE_REASON_REQUIRED`
- `DAILY_CLOSE_DIFFERENCE_EVIDENCE_REQUIRED`
- `DAILY_CLOSE_DIFFERENCE_ALREADY_RESOLVED`
- `DAILY_CLOSE_DIFFERENCE_NOT_READY_FOR_AUTHORIZATION`

## Decisiones abiertas

- El cierre permanece único por ubicación y fecha, y consolida múltiples terminales y turnos independientes.
- Tolerancias de peso y dinero y si bloquean o solo advierten.
- Fórmulas oficiales de costo y utilidad.
- Catálogo final de conceptos, métodos y bancos.
- Política de folios y correcciones.
- Política de reapertura y bloqueo de periodos.
