# Diagrama de estados: CEDIS-sucursal

## Ciclo

```mermaid
stateDiagram-v2
    [*] --> OPEN: abrir
    OPEN --> READY_FOR_REVIEW: refresh elegible
    READY_FOR_REVIEW --> OPEN: nueva transferencia o cambio vinculado
    READY_FOR_REVIEW --> CLOSED: cierre diario CLOSED
    CLOSED --> OPEN: reapertura auditada
    OPEN --> CANCELLED: cancelar ciclo elegible
    READY_FOR_REVIEW --> CANCELLED: cancelar ciclo elegible
    CANCELLED --> [*]
```

- `OPEN` admite suministros, devoluciones y refresh.
- `READY_FOR_REVIEW` exige suministro confirmado, cero pendientes e integridad válida. Una nueva operación permitida lo devuelve a `OPEN`.
- `CLOSED` solo se obtiene al cerrar el `PointOfSaleDailyClose` relacionado.
- `CANCELLED` exige motivo, ausencia de cierre activo y todas las transferencias canceladas.
- `CLOSED` y `CANCELLED` son de solo lectura para operaciones del ciclo.

## Transferencia vinculada

```mermaid
stateDiagram-v2
    [*] --> REQUESTED: crear desde ciclo
    DRAFT --> REQUESTED: solicitar externa
    REQUESTED --> IN_TRANSIT: traslado operativo
    DRAFT --> CONFIRMED: confirmar recepción
    REQUESTED --> CONFIRMED: confirmar recepción
    IN_TRANSIT --> CONFIRMED: confirmar recepción
    DRAFT --> CANCELLED: cancelar con motivo
    REQUESTED --> CANCELLED: cancelar con motivo
    IN_TRANSIT --> CANCELLED: cancelar con motivo
    CONFIRMED --> [*]
    CANCELLED --> [*]
```

`DRAFT`, `REQUESTED` e `IN_TRANSIT` no cambian stock. `CONFIRMED` aplica salida/entrada en una sola transacción y no puede cancelarse. El ciclo no redefine estos estados: observa y protege el traspaso vinculado.

## Cierre relacionado

```text
Daily close DRAFT -> REVIEWED -> CLOSED
Cycle      OPEN  -> READY     -> CLOSED

Reopen: Daily close CLOSED -> DRAFT; Cycle CLOSED -> OPEN
```
