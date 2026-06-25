# Guía operativa de etapas y tareas del proyecto

Este documento resume el `task.md` y el plan de implementación en una forma más fácil de seguir para una persona junior o para un agente que no deba reconstruir el contexto desde cero.

## Objetivo general

Avanzar el proyecto por **etapas pequeñas, verificables y dependientes de specs**, sin inventar arquitectura, rutas, entidades ni reglas de negocio.

La regla base sigue siendo:

**Specs primero. Código después. Validación siempre.**

---

## Cómo leer esta guía

Cada etapa responde a estas preguntas:

| Pregunta | Respuesta esperada |
|----------|--------------------|
| ¿Qué se busca lograr? | El propósito técnico y de negocio de la etapa. |
| ¿Qué tasks incluye? | Las tareas concretas que se deben ejecutar. |
| ¿Qué debe funcionar al final? | El punto mínimo de estabilidad para pasar a la siguiente etapa. |

Si una task depende de otra, **no se avanza** hasta que la dependencia esté terminada y validada.

---

## Etapa 0 — Canonización y gobierno documental

### Propósito

Cerrar contradicciones documentales antes de escribir o ajustar código.

### Tasks incluidas

- Consolidar `SaleDocument` como dominio único para ticket, nota sencilla, nota grande e `INTERNAL_RECEIPT`.
- Consolidar `BillingRequest` como relación administrativa separada.
- Retirar aliases deprecated del roadmap activo.
- Alinear `AGENTS.md`, `FILE_INDEX.md`, arquitectura, base de datos, API, UI y testing.
- Formalizar reglas transversales de idempotencia, versionado y reapertura auditable.
- Formalizar la semántica de `paymentType`, `collectionStatus`, `agingStatus`, `Customer.creditStatus` y `CashMovement`.

### Qué debe funcionar al final

- La documentación no contradice el canon del negocio.
- Las tareas futuras tienen un mapa claro de dependencias.
- El roadmap queda listo para implementación sin ambigüedad principal.

---

## Etapa 1 — Base del proyecto

### Propósito

Preparar el monorepo y los cimientos técnicos comunes para frontend, backend y despliegue local.

### Tasks incluidas

- Crear la estructura base: `frontend/`, `backend/`, `shared/`, `docker/`, `docs/`, `scripts/`.
- Configurar React + Vite + TypeScript en frontend.
- Configurar NestJS + TypeScript + Prisma en backend.
- Configurar PostgreSQL, Docker Compose, linting, formatting y build.
- Preparar autenticación JWT, refresh tokens y RBAC base.

### Qué debe funcionar al final

- El proyecto se puede levantar localmente.
- La estructura del repo coincide con la arquitectura aprobada.
- Existe una base técnica lista para módulos de negocio.

---

## Etapa 2 — Catálogos operativos y ubicaciones

### Propósito

Definir las entidades base del negocio antes de mover inventario o vender.

### Tasks incluidas

- Ubicaciones operativas: `BRANCH`, `WAREHOUSE`, `MIXED`, `EXTERNAL_POINT_OF_SALE`, `ROUTE_STOCK`.
- Productos, categorías y equivalencias kilo/pieza.
- Usuarios, roles y permisos.
- Parámetros operativos mínimos y políticas comerciales base.

### Qué debe funcionar al final

- Ya existen catálogos suficientes para operar inventario, venta, crédito y rutas.
- Las ubicaciones están bien definidas y sirven como fuente operativa real.

---

## Etapa 3 — Inventario y traspasos

### Propósito

Controlar existencias por ubicación sin volver al inventario global.

### Tasks incluidas

- Saldos y movimientos por `OperationalLocation`.
- Ajustes, mermas y diferencias con trazabilidad.
- `InventoryTransfer` con estados de ciclo de vida claros.
- Idempotencia en creación, confirmación y cancelación de traspasos.
- Carga de ruta hacia `ROUTE_STOCK` y devolución de sobrante desde `ROUTE_STOCK`.
- Validación explícita contra doble decremento entre carga y venta en ruta.

### Qué debe funcionar al final

- Cada ubicación maneja su propio inventario.
- Los traspasos son auditables y reversibles.
- La ruta puede operar sin romper el saldo real del stock.

---

## Etapa 4 — Clientes, crédito, cuentas por cobrar y pagos

### Propósito

Separar identidad del cliente, estado administrativo, saldo y cobranza.

### Tasks incluidas

- CRUD de clientes y resumen de crédito.
- Políticas comerciales, límites y días de crédito.
- `AccountReceivable` para todo saldo pendiente.
- `Payment` como única fuente monetaria.
- Pago inmediato de contado ligado a venta sin crear `AccountReceivable` artificial.
- Pago de cobranza con `Payment.accountReceivableId` obligatorio.
- `paymentType` limitado a `CASH_SALE` / `CREDIT_SALE`.
- Cancelación de pagos con auditoría e idempotencia.

### Qué debe funcionar al final

- El dinero queda trazado sin ambigüedad.
- Contado y crédito conviven sin mezclar modelos.
- La cobranza se puede explicar con una cuenta por cobrar real.

---

## Etapa 5 — Ventas POS y documentos de venta

### Propósito

Confirmar ventas con inventario, cobro y documentos internos coherentes.

### Tasks incluidas

- Crear venta y detalle con validación de stock por ubicación.
- Soportar contado, crédito y abono inicial en una sola transacción.
- Registrar `SaleDocument` canónico.
- Registrar `BillingRequest` por separado cuando exista solicitud administrativa.
- Cancelación de venta con reversa auditable de inventario y dinero.
- Idempotencia en creación y cancelación de venta.

### Qué debe funcionar al final

- El POS vende sin romper inventario.
- Los documentos operativos no se mezclan con solicitudes administrativas.
- Cancelar una venta revierte sus efectos de forma consistente.

---

## Etapa 6 — Compras y abastecimiento

### Propósito

Registrar entradas controladas hacia inventario operativo.

### Tasks incluidas

- Proveedores y compras.
- Confirmación de entradas por ubicación.
- Cancelación con reversa auditable cuando proceda.
- Trazabilidad de costo y equivalencia aplicada.

### Qué debe funcionar al final

- Las entradas de inventario quedan conciliables.
- El costo se puede rastrear con coherencia.

---

## Etapa 7 — Rutas, reparto y liquidación

### Propósito

Operar reparto con inventario de ruta, cobranza y conciliación final.

### Tasks incluidas

- `DeliveryRoute` con `ROUTE_STOCK` 1:1.
- Pedidos de ruta, estados de entrega e incidencias.
- Evidencia de entrega según política vigente.
- Cobros en ruta solo sobre saldo pendiente autorizado.
- `RouteSettlement` con apertura, cálculo, cierre y reapertura auditada.
- Control de versión e idempotencia en liquidación.
- Resolución explícita de diferencias físicas antes del cierre final o paso a revisión.

### Qué debe funcionar al final

- La ruta se puede conciliar de principio a fin.
- Entrega, cobranza e inventario de ruta quedan alineados.

---

## Etapa 8 — Cierre diario de punto de venta

### Propósito

Conciliar la operación diaria de puntos fijos sin mezclarla con la liquidación de ruta.

### Tasks incluidas

- Crear cierre por ubicación y fecha de negocio.
- Conciliar entradas, ventas, pagos, gastos, faltantes y sobrantes.
- Mantener `CashMovement` como clasificación operativa de caja.
- Revisar, cerrar, cancelar y reabrir con control de versión.
- Persistir actor, fecha, motivo e idempotencia en transiciones críticas.

### Qué debe funcionar al final

- El corte diario es auditable.
- Caja y pagos no se confunden.
- Los cierres pueden corregirse con trazabilidad.

---

## Etapa 9 — Reportes operativos

### Propósito

Exponer métricas útiles sin crear fuentes paralelas de verdad.

### Tasks incluidas

- Dashboard.
- Ventas por canal y por documento.
- Inventario por ubicación.
- Cartera, mora y cobranza.
- Solicitudes administrativas separadas de documentos operativos.
- Rutas, liquidaciones y cierres POS.

### Qué debe funcionar al final

- Los reportes reflejan el estado real del negocio.
- No existen métricas “inventadas” fuera del modelo oficial.

---

## Etapa 10 — QA, seguridad y salida a operación

### Propósito

Validar que todo respeta los invariantes antes de desplegar.

### Tasks incluidas

- Pruebas de transacción, idempotencia y concurrencia en dinero, inventario, cierres y liquidaciones.
- Revisión de permisos y alcance por rol.
- Validación de cancelaciones auditables.
- Build, lint, pruebas backend/frontend y documentación final.

### Qué debe funcionar al final

- La versión está lista para operación inicial.
- Los riesgos están controlados por pruebas y validaciones.

---

## Regla práctica para ejecutar cualquier task

Antes de tocar código o specs secundarios, confirma siempre:

1. Qué etapa corresponde.
2. Qué depende de esa etapa.
3. Qué debe quedar funcionando al terminar.
4. Qué validación prueba que la task sí quedó bien.

Si una tarea no puede explicar su propósito y su criterio mínimo de funcionamiento, todavía no está lista para ejecutarse.

---

## Resumen rápido para juniors

- **Etapa 0**: ordenar documentos y reglas.
- **Etapa 1**: levantar la base técnica.
- **Etapa 2**: crear catálogos y ubicaciones.
- **Etapa 3**: controlar inventario y traspasos.
- **Etapa 4**: clientes, crédito y pagos.
- **Etapa 5**: ventas POS y documentos.
- **Etapa 6**: compras y abastecimiento.
- **Etapa 7**: rutas y liquidación.
- **Etapa 8**: cierres diarios.
- **Etapa 9**: reportes.
- **Etapa 10**: QA final y salida a operación.

