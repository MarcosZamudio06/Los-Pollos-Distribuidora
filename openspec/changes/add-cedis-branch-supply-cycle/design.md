# Design: Módulo backend CEDIS

## Technical Approach

Crear `CedisModule` como orquestador de ciclos. `BranchSupplyCyclesService` deriva origen/destino desde el ciclo, valida alcance/estado/unidades y delega las reglas de transferencia a `InventoryTransfersService`. Prisma ya contiene los modelos de ciclo, vínculos, snapshots y eventos; la implementación debe completar las diferencias indicadas en migración.

## Architecture Decisions

| Decisión                                            | Alternativa                  | Razón                                                                            |
| --------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| Controller `cedis/branch-supply-cycles`             | Prefijo raíz anterior        | Agrupa la capacidad bajo el permiso y dominio CEDIS acordados.                   |
| Crear transferencias `REQUESTED`                    | Confirmar al capturar        | La recepción física es una decisión separada y auditable.                        |
| Confirmar/cancelar con endpoints de inventario      | Duplicar comandos CEDIS      | Mantiene una sola autoridad sobre saldos, movimientos y estado del traspaso.     |
| Núcleo de transferencias acepta `TransactionClient` | Transacciones anidadas       | Permite transferencia, vínculo, evento y versión dentro de una sola transacción. |
| Snapshots append-only reconstruibles                | Totales como fuente de stock | Conserva auditoría sin competir con `InventoryBalance`/`InventoryMovement`.      |
| Sin reserva de pendientes                           | Descontar al solicitar       | El servicio actual descuenta al confirmar; agregar reservas sería otro agregado. |

## Data Flow

```text
POST supply/return
  -> BranchSupplyCyclesService (lock/version/scope)
  -> InventoryTransfersService.create(tx) [REQUESTED]
  -> BranchSupplyCycleTransfer + event + version

POST inventory-transfers/:id/confirm
  -> InventoryTransfersService (linked-cycle guard)
  -> conditional balance decrement + TRANSFER_OUT/TRANSFER_IN
  -> cycle OPEN/invalidation + version/event

POST refresh
  -> linked transfer items + movements
  -> integrity/totals/source hash
  -> append-only items/event + latest header projection

POST close/reopen
  -> PointOfSaleDailyCloseService transaction helpers
  -> daily close and cycle status/version transition
  -> append-only snapshots/events without reversing operations
```

## Transaction Boundaries

- Abrir: ubicaciones, unicidad, ciclo y evento en `Serializable`.
- Suministro/devolución: ciclo bloqueado o CAS por versión, transferencia, vínculo, evento y versión en la misma transacción.
- Confirmar: ciclo/transferencia validables, decremento condicional, ambos movimientos, estado e invalidación del ciclo en la misma transacción.
- Cancelar: estado, motivo, actor e invalidación del ciclo en la misma transacción.
- Refresh: lectura consistente de fuentes, snapshot, evento, totales y estado en la misma transacción.
- Cierre/reapertura: el servicio CEDIS reutiliza helpers del cierre diario dentro de su transacción `Serializable`; cualquier error revierte ambos agregados.

Los conflictos `P2034` se reintentan de forma limitada con la misma clave. Índices únicos resuelven carreras de apertura y vínculo; `expectedVersion` resuelve escritores concurrentes.

## File Changes

| Archivo                                                                              | Acción                                                                               |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `backend/src/modules/cedis/**`                                                       | Crear módulo, controller, service, DTOs y pruebas.                                   |
| `backend/src/modules/inventory/inventory-transfers.service.ts`                       | Extraer operaciones reutilizables con `TransactionClient` y validar ciclo vinculado. |
| `backend/src/modules/inventory/inventory-transfers.controller.ts`                    | Exigir idempotencia y conservar contratos de confirmación/cancelación.               |
| `backend/src/modules/point-of-sale-daily-close/point-of-sale-daily-close.service.ts` | Exponer helpers transaccionales de cierre y reapertura coordinados.                  |
| `backend/src/app.module.ts`                                                          | Registrar `CedisModule`.                                                             |
| `backend/prisma/schema.prisma`                                                       | Alinear unicidad activa y eventos de cambio de transferencia.                        |
| `backend/prisma/migrations/*cedis_cycle_alignment*/migration.sql`                    | Aplicar cambios no destructivos de constraints/enums.                                |

## Units and Equivalences

KG y PIECE se suman por separado. `KG_AND_PIECE` acepta cantidades medidas en una o ambas dimensiones. Una dimensión solo se deriva con equivalencia activa aplicable; mientras el redondeo siga abierto, la conversión automática responde `EQUIVALENCE_ROUNDING_POLICY_UNDEFINED`. El snapshot preserva equivalencia/factor cuando corresponda.

## Testing Strategy

Jest unitario cubre estados, dirección, unidades e idempotencia. Contratos Supertest cubren rutas, permisos y errores. Pruebas con PostgreSQL cubren carreras de apertura, versión, vínculo único y confirmaciones contra el mismo stock. E2E cubre ciclo → suministro/devolución → confirmación → refresh y conserva snapshots append-only.

## Open Questions

- [ ] Definir política exacta de redondeo antes de habilitar conversiones kilo-pieza.
