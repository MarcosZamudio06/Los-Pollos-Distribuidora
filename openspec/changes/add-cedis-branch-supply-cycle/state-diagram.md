# Diagrama de estados: CEDIS-sucursal

## Ciclo

```mermaid
stateDiagram-v2
    [*] --> ACTIVE: crear
    ACTIVE --> COMPLETED: cierre diario CLOSED
    COMPLETED --> ACTIVE: reapertura auditada
    ACTIVE --> CANCELLED: cancelar con motivo
    CANCELLED --> [*]
```

Reglas:

- `ACTIVE` admite vínculos y comandos mientras el cierre relacionado sea inexistente o `DRAFT`.
- `COMPLETED` exige suministro confirmado, cero transferencias pendientes, integridad válida y cierre `REVIEWED` con versión vigente.
- `CANCELLED` es final.
- `COMPLETED` no tiene endpoint propio: se obtiene dentro de `PointOfSaleDailyCloseService.close`.

## Traspaso vinculado

```mermaid
stateDiagram-v2
    [*] --> DRAFT: crear vínculo o traspaso
    DRAFT --> REQUESTED: solicitar
    REQUESTED --> IN_TRANSIT: salida operativa
    IN_TRANSIT --> CONFIRMED: confirmar recepción
    DRAFT --> CANCELLED: cancelar
    REQUESTED --> CANCELLED: cancelar
    CONFIRMED --> [*]
    CANCELLED --> [*]
```

Un traspaso `CONFIRMED` es terminal en el MVP: no se cancela ni se revierte desde el ciclo. Una corrección posterior usa el dominio de inventario autorizado.

## Cierre diario relacionado

```text
DRAFT -> REVIEWED -> CLOSED
  |                  |
  +-> CANCELLED      +-> DRAFT (reapertura ADMIN)
```

El ciclo no redefine estas transiciones. Solo añade precondiciones de suministro/integridad y sincroniza `ACTIVE`/`COMPLETED` dentro de la misma transacción.
