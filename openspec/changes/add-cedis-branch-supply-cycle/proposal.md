# Proposal: Ciclo diario de suministro CEDIS-sucursal

## Intent

Documentar un agregado `BranchSupplyCycle` para coordinar la jornada diaria entre un CEDIS y una sucursal. El agregado debe vincular varios `InventoryTransfer` de suministro, varias devoluciones y el `PointOfSaleDailyClose` de la sucursal sin crear inventario paralelo ni reemplazar la lógica existente de cierre.

## Scope

### In Scope

- Modelo, estados, invariantes, fórmulas y relaciones Prisma.
- Contratos API, permisos, migración no destructiva y estrategia de backfill.
- Integración documentada con inventario, ubicaciones, cierre diario, reportes, dashboard y navegación.
- Criterios de aceptación, pruebas y orden futuro de implementación.

### Out of Scope

- Implementación del flujo completo de `BranchSupplyCycle` fuera de la protección de ubicaciones ya aprobada.
- Saldos, movimientos, conteos, diferencias o fórmulas monetarias duplicadas.
- CFDI, básculas, liquidación de rutas o `PaymentAllocation`.

## Capabilities

### New Capabilities

- `branch-supply-cycles`: Coordina el suministro diario CEDIS-sucursal y su relación con traspasos y cierre diario.

### Modified Capabilities

- None. Las extensiones futuras de inventario, cierre diario, reportes y UI se especifican como integraciones requeridas por la nueva capacidad, sin modificar todavía sus specs principales.

## Approach

Mantener `OperationalLocation`, `InventoryTransfer`, `InventoryMovement` y `PointOfSaleDailyClose` como fuentes de verdad. Agregar únicamente el agregado coordinador y una entidad de vínculo ciclo-traspaso. La confirmación de traspasos seguirá pasando por `InventoryTransfersService`; el cierre seguirá siendo responsabilidad exclusiva de `PointOfSaleDailyCloseService`.

## Affected Areas

| Área | Impacto futuro | Decisión documental |
|---|---|---|
| Prisma | Extendida | Nuevo agregado, vínculos y FK opcional al cierre. |
| Inventario/ubicaciones | Extendida | Validación de dirección, alcance y bloqueo de desactivación. |
| Cierre diario | Extendida | Asociación, invalidación y finalización coordinada. |
| Reportes/dashboard | Extendida | Lecturas derivadas y filtradas por rol. |
| Frontend | Nueva + extendida | Pantallas CEDIS; reutilización de componentes actuales. |

## Risks

- Inferir relaciones históricas de ciclo desde `parentId` puede asociar datos incorrectamente; la jerarquía aprobada sí identifica la sucursal directa de un CEDIS para consultas de ubicación.
- Confirmar un traspaso sin invalidar la validación del cierre puede producir conciliaciones obsoletas.
- Contabilizar una devolución además de `TRANSFER_OUT` duplicaría la salida.

## Rollback Plan

Desplegar primero únicamente la estructura nullable y permisos. Si la implementación futura falla, detener nuevas asociaciones, conservar los ciclos creados como historial y revertir solo columnas/tablas nuevas después de exportar dependencias; nunca borrar ni revertir automáticamente movimientos existentes.

## Dependencies

- Specs canónicos de inventario, ubicaciones, traspasos, cierre diario y reportes.
- PostgreSQL/Prisma y guards de autenticación/RBAC existentes.
- Resolución operativa explícita del mapa sucursal → CEDIS antes del backfill.

## Success Criteria

- [ ] La capacidad define un ciclo único por sucursal y fecha, con múltiples suministros, devoluciones y un cierre diario.
- [ ] Las fórmulas usan exclusivamente traspasos/movimientos y no crean stock paralelo.
- [ ] Cada integración identifica qué componente actual se reutiliza y qué se extiende.
- [ ] Esta fase modifica solo documentación dentro de este cambio OpenSpec.
