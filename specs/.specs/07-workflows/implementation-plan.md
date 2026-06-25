# Plan de Implementación

## Regla de inicio

Ninguna fase de implementación puede iniciar si contradice estos canones transversales:

- `SaleDocument` separado de `BillingRequest`.
- `ROUTE_STOCK` obligatorio para inventario de ruta.
- `Payment` como única fuente monetaria.
- `Payment.accountReceivableId` obligatorio en cobranza, no en contado inmediato.
- `paymentType` clasifica solo contado vs crédito.
- `paymentMethod` pertenece a `Payment`; `CashMovement` usa su propia clasificación operativa de caja.
- Cancelación financiera auditable antes de cancelar venta ya cobrada.
- Idempotencia en ventas, pagos, traspasos, cancelaciones, cierres POS y liquidaciones.
- Reapertura/versionado de `PointOfSaleDailyClose` y `RouteSettlement`.
- Módulos deprecated fuera de planificación nueva.

## Fase 0 — Canonización y gobierno documental

Objetivo:

Cerrar el drift documental antes de escribir código.

Tareas:

- Consolidar `SaleDocument` como dominio único para ticket, nota sencilla, nota grande e `INTERNAL_RECEIPT`.
- Consolidar `BillingRequest` como relación administrativa separada.
- Retirar aliases deprecated del roadmap activo (`facturacion`, `inventario`, `ventas`, `routes`, `reportes`, `rutas-reparto`).
- Alinear `AGENTS.md`, `FILE_INDEX.md`, arquitectura, base de datos, API, UI y testing.
- Formalizar reglas transversales de idempotencia, versionado y reapertura auditable.
- Formalizar semántica separada de `paymentType`, `collectionStatus`, `agingStatus`, `Customer.creditStatus` y `CashMovement`.

Resultado:

Corpus documental coherente y apto para implementación.

## Fase 1 — Base del proyecto

Objetivo:

Crear el monorepo y los cimientos técnicos comunes.

Tareas:

- Crear `frontend/`, `backend/`, `shared/`, `docker/`, `docs/`, `scripts/`.
- Configurar React + Vite + TypeScript en frontend.
- Configurar NestJS + TypeScript + Prisma en backend.
- Configurar PostgreSQL, Docker Compose, linting, formatting y build.
- Preparar autenticación JWT, refresh tokens y RBAC base.

Resultado:

Repositorio ejecutable localmente con estructura canónica.

## Fase 2 — Catálogos operativos y ubicaciones

Objetivo:

Habilitar entidades base del negocio antes de mover inventario o vender.

Tareas:

- Ubicaciones operativas (`BRANCH`, `WAREHOUSE`, `MIXED`, `EXTERNAL_POINT_OF_SALE`, `ROUTE_STOCK`).
- Productos, categorías y equivalencias kilo/pieza.
- Usuarios, roles y permisos.
- Parámetros operativos mínimos y políticas comerciales base.

Resultado:

Catálogos listos para operar inventario, venta, crédito y rutas.

## Fase 3 — Inventario y traspasos

Objetivo:

Controlar existencias por ubicación sin stock global.

Tareas:

- Saldos y movimientos por `OperationalLocation`.
- Ajustes, mermas y diferencias con trazabilidad.
- `InventoryTransfer` con estados `DRAFT`, `REQUESTED`, `IN_TRANSIT`, `CONFIRMED`, `CANCELLED`.
- Idempotencia en creación, confirmación y cancelación de traspasos.
- Carga de ruta hacia `ROUTE_STOCK` y devolución de sobrante desde `ROUTE_STOCK`.
- Validación explícita de no doble decremento entre carga y venta en ruta.

Resultado:

Inventario por ubicación y logística de traspasos trazable.

## Fase 4 — Clientes, crédito, cuentas por cobrar y pagos

Objetivo:

Separar identidad del cliente, estado administrativo, saldo y cobranza.

Tareas:

- CRUD de clientes y resumen de crédito.
- Políticas comerciales, límites y días de crédito.
- `AccountReceivable` para todo saldo pendiente.
- `Payment` como única fuente monetaria.
- Pago inmediato de contado ligado a venta sin `AccountReceivable` artificial.
- Pago de cobranza con `Payment.accountReceivableId` obligatorio.
- `paymentType` limitado a `CASH_SALE` / `CREDIT_SALE`.
- Cancelación de pagos con auditoría e idempotencia.

Resultado:

Modelo financiero base coherente para contado, crédito y cobranza.

## Fase 5 — Ventas POS y documentos de venta

Objetivo:

Confirmar ventas con inventario, cobro y libreta documental consistentes.

Tareas:

- Crear venta y detalle con validación de stock por ubicación.
- Soportar contado, crédito y abono inicial en una sola transacción.
- Registrar `SaleDocument` canónico (`SCALE_TICKET`, `SIMPLE_NOTE`, `LARGE_NOTE`, `INTERNAL_RECEIPT`).
- Registrar `BillingRequest` por separado cuando exista solicitud administrativa.
- Cancelación de venta con reversa auditable de inventario y dinero.
- Idempotencia en creación y cancelación de venta.

Resultado:

POS funcional sin mezclar documento operativo con solicitud administrativa.

## Fase 6 — Compras y abastecimiento

Objetivo:

Registrar entradas controladas hacia inventario operativo.

Tareas:

- Proveedores y compras.
- Confirmación de entradas por ubicación.
- Cancelación con reversa auditable cuando proceda.
- Trazabilidad de costo y equivalencia aplicada.

Resultado:

Entradas de inventario controladas y conciliables.

## Fase 7 — Rutas, reparto y liquidación

Objetivo:

Operar reparto con inventario de ruta, cobranza y conciliación final.

Tareas:

- `DeliveryRoute` con `ROUTE_STOCK` 1:1.
- Pedidos de ruta, estados de entrega e incidencias.
- Evidencia de entrega según política vigente.
- Cobros en ruta solo sobre saldo pendiente autorizado.
- `RouteSettlement` con apertura/cálculo, cierre y reapertura auditada.
- Control de versión e idempotencia en liquidación.
- Resolución explícita de diferencias físicas antes del cierre final o paso a revisión.

Resultado:

Ruta conciliable en inventario, entrega y cobranza.

## Fase 8 — Cierre diario de punto de venta

Objetivo:

Conciliar operación diaria de puntos fijos sin mezclarla con liquidación de ruta.

Tareas:

- Crear cierre por ubicación y fecha de negocio.
- Conciliar entradas, ventas, pagos, gastos, faltantes y sobrantes.
- Mantener `CashMovement` como clasificación operativa de caja sin competir con `Payment`.
- Revisar, cerrar, cancelar y reabrir con control de versión.
- Persistir actor, fecha, motivo e idempotencia en transiciones críticas.

Resultado:

Corte diario auditable y separado del dominio de reparto.

## Fase 9 — Reportes operativos

Objetivo:

Exponer métricas casi en tiempo real sin inventar fuentes paralelas.

Tareas:

- Dashboard.
- Ventas por canal y por documento.
- Inventario por ubicación.
- Cartera, mora y cobranza.
- Solicitudes administrativas separadas de documentos operativos.
- Rutas, liquidaciones y cierres POS.

Resultado:

Reportes consistentes con el canon operativo y financiero.

## Fase 10 — QA, seguridad y salida a operación

Objetivo:

Validar que la implementación respeta todos los invariantes antes del despliegue.

Tareas:

- Pruebas de transacción, idempotencia y concurrencia en dinero, inventario, cierres y liquidaciones.
- Revisión de permisos y alcance por rol.
- Validación de cancelaciones auditables.
- Build, lint, pruebas backend/frontend y documentación final.

Resultado:

Versión lista para despliegue inicial con riesgo controlado.
