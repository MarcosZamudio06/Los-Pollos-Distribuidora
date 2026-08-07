
# Plan de Inventario CEDIS y Sucursales

## Propósito

Implementar un modelo operativo en el que el CEDIS conserve la propiedad contable de la mercancía, mientras cada sucursal mantenga la existencia física recibida en custodia para venderla y devolver los sobrantes.

El plan cubre:

- Inventario físico por ubicación.
- Propiedad contable derivada desde el CEDIS padre.
- Validación de stock suficiente o insuficiente al distribuir mercancía.
- Reservas de mercancía para evitar doble asignación.
- Suministros CEDIS → sucursal.
- Ventas y devoluciones sucursal → CEDIS.
- Trazabilidad, concurrencia, permisos, UI y conciliación.

Este documento es un plan de implementación. Antes de modificar código se deben actualizar los specs canónicos que resulten afectados.

## Decisión Operativa

El CEDIS es el padre de la red y cada sucursal es una hija directa.

| Concepto | Definición | Ubicación de referencia |
|---|---|---|
| Propiedad contable | Mercancía que pertenece al CEDIS, esté físicamente en el CEDIS o en una sucursal en custodia | Se calcula desde la relación CEDIS → sucursales |
| Existencia física | Mercancía realmente ubicada en una operación | `InventoryBalance` por producto y ubicación |
| Mercancía comprometida | Existencia física apartada para transferencias pendientes | Reserva sobre `InventoryBalance` |
| Disponible para surtir | Existencia física no comprometida | Disponible del origen |
| Custodia de sucursal | Mercancía recibida por una sucursal, disponible para vender o devolver | `InventoryBalance` de la sucursal |

No se debe crear un campo `Product.stock`, un stock global ni un segundo agregado de inventario.

## Diagnóstico Actual

El sistema ya contiene una parte importante del flujo requerido:

- `OperationalLocation` modela CEDIS y sucursales.
- Una sucursal debe tener un CEDIS activo como padre mediante `parentId`.
- Las compras externas solo se reciben en ubicaciones `DISTRIBUTION_CENTER`.
- Los suministros y devoluciones utilizan `InventoryTransfer`.
- Los ciclos CEDIS permiten múltiples suministros y múltiples devoluciones.
- Una recepción de suministro conserva las cantidades enviadas y registra diferencias físicas.
- Las ventas descuentan la existencia física de la ubicación de venta.
- Las transferencias confirmadas aplican salida y entrada en una transacción.
- La base de datos ya protege `quantityKg` y `quantityPieces` contra valores negativos.
- La recepción de sucursal ya registra faltantes como `SHRINKAGE` y sobrantes como `IN`.

Los huecos principales son:

1. Crear un suministro pendiente no compromete el stock del CEDIS.
2. Dos suministros pendientes pueden prometer la misma mercancía.
3. La insuficiencia se detecta hasta la confirmación o recepción.
4. La UI no muestra existencia física, mercancía comprometida y disponibilidad antes de distribuir.
5. La API documenta `INSUFFICIENT_STOCK`, pero algunas rutas aún devuelven mensajes genéricos.
6. El resumen CEDIS muestra existencia física del CEDIS, pero no separa propiedad, custodia, reserva y disponible.
7. Las operaciones de ventas, compras, ajustes y transferencias modifican balances desde servicios distintos.

## Alcance

### Incluido

- Reservar stock al crear un suministro o una devolución pendiente.
- Liberar la reserva al cancelar una transferencia.
- Consumir la reserva al confirmar una transferencia.
- Validar disponibilidad por producto, KG y PIECE.
- Mantener la existencia física de la sucursal en custodia.
- Mostrar propiedad de red y existencia física por ubicación.
- Bloquear ventas y ajustes negativos contra mercancía reservada.
- Migrar reservas históricas de transferencias pendientes.
- Agregar pruebas unitarias, de concurrencia, integración, E2E y frontend.

### Fuera de alcance

- CFDI, SAT, PAC, timbrado o UUID fiscal.
- Integración con básculas, lectores u otro hardware.
- Conversión automática kilo-pieza sin equivalencia aprobada.
- Expiración automática de transferencias pendientes.
- Reversa automática de transferencias confirmadas.
- Creación de una ubicación virtual de mercancía en tránsito.

## Reglas de Negocio Objetivo

### Jerarquía

- El CEDIS debe ser una `OperationalLocation` activa de tipo `DISTRIBUTION_CENTER`.
- El CEDIS raíz no debe tener padre.
- La sucursal debe ser una `OperationalLocation` activa de tipo `BRANCH`.
- La sucursal debe tener como `parentId` el CEDIS que la surte.
- Una sucursal no puede recibir compras externas.
- Una sucursal no puede recibir transferencias genéricas.
- Una sucursal solo puede recibir suministros de su CEDIS padre.
- Una devolución solo puede viajar de una sucursal a su CEDIS padre.
- Una sucursal no puede cambiar de CEDIS mientras tenga un ciclo abierto.

### Propiedad y custodia

- El CEDIS conserva la propiedad contable de la mercancía enviada.
- La sucursal conserva la existencia física recibida en custodia.
- La venta ocurre en la ubicación física donde está la mercancía.
- La devolución devuelve físicamente la mercancía al CEDIS y conserva la trazabilidad del ciclo.
- El valor de propiedad de red no se obtiene duplicando movimientos ni creando un balance global.
- La propiedad de red se calcula agregando los balances físicos del CEDIS y sus sucursales directas.

### Disponibilidad

Para cada producto y dimensión física:

```text
availableKg = quantityKg - reservedQuantityKg
availablePieces = quantityPieces - reservedQuantityPieces
```

La propiedad total del CEDIS se calcula como:

```text
ownedNetworkKg = cedisPhysicalKg + sum(branchCustodyKg)
ownedNetworkPieces = cedisPhysicalPieces + sum(branchCustodyPieces)
```

La mercancía reservada permanece dentro de `quantityKg` o `quantityPieces`; no se suma nuevamente a la propiedad.

### Estados y reservas

| Estado de transferencia | Existencia física | Reserva |
|---|---|---|
| `DRAFT` | Sin cambio | No mantiene reserva |
| `REQUESTED` | Sin cambio | Reserva activa en el origen |
| `IN_TRANSIT` | Sin cambio en el modelo actual | Reserva activa en el origen |
| `CONFIRMED` | Sale del origen y entra al destino | La reserva se consume |
| `CANCELLED` | Sin cambio | La reserva se libera |

Mientras una transferencia esté pendiente, la mercancía continúa físicamente en su origen. La reserva impide que otra operación la asigne o venda.

### Unidades

- `KG` exige kilos positivos y cero piezas.
- `PIECE` exige piezas enteras positivas y cero kilos.
- `KG_AND_PIECE` conserva ambas dimensiones por separado.
- No se deben sumar dos veces kilos y piezas equivalentes.
- La dimensión faltante solo puede derivarse con equivalencia activa, fecha aplicable y política de redondeo aprobada.
- Las cantidades recibidas pueden diferir de las enviadas, pero una diferencia exige nota no vacía.

## Arquitectura de Datos

### `InventoryBalance`

Agregar al modelo:

```text
reservedQuantityKg      Decimal @default(0)
reservedQuantityPieces  Int     @default(0)
```

Restricciones requeridas:

```text
quantityKg >= 0
quantityPieces >= 0
reservedQuantityKg >= 0
reservedQuantityPieces >= 0
reservedQuantityKg <= quantityKg
reservedQuantityPieces <= quantityPieces
```

La clave única existente por producto y ubicación debe conservarse:

```text
@@unique([productId, locationId])
```

### Movimientos

Los movimientos existentes deben continuar siendo la fuente de trazabilidad física:

- `PURCHASE`: entrada externa al CEDIS.
- `TRANSFER_OUT`: salida física del origen.
- `TRANSFER_IN`: entrada física al destino.
- `SALE`: venta en la ubicación física de la mercancía.
- `SHRINKAGE`: faltante documentado.
- `IN`: sobrante documentado.
- `ADJUSTMENT`, `OUT` e `IN`: ajustes autorizados con motivo.

La reserva no crea un movimiento físico. Debe conservarse mediante el estado de `InventoryTransfer` y las columnas reservadas.

### Integridad histórica

No se deben sobrescribir:

- Cantidades enviadas.
- Cantidades recibidas.
- Movimientos confirmados.
- Saldos anteriores y posteriores de movimientos.
- Eventos del ciclo.
- Snapshots de producto, precio y costo.

## Plan por Fases

### Fase 0: Preparación documental

**Estado: IMPLEMENTADA**

Crear una TASK independiente para este cambio, por ejemplo:

```text
TASK-CEDIS-CUSTODY-STOCK-AVAILABILITY
```

Actualizar antes del código:

- `specs/modules/inventory/spec.md`
- `specs/modules/branch-supply-cycles/spec.md`
- `specs/.specs/03-api/inventory-api.md`
- `specs/.specs/03-api/inventory-transfers-api.md`
- `specs/.specs/03-api/branch-supply-cycles-api.md`
- Las secciones afectadas de `specs/.specs/02-database/database.md`
- `specs/.specs/07-workflows/task/action.md`, creando o activando la TASK correspondiente

Los specs deben establecer explícitamente que:

- `InventoryBalance` representa existencia física en custodia.
- El propietario de una sucursal se deriva de su CEDIS padre.
- Las transferencias pendientes reservan mercancía en el origen.
- Las ventas y ajustes negativos no pueden consumir mercancía reservada.
- La insuficiencia devuelve `INSUFFICIENT_STOCK` con detalle por producto.
- Las reservas no representan una ubicación física adicional.

TASK activa: `TASK-CEDIS-CUSTODY-STOCK-AVAILABILITY` en
`specs/.specs/07-workflows/task/action.md`.

### Fase 1: Auditoría y preflight de datos

**Estado: IMPLEMENTADA**

La auditoría de solo lectura está disponible mediante:

```bash
pnpm --dir backend run inventory:preflight
pnpm --dir backend run inventory:preflight -- --json
```

Implementación:

- `backend/src/modules/inventory/cedis-inventory-preflight.ts`: carga y valida la jerarquía, balances y transferencias sin mutar datos.
- `backend/prisma/scripts/cedis-inventory-preflight.ts`: comando ejecutable contra PostgreSQL.
- `backend/src/modules/inventory/cedis-inventory-preflight.spec.ts`: pruebas de jerarquía, sobrerreservas, unidades, productos y modo inmutable.
- `backend/package.json`: script `inventory:preflight`.

El comando utiliza exclusivamente consultas de lectura. Devuelve `PASS` y código de salida `0` cuando no existen hallazgos, `FAIL` y código de salida `1` cuando detecta inconsistencias, y código `2` cuando no puede conectarse o ejecutar la auditoría. La salida JSON incluye `findings[]`, `findingsByCode` y el detalle de cada entidad afectada.

Última ejecución contra PostgreSQL/PostGIS local:

- Resultado: `PASS` con 0 hallazgos.
- Alcance leído: 18 ubicaciones, 55 balances, 45 transferencias y 3 transferencias con compromiso (`REQUESTED`/`IN_TRANSIT`).
- La migración de reservas backfilló `210.000 kg` en dos balances de origen sin crear movimientos físicos.
- Acción del preflight: ninguna. El preflight sigue siendo de solo lectura.

Corrección de flujo aplicada después del hallazgo:

- Un suministro CEDIS → sucursal nuevo valida el stock físico antes de crear la transferencia.
- La confirmación o recepción vuelve a validar el saldo de forma atómica.
- La respuesta usa `INSUFFICIENT_STOCK` con cantidades solicitadas, disponibles y faltantes.
- La operación no crea transferencias ni movimientos parciales cuando el saldo es insuficiente.

Crear un preflight de solo lectura que reporte:

- Sucursales sin CEDIS padre válido.
- CEDIS con padre, inactivos o con tipo incompatible.
- Balances negativos.
- Transferencias pendientes sin partidas.
- Transferencias pendientes con productos inexistentes o inactivos.
- Transferencias con ubicaciones inactivas.
- Transferencias CEDIS → sucursal fuera de un ciclo.
- Transferencias hacia sucursales que no sean hijas directas.
- Devoluciones que no regresen al CEDIS padre.
- Duplicados de producto dentro de una transferencia.
- Cantidades incompatibles con la unidad del producto.
- Suma de transferencias pendientes superior a la existencia física del origen.

El preflight debe fallar ante sobrerreservas históricas. No se deben reducir cantidades, cancelar operaciones ni crear inventario automáticamente.

### Fase 2: Migración de base de datos

**Estado: IMPLEMENTADA**

Modificar `backend/prisma/schema.prisma` y crear una migración nueva.

Orden de migración:

1. Agregar columnas reservadas con cero como valor inicial.
2. Ejecutar preflight dentro de la migración o antes de aplicarla.
3. Agrupar transferencias `REQUESTED` e `IN_TRANSIT` por origen, producto y dimensión.
4. Calcular reservas históricas.
5. Comparar reservas contra existencia física.
6. Abortar si una reserva supera el saldo o si existen datos incompatibles.
7. Persistir reservas válidas.
8. Agregar constraints de no negatividad y `reserved <= quantity`.
9. Agregar índices para consultas por ubicación, producto y disponibilidad.

La migración no debe ocultar inconsistencias mediante backfill automático.

Implementación:

- `backend/prisma/schema.prisma` agrega `reservedQuantityKg` y `reservedQuantityPieces`, además de índices por ubicación, producto y disponibilidad.
- `backend/prisma/migrations/20260806120000_add_inventory_reservations/migration.sql` agrega columnas con cero inicial, valida datos incompatibles, agrupa compromisos pendientes, aborta ante sobrerreservas y agrega constraints de integridad.
- `backend/src/prisma/inventory-reservations-migration.contract.spec.ts` protege el contrato estructural de la migración.
- El estado local de Prisma quedó sincronizado y el preflight posterior devolvió `PASS`.

### Fase 3: Servicio central de balances

**Estado: IMPLEMENTADA**

Crear un servicio interno, por ejemplo:

```text
backend/src/modules/inventory/inventory-balance.service.ts
```

Responsabilidades:

- Consultar existencia física, reserva y disponible.
- Reservar cantidades en una transacción existente.
- Liberar cantidades reservadas.
- Consumir una reserva durante la confirmación.
- Disminuir existencia no reservada.
- Incrementar existencia física.
- Validar KG y PIECE separadamente.
- Devolver cambios de saldo anterior y nuevo para los movimientos.
- Exigir que el balance exista cuando la operación sea una disminución.
- No permitir reserva parcial.

La firma debe recibir el `Prisma.TransactionClient` para que la operación permanezca dentro de la transacción de negocio.

Implementación:

- `backend/src/modules/inventory/inventory-balance.service.ts` centraliza lectura de existencia física, reserva, disponibilidad, liberación, consumo, decremento no reservado e incremento físico.
- Las operaciones de disminución usan actualizaciones condicionales sobre existencia y reserva para proteger concurrencia y evitar saldos negativos.
- Las respuestas de balance exponen `quantity`, `reservedQuantity` y `availableQuantity` por KG y PIECE.
- `InventoryService`, `InventoryTransfersService`, `SalesService` y `PurchasesService` reutilizan el servicio central en sus operaciones de balance cubiertas por esta fase.
- `backend/src/modules/inventory/inventory-balance.service.spec.ts` cubre lectura, reserva agrupada, insuficiencia sin escrituras parciales, consumo, liberación, pérdida concurrente de reserva e integridad de balance ausente.

### Fase 4: Reserva al crear transferencias

**Estado: IMPLEMENTADA**

Modificar `InventoryTransfersService` y el flujo de ciclos CEDIS.

Proceso recomendado:

1. Validar actor, permisos, ciclo mutable y `expectedVersion`.
2. Derivar origen y destino desde el ciclo.
3. Validar jerarquía y dirección.
4. Validar productos activos y unidades.
5. Normalizar cantidades.
6. Agrupar líneas repetidas por producto.
7. Consultar existencia y reserva actuales del origen.
8. Calcular disponibilidad.
9. Construir todos los `findings` de insuficiencia antes de modificar datos.
10. Si existe cualquier insuficiencia, rechazar la operación completa.
11. Reservar todos los productos.
12. Crear `InventoryTransfer` en `REQUESTED`.
13. Crear `BranchSupplyCycleTransfer`.
14. Crear evento y snapshots requeridos.
15. Incrementar versión del ciclo.
16. Confirmar la transacción.

Crear el registro de transferencia y la reserva en una misma transacción. Si falla una partida, no debe quedar reserva parcial.

La idempotencia debe garantizar:

- Misma clave y mismo payload: devolver la transferencia existente.
- Reintento: no volver a reservar.
- Misma clave y payload distinto: `IDEMPOTENCY_CONFLICT`.
- Error transaccional: no dejar transferencia, vínculo, evento ni reserva incompletos.

Implementación:

- `InventoryTransfersService` normaliza y agrupa partidas repetidas antes de reservar.
- `InventoryBalanceService.reserve` calcula todos los faltantes antes de escribir y reserva las dimensiones KG y PIECE con actualización condicional.
- La creación genérica y la creación desde ciclos CEDIS comparten la misma transacción para reserva, transferencia, vínculo, evento, snapshots y versión.
- Los reintentos idempotentes devuelven la transferencia original; un payload distinto devuelve `IDEMPOTENCY_CONFLICT`.
- La versión del ciclo se actualiza después de crear correctamente la reserva y la transferencia.
- Las pruebas unitarias y E2E cubren reserva, rollback por insuficiencia, agregación, idempotencia, conflicto de payload, snapshots, eventos y versionado.

### Fase 5: Liberación al cancelar

**Estado: IMPLEMENTADA**

Modificar la cancelación de transferencias:

1. Validar que el estado sea `DRAFT`, `REQUESTED` o `IN_TRANSIT`.
2. Obtener las partidas originales.
3. Liberar la reserva del origen.
4. Marcar transferencia como `CANCELLED`.
5. Registrar actor, fecha y motivo.
6. Invalidar la proyección del ciclo.
7. Registrar evento auditable.

No se debe crear un movimiento físico al cancelar una transferencia que nunca fue confirmada.

### Fase 6: Consumo al confirmar

**Estado: IMPLEMENTADA**

Modificar confirmación y recepción de suministros:

1. Validar ciclo mutable y dirección.
2. Verificar que exista reserva igual a la cantidad enviada.
3. Disminuir existencia y reserva del origen en una operación transaccional.
4. Incrementar la existencia física del destino.
5. Crear `TRANSFER_OUT` y `TRANSFER_IN`.
6. En recepción de suministro, acreditar al destino únicamente lo recibido.
7. Registrar faltantes como `SHRINKAGE`.
8. Registrar sobrantes como `IN`.
9. Consumir la reserva correspondiente al envío.
10. Marcar transferencia como `CONFIRMED`.
11. Incrementar la versión del ciclo e invalidar su conciliación.

Si la reserva desapareció o no coincide con la transferencia, devolver `INVENTORY_RESERVATION_INTEGRITY_ERROR`. No reconstruir silenciosamente la reserva.

Implementación:

- `InventoryTransfersService` valida ciclo mutable, dirección, alcance del actor,
  productos activos y estado antes de confirmar o recibir.
- `InventoryBalanceService.consumeReservations` prevalida todas las partidas y
  consume físicamente la existencia y la reserva del origen en actualizaciones
  condicionales dentro de la transacción serializable.
- La confirmación crea exactamente un `TRANSFER_OUT` y un `TRANSFER_IN` por
  partida, conservando los saldos anteriores y posteriores de cada ubicación.
- La recepción de suministro acredita en la sucursal únicamente lo recibido y
  registra faltantes como `SHRINKAGE` y sobrantes como `IN`, ambos con referencia
  a `BranchSupplyReceipt`.
- Las recepciones y confirmaciones idempotentes reproducen el resultado original
  sin duplicar movimientos, reservas, eventos ni versiones.
- La mutación de una transferencia vinculada incrementa la versión del ciclo,
  limpia la reconciliación vigente y registra un evento
  `TRANSFER_STATE_CHANGED`.
- La reconciliación valida las entradas recibidas de cada comprobante y conserva
  los sobrantes documentados como entrega física adicional.
- Las pruebas unitarias cubren confirmación exacta, integridad de reservas,
  recepción exacta, faltantes, sobrantes, idempotencia, movimientos únicos y
  versionado/eventos del ciclo.

### Fase 7: Protección de ventas y ajustes

**Estado: IMPLEMENTADA**

Actualizar los decrementos de:

- `SalesService`.
- `InventoryService`.
- `PurchasesService` cuando cancele compras.
- `DeliveryService` si modifica existencias de rutas.
- Cualquier otro flujo encontrado mediante búsqueda de `inventoryBalance.update`, `updateMany` o `upsert`.

Toda disminución debe validar:

```text
requestedQuantity <= quantity - reservedQuantity
```

Esto aplica a:

- Venta confirmada.
- Ajuste `OUT`.
- Merma.
- Cancelación de compra.
- Diferencia física negativa.
- Descuento de mercancía de ruta cuando el origen tenga reservas.

Las entradas positivas no consumen reservas. Las correcciones negativas deben indicar motivo y referencia.

Implementación:

- Los decrementos de ventas, ajustes/mermas, cancelaciones de compra y
  confirmaciones de traspaso usan `InventoryBalanceService.decreaseAvailable`
  o `consumeReservations` con condiciones atómicas por KG y PIECE.
- `DeliveryService` acredita devoluciones de `ROUTE_STOCK` mediante
  `InventoryBalanceService.increase`, conservando reservas y snapshots de
  saldo anterior/posterior; las ventas de canal `ROUTE` descuentan únicamente
  disponibilidad no reservada.
- El seed operativo también enruta sus decrementos por el servicio central;
  la limpieza de balances y la carga positiva de datos permanecen como
  preparación de datos, no como flujos operativos.
- Las pruebas cubren rechazo por reservas, decrementos exitosos en KG y
  PIECE, snapshots y operaciones sobre `ROUTE_STOCK`.

### Fase 8: Consultas y API

**Estado: IMPLEMENTADA**

Extender las respuestas de balances con:

```json
{
  "quantityKg": 100,
  "reservedQuantityKg": 30,
  "availableQuantityKg": 70,
  "quantityPieces": 50,
  "reservedQuantityPieces": 10,
  "availableQuantityPieces": 40
}
```

Actualizar:

- `GET /api/inventory/balances`.
- `GET /api/products?locationId=...`.
- `GET /api/products/:id?includeBalances=true`.
- `GET /api/cedis/inventory-summary`.
- Detalle de transferencias CEDIS.

El resumen CEDIS debe separar:

- `physicalAtCedis`.
- `reservedAtCedis`.
- `availableToDispatch`.
- `inBranchCustody`.
- `ownedNetworkTotal`.
- `receivedFromSuppliers`.
- `sentToBranches`.
- `returnedFromBranches`.
- `otherNet`.

El campo actual `remaining` debe conservar el significado de saldo físico en CEDIS. No debe representar propiedad total.

Implementación:

- Las respuestas de balances, productos y detalle de transferencias exponen
  existencia física, reservas y disponibilidad por KG y PIECE mediante la
  fórmula `quantity - reservedQuantity`.
- El alcance de lectura conserva la ubicación operativa del actor, permite al
  WAREHOUSE consultar el CEDIS y sus sucursales directas activas, y mantiene el
  filtro de stock bajo basado en disponibilidad.
- El resumen CEDIS separa existencia física, reserva, disponible para despacho,
  custodia de sucursales y propiedad total de la red sin crear stock global.
- El frontend existente muestra los nuevos saldos en el catálogo, inventario
  por ubicación, resumen CEDIS y detalle de transferencias de sucursal.
- Las pruebas enfocadas de productos, balances, transferencias, resumen CEDIS,
  dashboard y páginas frontend cubren los nuevos contratos de lectura.

### Fase 9: Errores operativos

**Estado: IMPLEMENTADA**

Usar `409 Conflict` para falta de disponibilidad o competencia de reserva.

Contrato recomendado:

```json
{
  "success": false,
  "code": "INSUFFICIENT_STOCK",
  "message": "El origen no tiene inventario disponible suficiente.",
  "findings": [
    {
      "productId": "product-1",
      "unit": "KG",
      "requestedKg": 25,
      "onHandKg": 30,
      "reservedKg": 10,
      "availableKg": 20,
      "shortageKg": 5
    }
  ]
}
```

Errores mínimos:

- `INSUFFICIENT_STOCK`.
- `INVENTORY_RESERVATION_INTEGRITY_ERROR`.
- `INVENTORY_CONCURRENCY_CONFLICT`.
- `IDEMPOTENCY_CONFLICT`.
- `LOCATION_NOT_AUTHORIZED`.
- `BRANCH_SUPPLY_CYCLE_DIRECTION_INVALID`.
- `PRODUCT_INACTIVE`.
- `UNIT_MISMATCH`.

El filtro HTTP existente ya permite exponer `findings` de manera segura.

Implementación:

- El sobre HTTP conserva `success`, `message`, `error`, `code`, `statusCode`, `requestId` y `findings` sin filtrar detalles internos.
- `INSUFFICIENT_STOCK`, `INVENTORY_RESERVATION_INTEGRITY_ERROR` e `INVENTORY_CONCURRENCY_CONFLICT` responden `409 Conflict`.
- Los decrementos de ventas, ajustes y cancelaciones de compra devuelven hallazgos de disponibilidad cuando el saldo no alcanza y conflictos estables cuando pierden una carrera.
- Las transferencias y recepciones mapean agotamiento de reintentos serializables a `INVENTORY_CONCURRENCY_CONFLICT`.
- Las direcciones CEDIS-sucursal inválidas conservan `BRANCH_SUPPLY_CYCLE_DIRECTION_INVALID` y el filtro HTTP evita exponer contexto interno.
- Las pruebas cubren el sobre HTTP 409, hallazgos de insuficiencia, conflictos de concurrencia y direcciones inválidas.

### Fase 10: Frontend

**Estado: IMPLEMENTADA**

Actualizar `frontend/src/features/cedis/CedisTransferCommandPanel.tsx`.

Para suministro, consultar balances del CEDIS. Para devolución, consultar balances físicos de la sucursal.

Mostrar por producto:

- Existencia física.
- Comprometido.
- Disponible.
- Unidad.
- Cantidad solicitada.
- Faltante, si existe.
- Estado `Suficiente`, `Insuficiente` o `Sin disponibilidad`.

Comportamiento requerido:

- Deshabilitar productos sin disponibilidad.
- No permitir seleccionar dos veces el mismo producto.
- Validar cantidad solicitada contra disponibilidad.
- Validar KG y PIECE por separado.
- Mostrar el resultado antes de la confirmación.
- Conservar el formulario ante `INSUFFICIENT_STOCK`.
- Refrescar saldos después de un conflicto.
- Mantener la misma clave de idempotencia al reintentar el mismo payload.
- Generar una nueva clave si el usuario cambia cantidades.

Actualizar también:

- `frontend/src/features/cedis/types.ts`.
- `frontend/src/features/cedis/cedisService.ts`.
- `frontend/src/features/cedis/hooks.ts`.
- `frontend/src/features/cedis/CedisBranchDetailPage.tsx`.
- `frontend/src/features/inventario/components/CedisInventorySummaryPanel.tsx`.
- Componentes y servicios de balances.

Etiquetas operativas recomendadas:

- `Existencia física en CEDIS`.
- `Comprometido para despacho`.
- `Disponible para surtir`.
- `Existencia en custodia de sucursales`.
- `Propiedad total de la red CEDIS`.

No utilizar `stock de sucursal` para referirse a propiedad contable.

Implementación:

- `CedisBranchDetailPage` consulta productos con `locationId` del CEDIS para suministros y de la sucursal para devoluciones.
- `CedisTransferCommandPanel` muestra existencia física, comprometido, disponible, unidad, solicitado, faltante y estado `Suficiente`, `Insuficiente` o `Sin disponibilidad` por línea.
- Los productos sin disponibilidad y las partidas repetidas quedan bloqueados; la validación custom conserva mensajes operativos aun cuando exista un límite HTML de cantidad.
- Los conflictos `INSUFFICIENT_STOCK`, `INVENTORY_CONCURRENCY_CONFLICT` e `INVENTORY_RESERVATION_INTEGRITY_ERROR` refrescan productos y resumen CEDIS sin cerrar ni limpiar el formulario.
- El hook de mutación invalida también las consultas de productos para no reutilizar disponibilidad obsoleta después de un suministro o devolución.
- Las pruebas frontend cubren disponibilidad visible, cantidades insuficientes, productos bloqueados, idempotencia e invalidación de productos.

## Pruebas

### Unitarias backend

- Reserva exacta con disponibilidad exacta.
- Reserva insuficiente en KG.
- Reserva insuficiente en PIECE.
- Producto `KG_AND_PIECE` con una dimensión insuficiente.
- Varias líneas del mismo producto agrupadas antes de validar.
- Reserva idempotente.
- Cancelación libera una sola vez.
- Confirmación consume existencia y reserva.
- Recepción exacta conserva saldo correcto.
- Recepción con faltante crea `SHRINKAGE`.
- Recepción con sobrante crea `IN`.
- Venta no consume mercancía reservada.
- Ajuste negativo no consume mercancía reservada.
- Cancelación de compra no deja saldo negativo.
- Fallo en la última partida revierte reservas anteriores.
- Error `INSUFFICIENT_STOCK` incluye `findings`.
- Reserva faltante devuelve error de integridad.

### Concurrencia

- Dos suministros compiten por el mismo saldo.
- Solo uno puede reservar la existencia disponible.
- El segundo recibe `409 Conflict`.
- Nunca queda saldo negativo.
- Nunca queda reserva negativa.
- Nunca queda reserva superior a la existencia.
- Venta y suministro concurrentes no consumen la misma mercancía.
- Dos reintentos con la misma clave generan una sola reserva.
- Dos recepciones concurrentes no duplican movimientos.

### Integración

- Migración sobre base limpia.
- Migración con transferencias pendientes válidas.
- Migración falla ante reservas históricas superiores al saldo.
- Constraints rechazan cantidades reservadas negativas.
- Constraints rechazan reservas superiores a existencia.
- Compra externa solo aumenta CEDIS.
- Sucursal no recibe compra externa.
- Sucursal no recibe transferencia genérica.
- Devolución solo llega al CEDIS padre.

### E2E

Extender `backend/test/cedis-branch-supply-cycle.e2e-spec.ts` con el siguiente escenario:

1. CEDIS inicia con 10 kg.
2. Se registra un suministro de 7 kg.
3. La existencia física del CEDIS sigue en 10 kg.
4. El comprometido del CEDIS queda en 7 kg.
5. El disponible para surtir queda en 3 kg.
6. Un segundo suministro de 4 kg falla con `INSUFFICIENT_STOCK`.
7. La recepción exacta deja 3 kg físicos en CEDIS y 7 kg en sucursal.
8. La reserva del CEDIS queda en cero.
9. La propiedad de la red sigue siendo 10 kg.
10. Una venta de 2 kg deja 5 kg en custodia de la sucursal.
11. Una devolución de 3 kg reserva 3 kg en la sucursal.
12. Una venta adicional de 3 kg falla porque solo quedan 2 kg disponibles.
13. La devolución confirmada deja 6 kg en CEDIS y 2 kg en sucursal.
14. La propiedad total sigue siendo 8 kg después de la venta.
15. Los reintentos no duplican reservas ni movimientos.

### Frontend

- Muestra físico, comprometido y disponible.
- Bloquea cantidades superiores a disponibilidad.
- Maneja `INSUFFICIENT_STOCK` sin cerrar el formulario.
- Refresca disponibilidad después del conflicto.
- Mantiene la clave al reintentar.
- Cambia el origen consultado al alternar suministro y devolución.
- No expone costos a usuarios sin `cedis.view_costs`.
- Mantiene responsive, navegación por teclado y mensajes accesibles.

## Despliegue

Orden recomendado:

1. Aprobar los cambios de specs.
2. Ejecutar el preflight de producción en modo solo lectura.
3. Resolver manualmente las inconsistencias reportadas.
4. Suspender temporalmente creación y confirmación de transferencias.
5. Aplicar la migración.
6. Generar Prisma Client.
7. Desplegar el backend que conoce las reservas.
8. Ejecutar pruebas de humo de compra, suministro, venta y devolución.
9. Desplegar el frontend.
10. Reactivar operaciones.
11. Verificar balances, reservas, transferencias pendientes y propiedad de red.
12. Monitorear conflictos e inconsistencias durante la primera jornada.

No es seguro regresar a un backend anterior después de activar reservas, porque ignoraría `reservedQuantityKg` y `reservedQuantityPieces`. Cualquier rollback debe bloquear operaciones de inventario hasta desplegar una versión compatible.

## Observabilidad

Registrar métricas y eventos para:

- Rechazos `INSUFFICIENT_STOCK` por CEDIS, producto y tipo de operación.
- Conflictos serializables agotados.
- Reservas pendientes por CEDIS.
- Transferencias pendientes antiguas.
- Errores de integridad de reserva.
- Diferencias entre reservas persistidas y transferencias pendientes.
- Cantidad de mercancía en custodia por sucursal.
- Diferencia entre propiedad calculada y conciliación física.

No activar expiración automática de transferencias hasta que negocio defina una política. Las transferencias antiguas deben quedar visibles para cancelación manual y auditable.

## Criterios de Aceptación

- [ ] El CEDIS es el padre válido de sus sucursales directas.
- [ ] Las compras externas aumentan únicamente el CEDIS.
- [ ] Las sucursales conservan existencia física en custodia.
- [ ] La propiedad contable se calcula agregando CEDIS y sucursales hijas.
- [ ] Crear un suministro reserva existencia disponible.
- [ ] Crear una devolución reserva existencia disponible de la sucursal.
- [ ] Una operación insuficiente se rechaza antes de crear una transferencia parcial.
- [ ] La insuficiencia devuelve `INSUFFICIENT_STOCK` con detalle operativo.
- [ ] Cancelar libera la reserva sin crear movimientos físicos.
- [ ] Confirmar consume la reserva y crea movimientos atómicos.
- [ ] Ventas y ajustes negativos respetan reservas.
- [ ] No existe stock global de producto.
- [ ] No existe saldo negativo ni reserva superior a existencia.
- [ ] La concurrencia no permite doble asignación.
- [ ] La idempotencia no duplica transferencias, reservas ni movimientos.
- [ ] La API muestra físico, comprometido y disponible.
- [ ] La UI muestra propiedad, custodia y disponibilidad con etiquetas claras.
- [ ] Las diferencias físicas permanecen visibles y auditables.
- [ ] La migración falla ante inconsistencias históricas no resueltas.
- [ ] Pasan pruebas, typecheck, lint y build de backend y frontend.

## Archivos y Módulos Relacionados

### Specs

- `specs/modules/inventory/spec.md`
- `specs/modules/branch-supply-cycles/spec.md`
- `specs/.specs/02-database/database.md`
- `specs/.specs/03-api/inventory-api.md`
- `specs/.specs/03-api/inventory-transfers-api.md`
- `specs/.specs/03-api/branch-supply-cycles-api.md`
- `specs/.specs/07-workflows/task/action.md`

### Backend

- `backend/prisma/schema.prisma`
- `backend/src/modules/inventory/inventory-balance.service.ts`
- `backend/src/modules/inventory/inventory.service.ts`
- `backend/src/modules/inventory/inventory-transfers.service.ts`
- `backend/src/modules/sales/sales.service.ts`
- `backend/src/modules/purchases/purchases.service.ts`
- `backend/src/modules/delivery/delivery.service.ts`
- `backend/src/modules/cedis/branch-supply-cycles.service.ts`
- `backend/src/modules/cedis/branch-supply-receipts.service.ts`
- `backend/src/modules/cedis/cedis-inventory-summary.query.service.ts`
- `backend/test/cedis-branch-supply-cycle.e2e-spec.ts`

### Frontend

- `frontend/src/features/cedis/CedisTransferCommandPanel.tsx`
- `frontend/src/features/cedis/CedisBranchDetailPage.tsx`
- `frontend/src/features/cedis/cedisService.ts`
- `frontend/src/features/cedis/hooks.ts`
- `frontend/src/features/cedis/types.ts`
- `frontend/src/features/inventario/components/CedisInventorySummaryPanel.tsx`
- `frontend/src/features/inventario/hooks/useProducts.ts`
- `frontend/src/features/inventario/services/productService.ts`

## Validación

Usar los comandos aprobados por el proyecto:

```bash
OPENSSL_CONF=/dev/null pnpm --dir backend run typecheck
OPENSSL_CONF=/dev/null pnpm --dir backend run test -- --runInBand
OPENSSL_CONF=/dev/null pnpm --dir backend run build
pnpm --dir backend run lint:check

pnpm --dir frontend run typecheck
pnpm --dir frontend run test
pnpm --dir frontend run lint
pnpm --dir frontend run build
```

Con PostgreSQL/PostGIS desechable:

```bash
OPENSSL_CONF=/dev/null pnpm --dir backend exec prisma validate --schema prisma/schema.prisma
OPENSSL_CONF=/dev/null pnpm --dir backend run test:e2e -- --runInBand
```

La implementación no debe marcarse como completada hasta que las reglas documentales, la migración, el código, las pruebas y la validación de despliegue estén alineados.
