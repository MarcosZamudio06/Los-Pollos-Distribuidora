# Resumen de Arquitectura, Workflows y Roadmap

Este documento resume la arquitectura y las decisiones vigentes del proyecto a partir de `specs/` y `openspec/`. Sirve como mapa de lectura para desarrollo Spec Driven Development y no reemplaza los specs fuente.

## Ruta Rápida

1. Leer `specs/.specs/00-business/PRD.md` y `business-rules.md`.
2. Leer `specs/.specs/01-architecture/ai-rules.md`, `architecture.md` y `folder-structure.md`.
3. Leer `specs/.specs/02-database/database.md` y `entities.md`.
4. Leer el contrato API/UI/testing relacionado con la tarea.
5. Leer el módulo en `specs/modules/<modulo>/spec.md`.
6. Ejecutar el ciclo de `specs/.specs/07-workflows/task.md`.

## Fuente de Verdad

| Tema | Decisión |
| --- | --- |
| Specs canónicos | `specs/.specs/` y `specs/modules/` |
| OpenSpec | `openspec/` guarda cambios SDD activos e históricos |
| Regla central | Specs primero, código después, validación siempre |
| Lenguaje de código | TypeScript; no JavaScript para aplicación |
| Implementación | Solo lo explícitamente definido en specs |
| Conflictos | Detenerse y reportar antes de programar |

Reglas críticas:

- No inventar arquitectura, endpoints, entidades, permisos, pantallas ni reglas.
- No crear carpetas fuera de la estructura aprobada.
- No cambiar entidades sin actualizar specs de base de datos.
- No crear endpoints fuera de `specs/.specs/03-api/`.
- No omitir validaciones, manejo de errores ni pruebas críticas.
- No subir `.env` ni hardcodear secretos.

## Objetivo del Producto

Sistema empresarial para una distribuidora de pollos con control de ventas, inventario por ubicación, compras, clientes mayoristas, rutas de reparto, cuentas por cobrar, comprobantes internos, caja y reportes operativos casi en tiempo real.

El objetivo operativo es reducir errores manuales, evitar ventas sin stock, dar trazabilidad a inventario, ventas, crédito, reparto y cobranza, y entregar información confiable para decisiones diarias.

## Alcance del MVP

Incluye:

- Login, usuarios, roles y RBAC.
- Catálogo de productos y categorías.
- Inventario por ubicación operativa.
- Productos vendidos por kilo, pieza o ambas unidades.
- Equivalencias kilo-pieza persistidas y trazables.
- Ventas POS de contado y crédito.
- Descuento de inventario por ubicación.
- Clientes minoristas y mayoristas.
- Condiciones comerciales, límite de crédito, días de crédito y bloqueo.
- Cuentas por cobrar con pagos parciales o totales.
- Compras y proveedores.
- Traspasos entre ubicaciones.
- Rutas de reparto, evidencia, incidencias, cobros en ruta y liquidación.
- Dashboard y reportes operativos casi en tiempo real con latencia máxima esperada de 60 segundos.
- Ticket o comprobante interno sin validez fiscal.
- Docker para ejecución local y despliegue.

Fuera del MVP:

- CFDI real, SAT, timbrado, PAC, UUID fiscal y cancelación fiscal.
- Pagos en línea.
- Contabilidad completa.
- Nómina.
- Conciliación bancaria automática.
- Optimización automática de rutas.
- Integraciones con básculas, lectores o hardware especializado.
- Planeación avanzada de demanda.

## Stack Técnico

| Capa | Stack |
| --- | --- |
| Frontend | React, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS |
| Backend | NestJS, TypeScript, Prisma, PostgreSQL |
| Seguridad | JWT, refresh tokens, RBAC, bcrypt o Argon2 |
| Validación | Class Validator en backend |
| Documentación API | Swagger según specs |
| Infraestructura | Docker, Docker Compose, PostgreSQL, Nginx |

## Arquitectura General

El proyecto usa monorepo con workspaces separados:

```text
frontend/
backend/
shared/
docker/
docs/
scripts/
specs/
openspec/
```

Notas estructurales:

- `shared/` solo debe contener contratos reales compartidos cuando existan.
- Backend sigue arquitectura modular por característica.
- Frontend sigue organización por features.
- La lógica crítica de negocio vive en backend, no en componentes React.
- APIs REST usan prefijo `/api`.

Formato de respuesta API esperado:

```json
{
  "success": true,
  "message": "Operación realizada correctamente",
  "data": {}
}
```

Formato de error esperado:

```json
{
  "success": false,
  "message": "Descripción del error",
  "error": "ERROR_CODE",
  "statusCode": 400
}
```

## Dominios y Módulos

| Dominio | Responsabilidad |
| --- | --- |
| Auth | Login, refresh, logout, usuario actual |
| Usuarios | Usuarios, roles, permisos |
| Inventario | Productos, categorías, saldos, movimientos, ajustes |
| Ubicaciones | Sucursales/almacenes como ubicaciones operativas |
| Traspasos | Transferencias entre ubicaciones |
| Equivalencias | Conversión kilo-pieza por producto |
| Ventas/POS | Ventas contado/crédito, cancelación, ticket interno |
| Clientes | Minoristas, mayoristas, crédito y condiciones |
| Cobranza | Cuentas por cobrar y pagos |
| Compras | Proveedores, entradas de mercancía |
| Rutas | Reparto, evidencia, cobros, incidencias |
| Liquidación | Cierre operativo de rutas |
| Facturación | Comprobante interno MVP, no CFDI |
| Reportes | Dashboard, ventas, inventario, cobranza, reparto |
| Configuración | Parámetros operativos administrables |

Roles principales:

- `ADMIN`: acceso completo.
- `SELLER`: POS, ventas propias y clientes permitidos.
- `WAREHOUSE`: inventario, compras, ajustes, movimientos y traspasos.
- `DRIVER`: rutas propias, pedidos asignados, evidencia, incidencias y cobros permitidos.
- `COLLECTIONS`: cuentas por cobrar, pagos, saldos, cobros en ruta y liquidaciones autorizadas.

## Modelo de Datos

Motor: PostgreSQL. ORM: Prisma.

Entidades principales:

- `User`
- `Role`
- `OperationalLocation`
- `Product`
- `ProductUnitEquivalent`
- `InventoryBalance`
- `Category`
- `Customer`
- `Supplier`
- `Sale`
- `SaleItem`
- `Purchase`
- `PurchaseItem`
- `InventoryMovement`
- `InventoryTransfer`
- `InventoryTransferItem`
- `AccountReceivable`
- `Payment`
- `CommercialPolicy`
- `OperationalConfig`
- `DeliveryRoute`
- `DeliveryOrder`
- `DeliveryEvidence`
- `RouteSettlement`
- `Invoice`

Decisiones estructurales cerradas:

- El inventario operativo se controla por `OperationalLocation`, no por stock global en `Product`.
- `Sale`, `Purchase`, `InventoryMovement` e `InventoryTransfer` deben conservar ubicación operativa.
- Toda venta a crédito genera `AccountReceivable`.
- Todo pago del MVP requiere `Payment.accountReceivableId` y aplica a una sola cuenta por cobrar.
- `PaymentAllocation` queda fuera del MVP.
- Los traspasos son dominio propio con encabezado, detalle, origen, destino, estado y movimientos trazables.
- Las equivalencias kilo-pieza deben persistirse y auditarse.
- `Invoice` representa ticket interno, no CFDI.
- Operaciones críticas deben ejecutarse en transacción.

## Áreas API

| Área | Specs |
| --- | --- |
| Convenciones | `specs/.specs/03-api/api-conventions.md` |
| Auth | `auth-api.md` |
| Inventario | `inventory-api.md` |
| Ubicaciones | `locations-api.md` |
| Equivalencias | `product-equivalences-api.md` |
| Traspasos | `inventory-transfers-api.md` |
| Clientes | `customers-api.md` |
| Cuentas por cobrar | `accounts-receivable-api.md` |
| Políticas comerciales | `commercial-policies-api.md` |
| Configuración operativa | `operational-config-api.md` |
| Ventas | `sales-api.md` |
| Compras | `purchases-api.md` |
| Reparto | `delivery-api.md` |
| Liquidaciones | `route-settlements-api.md` |
| Reportes | `reports-api.md` |

Reglas API importantes:

- `Payment.accountReceivableId` es obligatorio en MVP.
- No existe `PaymentAllocation` activo en MVP.
- `routeSettlementId` es condicional en cobros/rutas: aparece cuando ya existe asociación con liquidación.
- Ticket interno no debe exponerse como factura fiscal.
- Reportes casi en tiempo real deben exponer metadatos de frescura definidos por contrato.

## Áreas UI

Superficies del MVP:

- Administración web.
- POS web tipo escritorio.
- Almacén web tipo escritorio.
- Experiencia móvil para choferes/repartidores.

Specs UI:

- `layout.md`
- `ui-guidelines.md`
- `dashboard.md`
- `inventory.md`
- `customers.md`
- `accounts-receivable.md`
- `sales-pos.md`
- `purchases.md`
- `routes-delivery.md`
- `reports.md`

Estados obligatorios para pantallas remotas:

- Loading.
- Error.
- Empty.
- Success.
- Unauthorized.

Componentes base esperados:

- `Button`
- `Input`
- `Select`
- `Modal`
- `Dialog`
- `Table`
- `Badge`
- `Card`
- `Alert`
- `Loading`
- `ErrorState`
- `EmptyState`
- `UnauthorizedState`
- `ConfirmDialog`
- `LocationSelector`
- `MoneyAmount`
- `QuantityInput`
- `StatusBadge`

## Testing

OpenSpec configura TDD estricto.

Capas definidas:

| Capa | Estado / Herramienta |
| --- | --- |
| Backend unit | Jest |
| Backend integration | Nest testing + Supertest |
| Backend E2E | Jest + Supertest |
| Coverage | `npm --prefix backend run test:cov` |
| Frontend tests | Esperado por specs, runner no configurado aún |
| E2E browser | Esperado por specs, Playwright no configurado aún |

Regresiones que no deben romperse:

- No volver a stock global.
- No permitir stock negativo por ubicación.
- Venta descuenta inventario por ubicación.
- Compra incrementa inventario por ubicación.
- Traspaso genera salida y entrada trazables.
- Venta a crédito genera cuenta por cobrar.
- Pago requiere `accountReceivableId`.
- Ticket interno no se presenta como CFDI.
- Reportes distinguen contado, crédito, cobranza, ruta e inventario por ubicación.
- Reportes casi en tiempo real se prueban con tiempo controlado y metadatos de frescura, no con esperas reales.

## Deployment y Entorno

Servicios Docker esperados:

- `frontend`
- `backend`
- `postgres`
- `nginx`

Puertos sugeridos:

- Frontend: `3000`
- Backend: `4000`
- PostgreSQL: `5432`
- Nginx: `80/443`

Ambientes:

- `development`
- `staging`
- `production`

Reglas de entorno:

- `.env` no debe subirse a Git.
- `.env.example` debe mantenerse actualizado.
- Los secretos productivos deben ser distintos a desarrollo.
- Las migraciones deben ejecutarse antes de iniciar backend en producción.
- PostgreSQL debe usar volumen persistente.

## Workflow SDD

Ciclo obligatorio por tarea:

1. Leer `task.md`.
2. Leer specs relacionados.
3. Confirmar dependencias.
4. Identificar archivos a crear o modificar.
5. Implementar solo el alcance de la tarea.
6. Ejecutar validaciones posibles.
7. Ejecutar pruebas si existen.
8. Reportar resultado.
9. Recomendar siguiente tarea.

Definition of Ready:

- Objetivo claro.
- Specs relacionados.
- Dependencias completadas.
- Sin contradicción arquitectónica.
- Alcance pequeño y verificable.
- Sin decisiones de negocio pendientes para esa tarea.

Definition of Done:

- Compila.
- Sin errores TypeScript.
- Respeta estructura.
- Respeta permisos.
- Respeta rutas API.
- Respeta reglas de negocio.
- Incluye validaciones.
- Incluye manejo de errores.
- Incluye pruebas cuando aplica.
- No rompe tareas anteriores.
- Documenta cambios relevantes.

## Roadmap Maestro

| Fase | Enfoque | Tareas clave |
| --- | --- | --- |
| 0 | Preparación | TASK-000 a TASK-004 |
| 1 | Base de datos | TASK-010 a TASK-013 |
| 2 | Seguridad y usuarios | TASK-020 a TASK-023 |
| 3 | Inventario | TASK-030 a TASK-036 |
| 4 | Clientes y cobranza | TASK-040 a TASK-044 |
| 5 | Ventas/POS | TASK-050 a TASK-055 |
| 6 | Compras | TASK-060 a TASK-062 |
| 7 | Rutas y reparto | TASK-070 a TASK-073 |
| 8 | Facturación básica | TASK-080 |
| 9 | Reportes | TASK-090 a TASK-092 |
| 10 | Calidad y despliegue | TASK-100 a TASK-105 |

Prioridad mínima funcional del MVP:

1. Autenticación.
2. Usuarios y roles.
3. Productos.
4. Ubicaciones operativas.
5. Inventario por ubicación.
6. Clientes y condiciones comerciales.
7. Cuentas por cobrar y cobranza.
8. Ventas POS de contado y crédito.
9. Cancelación de ventas.
10. Ticket interno.
11. Compras.
12. Rutas, evidencia, cobros y liquidación.
13. Reportes casi en tiempo real.
14. Docker.

## OpenSpec: initial-monorepo-structure

Cambio estructural para establecer la base inicial del monorepo sin implementar lógica de negocio.

Artefactos:

- `openspec/changes/initial-monorepo-structure/exploration.md`
- `openspec/changes/initial-monorepo-structure/proposal.md`
- `openspec/changes/initial-monorepo-structure/specs/monorepo-foundation/spec.md`
- `openspec/changes/initial-monorepo-structure/design.md`
- `openspec/changes/initial-monorepo-structure/tasks.md`
- `openspec/changes/initial-monorepo-structure/apply-progress.md`

Alcance:

- Crear base monorepo documentada.
- Mantener `frontend/` y `backend/`.
- Agregar scripts raíz de orquestación.
- Documentar comandos y workflow specs-first.
- Reorganizar bootstrap frontend hacia `frontend/src/app/`.
- Mantener backend como bootstrap Nest sin controllers ni endpoints starter.
- No crear módulos, DTOs, entidades, guards, Prisma schema ni workflows.

Estado del cambio:

- Tasks completadas: 15/15.
- Tests escritos: 3.
- Tests pasando: 3/3.
- Siguiente fase SDD natural: `sdd-verify`.

## Decisiones Cerradas

- Inventario por ubicación operativa es estructural.
- No existe stock global como fuente de verdad operativa.
- Toda venta, compra, ajuste, movimiento y traspaso debe conservar ubicación.
- Toda venta a crédito genera cuenta por cobrar.
- Todo pago del MVP aplica a una sola cuenta por cobrar.
- `PaymentAllocation` queda fuera del MVP.
- Traspasos son entidad propia.
- Equivalencias kilo-pieza deben persistirse y auditarse.
- Ticket interno es el único comprobante del MVP.
- SAT/CFDI/timbrado/PAC quedan fuera del MVP.
- Los reportes operativos deben reflejar operaciones confirmadas con latencia máxima esperada de 60 segundos.
- Specs Markdown son fuente de verdad.
- OpenSpec confirma rutas canónicas `specs/.specs/` y `specs/modules/`.
- `initial-monorepo-structure` solo permite scaffold estructural, sin lógica de negocio.

## Decisiones Abiertas y Riesgos

Decisiones abiertas:

- Modelo final sucursal-almacén: jerarquía, ubicaciones independientes o modelo mixto.
- Regla exacta para decidir ubicación de descuento en ventas.
- Equivalencias oficiales kilo-pieza por producto y responsable de modificarlas.
- Política exacta de redondeo para kilos, piezas, equivalencias, subtotales, saldos y pagos.
- Tolerancias de merma, diferencia de peso, devolución y rechazo parcial.
- Requisito offline de la experiencia móvil de choferes.
- Combinación obligatoria de evidencia de entrega.
- Profundidad de preparación fiscal futura sin implementar CFDI.
- Alcance exacto de políticas comerciales por cliente, tipo, ubicación o combinación.
- Alcance exacto de configuración operativa global, por ubicación o por rol.

Riesgos:

- Implementar reglas finales donde el negocio aún no decidió.
- Reintroducir stock global.
- Presentar ticket interno como factura fiscal.
- Crear endpoints o pantallas fuera de specs.
- Validar reportes casi en tiempo real con esperas reales en lugar de tiempo controlado.
- Frontend aún no tiene runner de tests configurado aunque los specs esperan Vitest/Testing Library.
- No existe Prisma schema, configuración de base de datos ni Playwright en el código actual según `openspec/config.yaml`.

## Comandos Documentados

Testing y calidad:

```bash
npm --prefix backend test
npm --prefix backend run test:e2e
npm --prefix backend run test:cov
npm --prefix frontend run lint && npm --prefix backend run lint
npm --prefix frontend run build && npm --prefix backend run build
npm --prefix backend run format
```

Docker:

```bash
docker compose up -d
docker compose down
docker compose logs -f backend
docker compose exec backend npx prisma migrate deploy
```

Comandos validados en `initial-monorepo-structure`:

```bash
npm --prefix backend test
npm --prefix backend run test:e2e
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix backend run lint
npm --prefix backend run build
```

No usar para verificación SDD:

```bash
npm test
```

El script raíz `npm test` es placeholder y no debe ser la fuente de verificación SDD.
