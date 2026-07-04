# task.md — Spec Driven Development Orchestrator

Proyecto: Sistema Web para Distribuidora de Pollos  
Modo de trabajo: Spec Driven Development  
Stack oficial: React + Vite + TypeScript, NestJS + TypeScript, Prisma, PostgreSQL, Docker  
Orquestador sugerido: OpenCode + Gentleman AI

---

## 1. Propósito

Este archivo define la lista maestra de tareas para desarrollar el sistema mediante agentes de IA sin perder consistencia técnica ni de negocio.

La regla central es:

```text
Specs primero.
Código después.
Validación siempre.
```

El objetivo no es que el agente genere todo el proyecto en una sola ejecución. El objetivo es avanzar por tareas pequeñas, verificables y alineadas con los specs.

---

## 2. Rol del orquestador

Actúa como **Spec Driven Development Orchestrator**.

Tu responsabilidad es coordinar el desarrollo completo del proyecto leyendo specs, dividiendo el trabajo en tareas, implementando únicamente lo definido, validando cada entrega y deteniéndote cuando exista una contradicción.

No debes inventar arquitectura, rutas, modelos, permisos, pantallas ni reglas de negocio.

---

## 3. Fuente de verdad

Antes de implementar cualquier tarea, debes leer `task.md` y únicamente los archivos listados en el bloque `Specs requeridos` de esa TASK.

La lista de specs de cada TASK es cerrada:

- No agregar specs “por si acaso”.
- No leer módulos completos si la TASK solo necesita API, UI o base de datos.
- No leer aliases deprecated si existe spec canónico.
- Si falta un spec requerido, la TASK queda `BLOCKED`.
- Si un spec requerido contradice otro spec requerido de la misma TASK, la TASK queda `BLOCKED` y debe reportarse la contradicción.

Cada TASK incluye una sección `Relación resultado esperado ↔ specs` para explicar por qué cada spec es indispensable para producir el entregable esperado sin ampliar contexto innecesariamente.

## 3.1 Módulos canónicos y aliases deprecated

Usa únicamente estos nombres canónicos para planear e implementar:

| Dominio | Spec canónico | Estado de aliases |
|---------|----------------|-------------------|
| Inventory | `specs/modules/inventory/spec.md` | `specs/modules/inventario/spec.md` deprecated |
| Sales | `specs/modules/sales/spec.md` | `specs/modules/ventas/spec.md` deprecated |
| Sales Documents | `specs/modules/sales-documents/spec.md` | `specs/modules/facturacion/spec.md` deprecated para ticket/comprobante interno |
| Billing Requests | `specs/modules/billing-requests/spec.md` | `specs/modules/facturacion/spec.md` deprecated para solicitud administrativa |
| Reports | `specs/modules/reports/spec.md` | `specs/modules/reportes/spec.md` deprecated |
| Routes / Delivery | `specs/modules/routes-delivery/spec.md` | `specs/modules/routes/spec.md` y `specs/modules/rutas-reparto/spec.md` deprecated |

Si una tarea apunta a un alias deprecated, debes redirigir la lectura al spec canónico antes de continuar.

---

## 4. Reglas obligatorias para agentes

- Usar TypeScript en frontend y backend.
- No usar JavaScript para archivos de aplicación.
- No usar `any` salvo justificación documentada.
- No crear carpetas fuera de la arquitectura definida.
- No crear endpoints que no estén en specs.
- No crear endpoints para ubicaciones, traspasos, cobranza, configuración, políticas comerciales, evidencia o liquidación hasta que existan specs API específicos.
- No modificar modelos sin actualizar specs y migraciones.
- No volver al modelo antiguo de stock global por producto; el inventario operativo debe manejarse por ubicación.
- No hardcodear secretos, tokens, contraseñas ni URLs productivas.
- No guardar archivos `.env` reales en el repositorio.
- No poner lógica crítica de negocio en componentes React.
- No acceder a base de datos directamente desde controllers.
- No omitir validaciones de DTOs en backend.
- No omitir manejo de errores.
- No generar todo el proyecto en una sola respuesta.
- No avanzar si una dependencia está incompleta.
- No implementar SAT, CFDI real, timbrado, PAC ni catálogos fiscales dentro del MVP.

---

## 5. Estructura objetivo

La estructura general del proyecto debe ser:

```text
pollo-distribucion/
  specs/.specs/
  specs/modules/
  frontend/
  backend/
  shared/
  docker/
  docs/
  scripts/
  .gitignore
  docker-compose.yml
  package.json
  README.md
```

No crear carpetas alternativas como `client/`, `server/`, `api/`, `web/`, `app-backend/` o `app-frontend/` sin actualizar primero los specs.

---

## 6. Ciclo obligatorio por tarea

Cada tarea debe ejecutarse con este ciclo:

```text
1. Leer task.md.
2. Leer únicamente los specs del bloque `Specs requeridos` de la TASK.
3. Confirmar dependencias.
4. Identificar archivos a crear o modificar.
5. Implementar únicamente el alcance de la tarea.
6. Ejecutar validaciones posibles.
7. Ejecutar pruebas si existen.
8. Reportar resultado.
9. Recomendar siguiente tarea.
```

---

## 7. Formato obligatorio de reporte

Al terminar cada tarea, responder así:

```text
TASK-ID:
Estado: COMPLETED / PARTIAL / BLOCKED / NEEDS_REVIEW

Specs leídos:
- archivo.md

Archivos creados:
- ruta/archivo.ts: propósito

Archivos modificados:
- ruta/archivo.ts: cambio realizado

Validaciones implementadas:
- validación

Pruebas:
- prueba o comando ejecutado
- resultado

Comandos ejecutados:
- comando
- resultado

Riesgos o pendientes:
- pendiente

Siguiente tarea recomendada:
- TASK-XXX
```

---

## 8. Estados permitidos

```text
PENDING
IN_PROGRESS
COMPLETED
BLOCKED
NEEDS_REVIEW
```

Definición:

- `PENDING`: no iniciada.
- `IN_PROGRESS`: en desarrollo.
- `COMPLETED`: terminada y validada.
- `BLOCKED`: detenida por conflicto, dependencia o información crítica faltante.
- `NEEDS_REVIEW`: requiere revisión antes de continuar.

---

## 9. Definition of Ready

Una tarea está lista para iniciar cuando:

- Tiene objetivo claro.
- Tiene specs relacionados.
- Tiene dependencias completadas.
- No contradice arquitectura.
- No contradice el canon de documentos de venta (`SaleDocument` vs `BillingRequest`).
- No contradice el canon de inventario de rutas con `ROUTE_STOCK`.
- No contradice el canon financiero donde `Payment` es la única fuente monetaria.
- Tiene alcance pequeño y verificable.
- No requiere decisiones de negocio no definidas.

---

## 10. Definition of Done

Una tarea está completa cuando:

- El código compila.
- No hay errores TypeScript.
- Respeta estructura de carpetas.
- Respeta permisos.
- Respeta rutas API.
- Respeta reglas de negocio.
- Incluye validaciones.
- Incluye manejo de errores.
- Incluye pruebas cuando aplica.
- Incluye pruebas de transacción, idempotencia o concurrencia cuando el caso modifica dinero, inventario, cierres o liquidaciones.
- No rompe tareas anteriores.
- Documenta cambios relevantes.

---

## 10.1 Prerrequisitos transversales del roadmap

Antes de continuar con fases de implementación, el roadmap debe asumir resueltos estos canones transversales:

- `SaleDocument` separado de `BillingRequest`.
- `ROUTE_STOCK` como ubicación obligatoria para inventario de ruta.
- `Payment` como única fuente monetaria.
- Cancelación financiera con reversa/reembolso o reapertura auditable.
- Idempotencia para ventas, pagos, cancelaciones, cierres POS y liquidaciones.
- Reapertura/versionado de `PointOfSaleDailyClose` y `RouteSettlement`.

Ninguna tarea de implementación que contradiga estos canones está lista para iniciar.

---

# 10.2 Fase 0.1 — Canonización obligatoria antes de implementar


### TASK-005 — Canonizar inventario de rutas con `ROUTE_STOCK`

Estado inicial: `COMPLETED`

Specs requeridos:

```text
specs/modules/routes-delivery/spec.md
specs/modules/inventory/spec.md
specs/modules/sales/spec.md
specs/.specs/02-database/database.md
specs/.specs/02-database/entities.md
specs/.specs/03-api/delivery-api.md
specs/.specs/03-api/inventory-transfers-api.md
```

Relación resultado esperado ↔ specs:

- `routes-delivery/spec.md` define `DeliveryRoute` 1:1 con `ROUTE_STOCK` y las reglas de carga, devolución, incidencias y liquidación.
- `inventory/spec.md`, `database.md` y `entities.md` fijan `OperationalLocation`, `InventoryTransfer`, movimientos y saldos por ubicación.
- `sales/spec.md` vincula venta de canal `ROUTE` con descuento exclusivo desde `ROUTE_STOCK` y evita doble decremento.
- `delivery-api.md` e `inventory-transfers-api.md` alinean los contratos donde la ruta crea/usa `ROUTE_STOCK` y donde se cargan o devuelven productos.

Debe dejar resuelto:

- `DeliveryRoute 1:1 OperationalLocation(type=ROUTE_STOCK)`.
- Carga y devolución de ruta mediante `InventoryTransfer`.
- Venta de canal `ROUTE` descontando solo desde `ROUTE_STOCK`.
- Prohibición explícita de doble decremento.

### TASK-006 — Canonizar ventas, pagos, cuentas por cobrar y cancelaciones

Estado inicial: `COMPLETED`

Specs requeridos:

```text
specs/modules/sales/spec.md
specs/modules/accounts-receivable/spec.md
specs/modules/clientes/spec.md
specs/.specs/02-database/database.md
specs/.specs/02-database/entities.md
specs/.specs/03-api/sales-api.md
specs/.specs/03-api/accounts-receivable-api.md
```

Relación resultado esperado ↔ specs:

- `sales/spec.md` define contado, crédito, abono inicial, cancelación e idempotencia de ventas.
- `accounts-receivable/spec.md` y `accounts-receivable-api.md` fijan `Payment` como fuente monetaria y pago MVP aplicado a una sola cuenta.
- `clientes/spec.md` gobierna crédito, mora, límite y bloqueo del cliente.
- `database.md`, `entities.md` y `sales-api.md` sostienen la separación entre venta, pago, saldo y cancelación auditable.

Debe dejar resuelto:

- `Payment` como única fuente monetaria.
- Separación entre `collectionStatus`, `agingStatus` y `Customer.creditStatus`.
- AR por todo saldo pendiente.
- Cancelación financiera con reversa o reapertura auditable.
- Idempotencia en operaciones críticas.

### TASK-007 — Consolidar roadmap, módulos y gobierno documental

Estado inicial: `IN_PROGRESS`

Specs requeridos:

```text
specs/FILE_INDEX.md
specs/.specs/01-architecture/folder-structure.md
specs/.specs/01-architecture/ai-rules.md
specs/.specs/05-testing/testing-strategy.md
specs/.specs/07-workflows/implementation-plan.md
specs/.specs/07-workflows/task.md
```

Relación resultado esperado ↔ specs:

- `FILE_INDEX.md` identifica specs activos y aliases deprecated que deben quedar alineados.
- `folder-structure.md` y `ai-rules.md` definen nombres canónicos, gobierno documental y prohibición de planear con aliases deprecated.
- `testing-strategy.md` conserva pruebas transversales para los canones de inventario, dinero, documentos y rutas.
- `implementation-plan.md` y `task.md` son los artefactos del roadmap que deben quedar coherentes antes de implementar.

Debe dejar resuelto:

- Roadmap alineado con canones transversales.
- FILE_INDEX regenerado.
- Módulos duplicados marcados como deprecated.
- Testing transversal actualizado.

---

# 11. Roadmap maestro de tareas

## Fase 0 — Preparación del repositorio

### TASK-000 — Verificar specs base

Estado inicial: `COMPLETED`

Objetivo:

Validar que existan los specs mínimos antes de iniciar desarrollo.

Specs requeridos:

```text
specs/README.md
specs/FILE_INDEX.md
specs/.specs/00-business/PRD.md
specs/.specs/00-business/business-rules.md
specs/.specs/01-architecture/architecture.md
specs/.specs/01-architecture/folder-structure.md
specs/.specs/01-architecture/coding-standards.md
specs/.specs/01-architecture/ai-rules.md
specs/.specs/02-database/database.md
specs/.specs/03-api/api-conventions.md
specs/.specs/04-ui/ui-guidelines.md
specs/.specs/05-testing/testing-strategy.md
specs/.specs/06-deployment/deployment.md
```

Relación resultado esperado ↔ specs:

- `specs/README.md` y `FILE_INDEX.md` permiten comprobar el inventario documental activo.
- Los specs de negocio, arquitectura, base de datos, API, UI, testing y despliegue son el mínimo para declarar que el corpus base existe.
- El resultado esperado es solo reporte documental; por eso no requiere specs de módulos específicos ni modificación de código.

Entregables:

- Lista de specs encontrados.
- Lista de specs faltantes.
- Reporte de inconsistencias.

Restricción:

No crear código en esta tarea.

---

### TASK-001 — Crear estructura base del monorepo

Estado inicial: `COMPLETED`

Depende de:

- TASK-000

Specs requeridos:

```text
specs/.specs/01-architecture/folder-structure.md
specs/.specs/01-architecture/architecture.md
specs/.specs/01-architecture/tech-stack.md
specs/.specs/06-deployment/docker.md
```

Relación resultado esperado ↔ specs:

- `folder-structure.md` define exactamente las carpetas raíz permitidas.
- `architecture.md` y `tech-stack.md` justifican monorepo, frontend, backend, shared, docker, docs y scripts.
- `docker.md` es necesario porque la tarea crea base de estructura Docker sin implementar servicios de negocio.

Objetivo:

Crear la estructura base del repositorio.

Crear:

```text
frontend/
backend/
shared/
docker/
docs/
scripts/
README.md
.gitignore
package.json
docker-compose.yml
```

Restricciones:

- No implementar lógica de negocio.
- No crear endpoints.
- No crear modelos.
- No crear carpetas fuera del spec.

Validación:

La estructura debe coincidir con `folder-structure.md`.

---

### TASK-002 — Inicializar frontend

Estado inicial: `COMPLETED`

Depende de:

- TASK-001

Specs requeridos:

```text
specs/.specs/01-architecture/architecture.md
specs/.specs/01-architecture/folder-structure.md
specs/.specs/01-architecture/tech-stack.md
specs/.specs/01-architecture/coding-standards.md
```

Relación resultado esperado ↔ specs:

- `architecture.md` y `tech-stack.md` fijan React, Vite, TypeScript, Router, Query y Tailwind.
- `folder-structure.md` define las carpetas `frontend/src/*` permitidas.
- `coding-standards.md` gobierna TypeScript, hooks, servicios, componentes y validación básica sin lógica crítica de negocio.

Objetivo:

Inicializar frontend con React, Vite y TypeScript.

Crear estructura:

```text
frontend/src/app/
frontend/src/components/
frontend/src/features/
frontend/src/hooks/
frontend/src/lib/
frontend/src/services/
frontend/src/types/
frontend/src/utils/
frontend/src/styles/
```

Configurar:

- React.
- Vite.
- TypeScript.
- React Router.
- TanStack Query.
- Tailwind CSS.
- Cliente HTTP base.

Validación:

```bash
cd frontend
npm run build
```

---

### TASK-003 — Inicializar backend

Estado inicial: `COMPLETED`

Depende de:

- TASK-001

Specs requeridos:

```text
specs/.specs/01-architecture/architecture.md
specs/.specs/01-architecture/folder-structure.md
specs/.specs/01-architecture/tech-stack.md
specs/.specs/01-architecture/coding-standards.md
specs/.specs/02-database/prisma-guidelines.md
```

Relación resultado esperado ↔ specs:

- `architecture.md` y `tech-stack.md` fijan NestJS, TypeScript, Prisma, PostgreSQL, JWT y Swagger.
- `folder-structure.md` define `backend/src/*`, `backend/prisma/` y `backend/test/`.
- `coding-standards.md` y `prisma-guidelines.md` gobiernan módulos, services, DTOs y base Prisma sin modelos de negocio todavía.

Objetivo:

Inicializar backend con NestJS y TypeScript.

Crear estructura:

```text
backend/src/common/
backend/src/config/
backend/src/database/
backend/src/modules/
backend/prisma/
backend/test/
```

Configurar:

- NestJS.
- Prisma.
- PostgreSQL client.
- Class Validator.
- JWT.
- Bcrypt o Argon2.
- Swagger.
- ConfigModule.

Validación:

```bash
cd backend
npm run build
```

---

### TASK-004 — Configurar Docker local

Estado inicial: `COMPLETED`

Depende de:

- TASK-002
- TASK-003

Specs requeridos:

```text
specs/.specs/06-deployment/deployment.md
specs/.specs/06-deployment/docker.md
specs/.specs/06-deployment/env-vars.md
specs/.specs/01-architecture/tech-stack.md
```

Relación resultado esperado ↔ specs:

- `docker.md` define servicios, Dockerfiles y composición local.
- `deployment.md` define el modo de ejecución esperado.
- `env-vars.md` evita secretos reales y alinea `.env.example` con backend, frontend y Postgres.
- `tech-stack.md` confirma versiones y componentes que deben levantarse en contenedores.

Objetivo:

Configurar ejecución local con Docker.

Servicios:

- postgres.
- backend.
- frontend.

Entregables:

```text
docker-compose.yml
docker/backend/Dockerfile
docker/frontend/Dockerfile
.env.example
```

Validación:

```bash
docker compose up -d
docker compose ps
```

---

## Fase 1 — Base de datos

### TASK-010 — Crear schema Prisma inicial

Estado inicial: `COMPLETED`

Depende de:

- TASK-003

Specs requeridos:

```text
specs/.specs/02-database/database.md
specs/.specs/02-database/entities.md
specs/.specs/02-database/prisma-guidelines.md
```

Relación resultado esperado ↔ specs:

- `database.md` define entidades principales, relaciones e invariantes estructurales del modelo.
- `entities.md` detalla validaciones por entidad como stock por ubicación, pagos y documentos internos.
- `prisma-guidelines.md` gobierna cómo expresar el modelo en Prisma y validar el schema.

Objetivo:

Crear `schema.prisma` con las entidades del sistema.

Modelos mínimos:

- Role.
- User.
- OperationalLocation.
- Product.
- Category.
- ProductUnitEquivalent.
- InventoryBalance.
- Customer.
- Supplier.
- Sale.
- SaleItem.
- Purchase.
- PurchaseItem.
- InventoryMovement.
- InventoryTransfer.
- InventoryTransferItem.
- AccountReceivable.
- Payment.
- CommercialPolicy.
- OperationalConfig.
- DeliveryRoute.
- DeliveryOrder.
- DeliveryEvidence.
- RouteSettlement.

Reglas estructurales:

- No usar `Product.stock` como fuente de verdad de inventario.
- Toda operación de inventario debe conservar ubicación operativa.
- Para el MVP, `Payment.accountReceivableId` es requerido en pagos de cobranza: cada pago aplica a una sola cuenta por cobrar.
- Un pago inmediato de contado debe conservar trazabilidad contra `Sale` sin crear una cuenta por cobrar artificial.
- `PaymentAllocation` queda fuera del flujo oficial del MVP y solo puede agregarse en fase posterior si se actualizan specs.
- `SaleDocument(documentType=INTERNAL_RECEIPT)` representa ticket o comprobante interno; no crear entidades SAT/CFDI.

Validación:

```bash
cd backend
npx prisma validate
```

---

### TASK-011 — Crear migración inicial

Estado inicial: `COMPLETED`

Depende de:

- TASK-010

Specs requeridos:

```text
specs/.specs/02-database/database.md
specs/.specs/02-database/entities.md
specs/.specs/02-database/prisma-guidelines.md
```

Relación resultado esperado ↔ specs:

- `database.md` y `entities.md` permiten verificar que la migración representa el schema canónico ya creado.
- `prisma-guidelines.md` define el uso correcto de migraciones Prisma y validación sin alterar reglas de negocio.

Objetivo:

Crear primera migración de base de datos.

Validación:

```bash
cd backend
npx prisma migrate dev
```

---

### TASK-012 — Crear seed inicial

Estado inicial: `COMPLETED`

Depende de:

- TASK-011

Specs requeridos:

```text
specs/.specs/02-database/database.md
specs/.specs/02-database/entities.md
specs/.specs/02-database/prisma-guidelines.md
specs/.specs/06-deployment/env-vars.md
```

Relación resultado esperado ↔ specs:

- `database.md` y `entities.md` definen roles, usuario inicial, ubicación, categorías y productos semilla válidos.
- `prisma-guidelines.md` gobierna ejecución segura del seed con Prisma.
- `env-vars.md` obliga a que la contraseña inicial provenga de variable o quede marcada como desarrollo.

Objetivo:

Crear datos iniciales.

Seed obligatorio:

- Roles: ADMIN, SELLER, WAREHOUSE, DRIVER, COLLECTIONS.
- Usuario administrador inicial.
- Ubicación operativa inicial de desarrollo.
- Categorías base.
- Productos de ejemplo.

Reglas:

- La contraseña inicial debe venir de variable de entorno o estar claramente marcada como desarrollo.
- No usar credenciales productivas.

---

### TASK-013 — Crear PrismaModule

Estado inicial: `PENDING`

Depende de:

- TASK-010

Specs requeridos:

```text
specs/.specs/01-architecture/folder-structure.md
specs/.specs/01-architecture/coding-standards.md
specs/.specs/02-database/prisma-guidelines.md
```

Relación resultado esperado ↔ specs:

- `folder-structure.md` ubica `backend/src/database/` como capa de acceso común.
- `coding-standards.md` evita acceso directo a BD desde controllers y fija services como capa de negocio.
- `prisma-guidelines.md` define centralización de Prisma sin múltiples instancias.

Objetivo:

Crear módulo de conexión a Prisma.

Entregables:

```text
backend/src/database/prisma.module.ts
backend/src/database/prisma.service.ts
```

Reglas:

- No crear múltiples instancias de Prisma.
- Centralizar conexión a base de datos.

---

## Fase 2 — Seguridad, autenticación y usuarios

### TASK-020 — Implementar Auth backend

Estado inicial: `COMPLETED`

Depende de:

- TASK-012
- TASK-013

Specs requeridos:

```text
specs/modules/auth/spec.md
specs/.specs/03-api/auth-api.md
specs/.specs/03-api/api-conventions.md
specs/.specs/02-database/entities.md
```

Relación resultado esperado ↔ specs:

- `auth/spec.md` define login, refresh, logout, me, usuario activo y no exponer `passwordHash`.
- `auth-api.md` fija contratos exactos de los cuatro endpoints.
- `api-conventions.md` define formato de respuesta, errores, JWT y reglas transversales de API.
- `entities.md` aporta las restricciones de `User` y `Role` necesarias para autenticación.

Endpoints:

- POST /api/auth/login
- POST /api/auth/refresh
- POST /api/auth/logout
- GET /api/auth/me

Validaciones:

- Email requerido.
- Password requerido.
- Usuario activo.
- Contraseña válida.
- Token válido.
- No devolver passwordHash.

Pruebas mínimas:

- Login correcto.
- Login incorrecto.
- Usuario inactivo.
- Me sin token.

---

### TASK-021 — Implementar guards, decorators y RBAC

Estado inicial: `COMPLETED`

Depende de:

- TASK-020

Specs requeridos:

```text
specs/modules/auth/spec.md
specs/modules/usuarios/spec.md
specs/.specs/03-api/api-conventions.md
specs/.specs/01-architecture/coding-standards.md
```

Relación resultado esperado ↔ specs:

- `auth/spec.md` define protección JWT y validación de roles.
- `usuarios/spec.md` define roles y restricciones de usuarios activos.
- `api-conventions.md` exige Bearer token y RBAC en endpoints protegidos.
- `coding-standards.md` fija guards, decorators y separación controller/service.

Objetivo:

Implementar protección por JWT y roles.

Entregables:

```text
backend/src/common/guards/jwt-auth.guard.ts
backend/src/common/guards/roles.guard.ts
backend/src/common/decorators/current-user.decorator.ts
backend/src/common/decorators/roles.decorator.ts
```

Validación:

- Endpoint protegido rechaza usuario sin token.
- Endpoint restringido rechaza rol incorrecto.

---

### TASK-022 — Implementar Users backend

Estado inicial: `COMPLETED`

Depende de:

- TASK-021

Specs requeridos:

```text
specs/modules/usuarios/spec.md
specs/.specs/03-api/api-conventions.md
specs/.specs/02-database/entities.md
```

Relación resultado esperado ↔ specs:

- `usuarios/spec.md` define CRUD, cambio de password, soft delete, email único y permisos ADMIN.
- `api-conventions.md` aporta formato de respuesta, errores y autenticación para endpoints protegidos.
- `entities.md` aporta validaciones de `User` y `Role` como fuente del modelo persistente.

Endpoints:

- GET /api/users
- GET /api/users/:id
- POST /api/users
- PATCH /api/users/:id
- PATCH /api/users/:id/password
- DELETE /api/users/:id

Reglas:

- Solo ADMIN.
- Email único.
- No devolver passwordHash.
- No eliminar físicamente.

---

### TASK-023 — Implementar Auth frontend

Estado inicial: `COMPLETED`

Depende de:

- TASK-020
- TASK-021

Specs requeridos:

```text
specs/modules/auth/spec.md
specs/.specs/03-api/auth-api.md
specs/.specs/04-ui/ui-guidelines.md
specs/.specs/01-architecture/folder-structure.md
```

Relación resultado esperado ↔ specs:

- `auth/spec.md` define login, sesión, roles, rutas protegidas y 403.
- `auth-api.md` define los contratos que consume el cliente HTTP de autenticación.
- `ui-guidelines.md` gobierna estados, layout y manejo visual de autorización.
- `folder-structure.md` ubica `features/auth`, router y providers sin crear carpetas alternativas.

Objetivo:

Crear login, sesión y rutas protegidas.

Entregables:

```text
frontend/src/features/auth/
frontend/src/app/router.tsx
frontend/src/app/providers.tsx
```

Debe incluir:

- LoginPage.
- AuthProvider.
- useAuth.
- ProtectedRoute.
- RoleRoute.
- Logout.
- Pantalla 403.

---

## Fase 3 — Inventario

### TASK-030 — Implementar productos backend

Estado inicial: `COMPLETED`

Depende de:

- TASK-013
- TASK-021

Specs requeridos:

```text
specs/modules/inventory/spec.md
specs/.specs/03-api/inventory-api.md
specs/.specs/03-api/api-conventions.md
specs/.specs/02-database/entities.md
```

Relación resultado esperado ↔ specs:

- `inventory/spec.md` define producto, categoría, unidades, equivalencias y reglas de stock por ubicación.
- `inventory-api.md` fija endpoints de productos y prohíbe `stock` global.
- `api-conventions.md` aporta respuesta, errores, auth y paginación.
- `entities.md` detalla validaciones de `Product` y `ProductUnitEquivalent`.

Endpoints:

- GET /api/products
- GET /api/products/:id
- POST /api/products
- PATCH /api/products/:id
- DELETE /api/products/:id

Reglas:

- Producto eliminado debe desactivarse.
- Precio de venta mayor a cero.
- No guardar stock operativo como campo global del producto.
- Producto debe definir catálogo semántico: kilo, unidad entera o corte, además de su unidad de venta operativa.
- Si usa kilo/pieza, debe conservar equivalencia oficial o factor aplicado según spec.
- SKU único si existe.
- Producto inactivo no debe venderse.

---

### TASK-031 — Implementar categorías backend

Estado inicial: `COMPLETED`

Depende de:

- TASK-030

Specs requeridos:

```text
specs/modules/inventory/spec.md
specs/.specs/03-api/inventory-api.md
specs/.specs/03-api/api-conventions.md
specs/.specs/02-database/entities.md
```

Relación resultado esperado ↔ specs:

- `inventory/spec.md` define categoría como parte del catálogo de inventario.
- `inventory-api.md` contiene contratos `GET/POST/PATCH/DELETE /api/categories`.
- `api-conventions.md` fija formato, permisos y errores.
- `entities.md` aporta reglas de catálogo y desactivación cuando aplique.

Endpoints:

- GET /api/categories
- POST /api/categories
- PATCH /api/categories/:id
- DELETE /api/categories/:id

Reglas:

- Nombre requerido.
- Nombre único.
- Desactivar, no eliminar físicamente.

---

### TASK-032 — Implementar movimientos y ajustes de inventario backend

Estado inicial: `COMPLETED`

Depende de:

- TASK-030
- TASK-034

Specs requeridos:

```text
specs/modules/inventory/spec.md
specs/.specs/03-api/inventory-api.md
specs/.specs/03-api/api-conventions.md
specs/.specs/02-database/entities.md
```

Relación resultado esperado ↔ specs:

- `inventory/spec.md` define movimientos, ajustes, ubicación obligatoria y trazabilidad.
- `inventory-api.md` fija `POST /api/inventory/adjustments`, `GET /api/inventory/movements` y saldos por ubicación.
- `api-conventions.md` aporta contratos transversales de API y auth.
- `entities.md` detalla `InventoryBalance` e `InventoryMovement` para validar no negativos y unidades.

Endpoints:

- POST /api/inventory/adjustments
- GET /api/inventory/movements

Reglas:

- Todo ajuste registra movimiento.
- Todo ajuste registra ubicación operativa.
- Ajuste manual requiere motivo.
- No permitir stock negativo por ubicación.
- Registrar cantidades por kilo y/o pieza según producto.
- Usar transacción.

---

### TASK-033 — Implementar UI de inventario

Estado inicial: `COMPLETED`

Depende de:

- TASK-023
- TASK-030
- TASK-031
- TASK-032
- TASK-034
- TASK-035
- TASK-036

Specs requeridos:

```text
specs/.specs/04-ui/inventory.md
specs/.specs/04-ui/ui-guidelines.md
specs/modules/inventory/spec.md
specs/.specs/03-api/inventory-api.md
specs/.specs/03-api/locations-api.md
specs/.specs/03-api/inventory-transfers-api.md
specs/.specs/03-api/product-equivalences-api.md
```

Relación resultado esperado ↔ specs:

- `inventory.md` define pantallas, componentes y validaciones de UI de inventario.
- `ui-guidelines.md` define estados loading/error/empty, componentes base y navegación por rol.
- `inventory/spec.md` aporta reglas de producto, saldo por ubicación y equivalencias.
- Los specs API listados son los contratos que consumen vistas de productos, ubicaciones, traspasos, movimientos y equivalencias.

Entregables:

- ProductListPage.
- ProductFormModal.
- InventoryAdjustmentModal.
- InventoryByLocationView.
- InventoryTransferView.
- InventoryMovementsView.
- LowStockBadge.
- Product service.
- Product hooks.

Validaciones UI:

- Nombre requerido.
- Precio positivo.
- Stock por ubicación no negativo.
- Estados loading, error y empty.

---

### TASK-034 — Implementar ubicaciones operativas backend

Estado inicial: `COMPLETED`

Depende de:

- TASK-021

Specs requeridos:

```text
specs/modules/inventory/spec.md
specs/.specs/02-database/entities.md
specs/.specs/03-api/locations-api.md
specs/.specs/03-api/api-conventions.md
```

Relación resultado esperado ↔ specs:

- `inventory/spec.md` define `OperationalLocation` como base del inventario operativo.
- `entities.md` fija tipos válidos, `ROUTE_STOCK`, `EXTERNAL_POINT_OF_SALE` e inactivación.
- `locations-api.md` define rutas exactas para administrar ubicaciones.
- `api-conventions.md` aporta auth, errores y respuesta estándar.

Objetivo:

Implementar la administración de ubicaciones operativas para inventario.

Restricción:

No crear endpoints hasta que `specs/.specs/03-api/locations-api.md` exista y defina rutas exactas.

Reglas:

- Soportar ubicación tipo sucursal, almacén o mixta conforme a `OperationalLocation`.
- No asumir jerarquía final sucursal-almacén sin decisión de negocio.
- Las ubicaciones inactivas no deben usarse para nuevas ventas, compras, ajustes o traspasos.

---

### TASK-035 — Implementar traspasos de inventario backend

Estado inicial: `COMPLETED`

Depende de:

- TASK-030
- TASK-032
- TASK-034

Specs requeridos:

```text
specs/modules/inventory/spec.md
specs/.specs/02-database/entities.md
specs/.specs/03-api/inventory-transfers-api.md
specs/.specs/03-api/api-conventions.md
```

Relación resultado esperado ↔ specs:

- `inventory/spec.md` define traspasos como dominio propio entre ubicaciones.
- `entities.md` fija `InventoryTransfer`, items, movimientos y saldos no negativos.
- `inventory-transfers-api.md` define endpoints, estados, confirmación, cancelación e idempotencia.
- `api-conventions.md` aporta contratos transversales de API.

Objetivo:

Implementar traspasos como entidad de primera clase entre ubicaciones operativas.

Restricción:

No crear endpoints hasta que `specs/.specs/03-api/inventory-transfers-api.md` exista y defina rutas exactas.

Reglas:

- Traspaso requiere origen, destino, responsable y al menos un item.
- Origen y destino no pueden ser iguales.
- No confirmar si origen no tiene stock suficiente.
- Confirmar genera movimientos `TRANSFER_OUT` y `TRANSFER_IN` trazables.
- Debe manejar cantidades por kilo y/o pieza.

---

### TASK-036 — Implementar equivalencias kilo-pieza backend

Estado inicial: `COMPLETED`

Depende de:

- TASK-030

Specs requeridos:

```text
specs/modules/inventory/spec.md
specs/.specs/02-database/entities.md
specs/.specs/03-api/product-equivalences-api.md
specs/.specs/03-api/api-conventions.md
```

Relación resultado esperado ↔ specs:

- `inventory/spec.md` define equivalencias kilo-pieza y trazabilidad por producto.
- `entities.md` detalla validaciones de `ProductUnitEquivalent` y vigencia activa.
- `product-equivalences-api.md` define contratos exactos para crear, activar y consultar equivalencias.
- `api-conventions.md` aporta formato y validaciones transversales.

Objetivo:

Implementar equivalencias kilo-pieza oficiales por producto.

Restricción:

No crear endpoints hasta que `specs/.specs/03-api/product-equivalences-api.md` exista y defina rutas exactas.

Reglas:

- Solo una equivalencia activa por producto y par de unidades debe aplicar por periodo.
- No convertir kilo/pieza sin equivalencia aprobada cuando el producto lo requiera.
- Las ventas y compras deben conservar el factor aplicado al momento de la operación.

---

## Fase 4 — Clientes

### TASK-040 — Implementar clientes backend

Estado inicial: `COMPLETED`

Depende de:

- TASK-021

Specs requeridos:

```text
specs/modules/clientes/spec.md
specs/.specs/03-api/customers-api.md
specs/.specs/03-api/api-conventions.md
specs/.specs/02-database/entities.md
```

Relación resultado esperado ↔ specs:

- `clientes/spec.md` define cliente, mayoristas, condiciones comerciales, crédito y permisos.
- `customers-api.md` fija contratos CRUD, historial, resumen de crédito y validaciones.
- `api-conventions.md` aporta respuesta, errores, auth y paginación.
- `entities.md` aporta restricciones persistentes de `Customer` y relaciones con ventas/pagos.

Endpoints:

- GET /api/customers
- GET /api/customers/:id
- POST /api/customers
- PATCH /api/customers/:id
- DELETE /api/customers/:id

Reglas:

- Nombre requerido.
- Email válido si existe.
- Teléfono único si existe.
- Cliente eliminado debe desactivarse.
- Debe distinguir clientes minoristas y mayoristas.
- Debe conservar condiciones comerciales autorizadas: límite de crédito, días de crédito, lista de precios, ruta y dirección de entrega cuando aplique.
- Datos fiscales son opcionales en MVP y no habilitan CFDI.

---

### TASK-041 — Implementar UI de clientes

Estado inicial: `COMPLETED`

Depende de:

- TASK-023
- TASK-040

Specs requeridos:

```text
specs/.specs/04-ui/customers.md
specs/.specs/04-ui/ui-guidelines.md
specs/modules/clientes/spec.md
specs/.specs/03-api/customers-api.md
```

Relación resultado esperado ↔ specs:

- `customers.md` define pantallas, filtros, tabla, formulario y resumen visual de crédito.
- `ui-guidelines.md` gobierna estados, componentes base y menú por rol.
- `clientes/spec.md` aporta reglas de cliente, mayorista, bloqueo y permisos.
- `customers-api.md` define los contratos que consume la UI.

Entregables:

- CustomersPage.
- CustomerFormModal.
- CustomerTable.
- Customer search.
- CustomerTypeFilter.
- CreditStatusSummary.
- Customer service.
- Customer hooks.

---

### TASK-042 — Implementar políticas comerciales y configuración operativa backend

Estado inicial: `COMPLETED`

Depende de:

- TASK-021
- TASK-034

Specs requeridos:

```text
specs/modules/clientes/spec.md
specs/.specs/02-database/entities.md
specs/.specs/03-api/commercial-policies-api.md
specs/.specs/03-api/operational-config-api.md
specs/.specs/03-api/api-conventions.md
```

Relación resultado esperado ↔ specs:

- `clientes/spec.md` define condiciones comerciales, crédito, bloqueo y prevalencia de políticas.
- `entities.md` aporta `CommercialPolicy` y `OperationalConfig` como entidades auditables.
- `commercial-policies-api.md` define contratos para límites, días y vigencia comercial.
- `operational-config-api.md` define parámetros operativos sin permitir cambiar invariantes estructurales.
- `api-conventions.md` aporta formato, auth y errores.

Objetivo:

Implementar configuración auditable para políticas comerciales y parámetros operativos del MVP.

Restricción:

No crear endpoints hasta que los specs API correspondientes existan y definan rutas exactas.

Reglas:

- Configurar límites de crédito, días de crédito, bloqueo por mora o límite excedido.
- Configurar parámetros operativos permitidos sin cambiar invariantes estructurales.
- No permitir que una configuración desactive inventario por ubicación, cuentas por cobrar para crédito, traspasos como entidad propia ni ticket interno como único comprobante MVP.
- Auditar usuario creador, último modificador y vigencia.

---

### TASK-043 — Implementar cuentas por cobrar y pagos backend

Estado inicial: `PENDING`

Depende de:

- TASK-021
- TASK-040
- TASK-042

Specs requeridos:

```text
specs/modules/accounts-receivable/spec.md
specs/modules/clientes/spec.md
specs/modules/sales/spec.md
specs/.specs/02-database/entities.md
specs/.specs/03-api/accounts-receivable-api.md
specs/.specs/03-api/api-conventions.md
```

Relación resultado esperado ↔ specs:

- `accounts-receivable/spec.md` define cartera, pagos, estados, mora y `Payment` como fuente monetaria.
- `clientes/spec.md` aporta bloqueo de crédito, saldos y permisos COLLECTIONS.
- `sales/spec.md` vincula ventas a crédito, saldo pendiente y abonos iniciales.
- `entities.md` fija validaciones de `AccountReceivable` y `Payment`.
- `accounts-receivable-api.md` define contratos de cartera, pagos e historial.
- `api-conventions.md` aporta respuesta, auth, errores e idempotencia transversal.

Objetivo:

Implementar cuentas por cobrar, pagos parciales o totales y bloqueo de crédito.

Restricción:

No crear endpoints hasta que `specs/.specs/03-api/accounts-receivable-api.md` exista y defina rutas exactas.

Reglas:

- Toda venta a crédito genera una cuenta por cobrar.
- Para el MVP, cada pago de cobranza aplica a una sola cuenta por cobrar y `Payment.accountReceivableId` es requerido.
- Un pago inmediato de contado puede asociarse a la venta sin `AccountReceivable`.
- `PaymentAllocation` no es mecanismo oficial del MVP; queda para fase posterior de pagos distribuidos.
- Un pago no puede exceder saldo pendiente salvo regla futura de anticipos o saldos a favor.
- COLLECTIONS puede consultar saldos y registrar pagos conforme a permisos.
- Debe identificar cuentas vigentes, parcialmente pagadas, pagadas, vencidas y canceladas.

---

### TASK-044 — Implementar UI de cobranza

Estado inicial: `PENDING`

Depende de:

- TASK-023
- TASK-041
- TASK-043

Specs requeridos:

```text
specs/.specs/04-ui/accounts-receivable.md
specs/.specs/04-ui/ui-guidelines.md
specs/modules/accounts-receivable/spec.md
specs/modules/clientes/spec.md
specs/.specs/03-api/accounts-receivable-api.md
specs/.specs/03-api/customers-api.md
```

Relación resultado esperado ↔ specs:

- `accounts-receivable.md` define cartera, detalle, pagos, vencidas y badges de bloqueo.
- `ui-guidelines.md` gobierna estados, componentes y permisos visibles.
- `accounts-receivable/spec.md` aporta reglas de pago parcial/total y estados de cobranza.
- `clientes/spec.md` aporta crédito, bloqueo y saldos por cliente.
- `accounts-receivable-api.md` y `customers-api.md` son los contratos que consume la UI.

Objetivo:

Crear interfaz para seguimiento de cuentas por cobrar y registro de pagos.

Entregables:

- AccountsReceivablePage.
- CustomerBalanceView.
- PaymentRegistrationDialog.
- OverdueAccountsView.
- CreditBlockedCustomerBadge.

Reglas UI:

- Permitir pagos parciales y totales sobre una sola cuenta por cobrar.
- Mostrar saldos vencidos y por vencer.
- Respetar rol COLLECTIONS.

---

## Fase 5 — Ventas / POS

### TASK-050 — Implementar creación de venta backend

Estado inicial: `PENDING`

Depende de:

- TASK-021
- TASK-030
- TASK-032
- TASK-034
- TASK-036
- TASK-040
- TASK-042
- TASK-043

Specs requeridos:

```text
specs/modules/sales/spec.md
specs/modules/inventory/spec.md
specs/modules/clientes/spec.md
specs/modules/accounts-receivable/spec.md
specs/.specs/02-database/entities.md
specs/.specs/03-api/sales-api.md
specs/.specs/03-api/api-conventions.md
```

Relación resultado esperado ↔ specs:

- `sales/spec.md` define creación de venta, contado, crédito, abono, canal, documento y cancelación base.
- `inventory/spec.md` aporta stock por ubicación, movimientos y equivalencias aplicadas.
- `clientes/spec.md` aporta crédito autorizado, bloqueo, mayoristas y condiciones comerciales.
- `accounts-receivable/spec.md` define generación de cuenta por cobrar y `Payment` como fuente monetaria.
- `entities.md` fija validaciones persistentes de `Sale`, `SaleItem`, `Payment` e inventario.
- `sales-api.md` y `api-conventions.md` fijan el contrato `POST /api/sales`, auth, errores e idempotencia.

Endpoint:

- POST /api/sales

Reglas críticas:

- No vender sin stock suficiente.
- No vender sin stock suficiente en la ubicación operativa de descuento.
- No confirmar venta sin productos.
- No aceptar precios desde frontend.
- Calcular precios y totales en backend.
- Descontar inventario en transacción.
- Registrar movimiento por cada producto vendido.
- Crear Sale y SaleItem.
- Soportar venta de contado y venta a crédito.
- Venta a crédito requiere cliente autorizado y genera cuenta por cobrar.
- Para MVP, pagos de cuentas por cobrar aplican a una sola cuenta mediante `Payment.accountReceivableId` requerido.
- Pago inmediato de contado debe quedar asociado a la venta sin crear `AccountReceivable` artificial.
- Conservar unidad, cantidad kilo/pieza y equivalencia aplicada cuando corresponda.

Pruebas obligatorias:

- Crear venta válida.
- Crear venta de contado válida.
- Crear venta a crédito válida con cuenta por cobrar.
- Rechazar carrito vacío.
- Rechazar stock insuficiente.
- Descontar inventario correctamente.
- Rechazar crédito si cliente está bloqueado o excede límite sin autorización.

---

### TASK-051 — Implementar listado y detalle de ventas backend

Estado inicial: `PENDING`

Depende de:

- TASK-050

Specs requeridos:

```text
specs/modules/sales/spec.md
specs/.specs/03-api/sales-api.md
specs/.specs/03-api/api-conventions.md
```

Relación resultado esperado ↔ specs:

- `sales/spec.md` define permisos, tipos de venta, estados y trazabilidad requerida para consulta.
- `sales-api.md` fija `GET /api/sales` y `GET /api/sales/:id`, filtros y forma de respuesta.
- `api-conventions.md` aporta paginación, auth, errores y no exposición de datos sensibles.

Endpoints:

- GET /api/sales
- GET /api/sales/:id

Reglas:

- ADMIN ve todas las ventas.
- SELLER ve ventas propias salvo autorización.
- COLLECTIONS puede consultar ventas a crédito relacionadas con cobranza conforme a permisos.
- Soportar filtros por fecha, usuario, cliente, estado, método de pago, tipo de venta y ubicación operativa.

---

### TASK-052 — Implementar cancelación de venta backend

Estado inicial: `PENDING`

Depende de:

- TASK-050

Specs requeridos:

```text
specs/modules/sales/spec.md
specs/modules/inventory/spec.md
specs/modules/accounts-receivable/spec.md
specs/.specs/02-database/entities.md
specs/.specs/03-api/sales-api.md
specs/.specs/03-api/api-conventions.md
```

Relación resultado esperado ↔ specs:

- `sales/spec.md` define cancelación de venta, restricciones con pagos y reversa auditable.
- `inventory/spec.md` define restauración de stock en ubicación original con movimiento trazable.
- `accounts-receivable/spec.md` define ajuste/cancelación de cuenta por cobrar y pago relacionado.
- `entities.md` aporta validaciones de venta, pago, saldo y movimientos.
- `sales-api.md` y `api-conventions.md` fijan `POST /api/sales/:id/cancel`, transacción, errores e idempotencia.

Endpoint:

- POST /api/sales/:id/cancel

Reglas:

- No cancelar venta ya cancelada.
- Restaurar inventario.
- Restaurar inventario en la ubicación operativa original.
- Si la venta fue a crédito, ajustar o cancelar cuenta por cobrar relacionada.
- Registrar movimientos.
- Ejecutar en transacción.
- Solo ADMIN o vendedor autorizado.

Pruebas obligatorias:

- Cancelar venta confirmada.
- Restaurar stock.
- Rechazar doble cancelación.

---

### TASK-053 — Implementar ticket backend

Estado inicial: `PENDING`

Depende de:

- TASK-050

Specs requeridos:

```text
specs/modules/sales/spec.md
specs/modules/sales-documents/spec.md
specs/.specs/03-api/sales-api.md
```

Relación resultado esperado ↔ specs:

- `sales/spec.md` define el contenido operativo de la venta y que el ticket no es CFDI.
- `sales-documents/spec.md` fija comprobante interno, snapshots y separación de documentos de venta.
- `sales-api.md` define `GET /api/sales/:id/ticket` y prohíbe campos SAT/CFDI.

Endpoint:

- GET /api/sales/:id/ticket

Debe incluir:

- Número de venta.
- Fecha.
- Vendedor.
- Cliente si existe.
- Productos.
- Cantidades.
- Precios.
- Total.
- Método de pago.
- Tipo de venta: contado o crédito.
- Ubicación operativa de descuento.
- Estado.

Restricción:

- El ticket es comprobante interno del MVP; no debe presentarse como CFDI ni factura fiscal.

---

### TASK-054 — Implementar UI POS

Estado inicial: `PENDING`

Depende de:

- TASK-023
- TASK-033
- TASK-041
- TASK-050

Specs requeridos:

```text
specs/.specs/04-ui/sales-pos.md
specs/.specs/04-ui/ui-guidelines.md
specs/modules/sales/spec.md
specs/modules/inventory/spec.md
specs/modules/clientes/spec.md
specs/modules/accounts-receivable/spec.md
specs/.specs/03-api/sales-api.md
specs/.specs/03-api/inventory-api.md
specs/.specs/03-api/customers-api.md
```

Relación resultado esperado ↔ specs:

- `sales-pos.md` define layout, carrito, cliente, crédito, ticket, solicitud administrativa y validaciones de POS.
- `ui-guidelines.md` gobierna componentes, estados y experiencia por rol.
- `sales/spec.md`, `inventory/spec.md`, `clientes/spec.md` y `accounts-receivable/spec.md` aportan reglas de venta, stock, crédito y saldo.
- `sales-api.md`, `inventory-api.md` y `customers-api.md` son los contratos consumidos por el POS.

Entregables:

- SalesPosPage.
- ProductSearch.
- Cart.
- CustomerSelector.
- PaymentMethodSelector.
- SaleSummary.
- ConfirmSaleButton.
- TicketModal.

Reglas UI:

- No confirmar carrito vacío.
- No permitir cantidad mayor al stock mostrado.
- Mostrar stock por ubicación operativa.
- Permitir seleccionar tipo de venta: contado o crédito.
- Requerir cliente para venta a crédito.
- Mostrar bloqueo o límite de crédito cuando aplique.
- Mostrar total en tiempo real.
- Mostrar errores del backend.
- Limpiar carrito después de venta exitosa.

---

### TASK-055 — Implementar historial de ventas frontend

Estado inicial: `PENDING`

Depende de:

- TASK-051
- TASK-052
- TASK-053

Specs requeridos:

```text
specs/.specs/04-ui/sales-pos.md
specs/.specs/04-ui/ui-guidelines.md
specs/modules/sales/spec.md
specs/modules/sales-documents/spec.md
specs/.specs/03-api/sales-api.md
specs/.specs/03-api/sales-documents-api.md
```

Relación resultado esperado ↔ specs:

- `sales-pos.md` cubre consulta de venta, ticket interno, documentos y cancelación desde UI.
- `ui-guidelines.md` define tablas, dialogs, estados y permisos visibles.
- `sales/spec.md` gobierna historial, detalle, cancelación y reimpresión según estado de venta.
- `sales-documents/spec.md` gobierna documentos internos asociados a venta.
- `sales-api.md` y `sales-documents-api.md` son los contratos para historial, detalle, cancelación, ticket y documentos.

Objetivo:

Crear pantalla de historial, detalle, cancelación y reimpresión.

Entregables:

- SalesHistoryPage.
- SaleDetailPage.
- CancelSaleDialog.
- ReprintTicket action.

---

## Fase 6 — Compras

### TASK-060 — Implementar proveedores backend

Estado inicial: `PENDING`

Depende de:

- TASK-021

Specs requeridos:

```text
specs/modules/compras/spec.md
specs/.specs/03-api/purchases-api.md
specs/.specs/03-api/api-conventions.md
specs/.specs/02-database/entities.md
```

Relación resultado esperado ↔ specs:

- `compras/spec.md` define proveedores como catálogo requerido para compras.
- `purchases-api.md` contiene contratos de proveedores dentro del dominio de compras.
- `api-conventions.md` aporta respuesta, auth, errores y paginación.
- `entities.md` aporta validaciones persistentes de `Supplier` cuando aplique.

Endpoints:

- GET /api/suppliers
- GET /api/suppliers/:id
- POST /api/suppliers
- PATCH /api/suppliers/:id
- DELETE /api/suppliers/:id

Reglas:

- Nombre requerido.
- Desactivar, no eliminar físicamente.

---

### TASK-061 — Implementar compras backend

Estado inicial: `PENDING`

Depende de:

- TASK-030
- TASK-032
- TASK-034
- TASK-036
- TASK-060

Specs requeridos:

```text
specs/modules/compras/spec.md
specs/modules/inventory/spec.md
specs/.specs/02-database/entities.md
specs/.specs/03-api/purchases-api.md
specs/.specs/03-api/api-conventions.md
```

Relación resultado esperado ↔ specs:

- `compras/spec.md` define compra, proveedor, items, confirmación, cancelación y costo.
- `inventory/spec.md` aporta incremento/reversa de stock por ubicación y equivalencias.
- `entities.md` fija validaciones de `Purchase`, `PurchaseItem`, `InventoryMovement` y ubicación receptora.
- `purchases-api.md` y `api-conventions.md` fijan endpoints, transacciones, errores e idempotencia.

Endpoints:

- GET /api/purchases
- GET /api/purchases/:id
- POST /api/purchases
- POST /api/purchases/:id/cancel

Reglas:

- Compra requiere proveedor.
- Compra requiere al menos un producto.
- Compra requiere ubicación operativa receptora.
- Confirmar compra incrementa inventario en ubicación operativa receptora.
- Registrar movimientos de inventario con ubicación receptora.
- Registrar cantidades por kilo y/o pieza según producto.
- Cancelar compra revierte inventario si es posible.
- No permitir stock negativo por ubicación al revertir.

---

### TASK-062 — Implementar UI de compras

Estado inicial: `PENDING`

Depende de:

- TASK-023
- TASK-033
- TASK-061

Specs requeridos:

```text
specs/.specs/04-ui/purchases.md
specs/.specs/04-ui/ui-guidelines.md
specs/modules/compras/spec.md
specs/modules/inventory/spec.md
specs/.specs/03-api/purchases-api.md
specs/.specs/03-api/inventory-api.md
specs/.specs/03-api/locations-api.md
```

Relación resultado esperado ↔ specs:

- `purchases.md` define pantallas, formulario, detalle, proveedor, ubicación, items y cancelación.
- `ui-guidelines.md` define estados, componentes y permisos.
- `compras/spec.md` e `inventory/spec.md` aportan reglas de compra e inventario receptor.
- `purchases-api.md`, `inventory-api.md` y `locations-api.md` son los contratos consumidos por la UI.

Entregables:

- PurchasesPage.
- PurchaseFormPage.
- SupplierSelector.
- PurchaseLocationSelector.
- PurchaseItemsTable.
- PurchaseDetailPage.
- CancelPurchaseDialog.

---

## Fase 7 — Rutas y reparto

### TASK-070 — Implementar rutas backend

Estado inicial: `PENDING`

Depende de:

- TASK-021
- TASK-050
- TASK-043

Specs requeridos:

```text
specs/modules/routes-delivery/spec.md
specs/modules/sales/spec.md
specs/modules/inventory/spec.md
specs/modules/accounts-receivable/spec.md
specs/.specs/02-database/entities.md
specs/.specs/03-api/delivery-api.md
specs/.specs/03-api/api-conventions.md
```

Relación resultado esperado ↔ specs:

- `routes-delivery/spec.md` define rutas, pedidos, repartidor, estados, evidencia MVP y `ROUTE_STOCK`.
- `sales/spec.md` gobierna asignación solo de ventas confirmadas y no canceladas.
- `inventory/spec.md` aporta ubicación de ruta y no doble decremento.
- `accounts-receivable/spec.md` aporta cobro en ruta ligado a saldo pendiente.
- `entities.md` fija validaciones de `DeliveryRoute`, `DeliveryOrder`, `Payment` y `OperationalLocation`.
- `delivery-api.md` y `api-conventions.md` fijan endpoints, permisos, auth y errores.

Endpoints:

- GET /api/delivery-routes
- GET /api/delivery-routes/:id
- POST /api/delivery-routes
- PATCH /api/delivery-routes/:id/status
- PATCH /api/delivery-orders/:id/status

Reglas:

- Solo ventas confirmadas pueden asignarse.
- No asignar ventas canceladas.
- DRIVER solo ve rutas propias.
- DRIVER solo actualiza pedidos propios.
- Pedido entregado registra `deliveredAt`.
- Debe soportar evidencia de entrega como alcance MVP.
- Debe soportar no entrega, devolución, rechazo parcial e incidencia.
- Si hay saldo por cobrar, el cobro en ruta debe registrarse como pago aplicado a una sola cuenta por cobrar en MVP.

---

### TASK-071 — Implementar UI administrador de rutas

Estado inicial: `PENDING`

Depende de:

- TASK-055
- TASK-070
- TASK-073

Specs requeridos:

```text
specs/.specs/04-ui/routes-delivery.md
specs/.specs/04-ui/ui-guidelines.md
specs/modules/routes-delivery/spec.md
specs/.specs/03-api/delivery-api.md
specs/.specs/03-api/route-settlements-api.md
```

Relación resultado esperado ↔ specs:

- `routes-delivery.md` define alcance administrador: crear ruta, asignar pedidos, revisar evidencia y ver liquidación.
- `ui-guidelines.md` define navegación, estados y acciones visibles por rol.
- `routes-delivery/spec.md` aporta reglas de rutas, permisos, `ROUTE_STOCK`, evidencia y liquidación.
- `delivery-api.md` y `route-settlements-api.md` son contratos para rutas, pedidos, evidencias, cobros y liquidación visible desde admin.

Entregables:

- DeliveryRoutesPage.
- CreateRouteModal.
- AssignOrdersModal.
- RouteDetailPage.
- RouteEvidenceReview.
- RouteSettlementView.

---

### TASK-072 — Implementar UI repartidor

Estado inicial: `PENDING`

Depende de:

- TASK-023
- TASK-070
- TASK-073

Specs requeridos:

```text
specs/.specs/04-ui/routes-delivery.md
specs/.specs/04-ui/ui-guidelines.md
specs/modules/routes-delivery/spec.md
specs/.specs/03-api/delivery-api.md
```

Relación resultado esperado ↔ specs:

- `routes-delivery.md` define alcance repartidor: mis rutas, tarjetas de pedido, estados, evidencia, cobros e incidencias.
- `ui-guidelines.md` gobierna experiencia responsive/móvil, estados y permisos visibles.
- `routes-delivery/spec.md` aporta reglas de conductor, evidencia, no entrega, devolución y cobro autorizado.
- `delivery-api.md` define contratos consumidos por la experiencia del repartidor.

Entregables:

- MyRoutesPage.
- DeliveryOrderCard.
- UpdateDeliveryStatusDialog.
- DeliveryEvidenceCapture.
- RouteCollectionDialog.
- DeliveryIncidentDialog.

---

### TASK-073 — Implementar evidencia, cobros y liquidación de ruta backend

Estado inicial: `PENDING`

Depende de:

- TASK-043
- TASK-070

Specs requeridos:

```text
specs/modules/routes-delivery/spec.md
specs/modules/route-settlements/spec.md
specs/modules/accounts-receivable/spec.md
specs/modules/inventory/spec.md
specs/.specs/02-database/entities.md
specs/.specs/03-api/delivery-api.md
specs/.specs/03-api/route-settlements-api.md
specs/.specs/03-api/accounts-receivable-api.md
specs/.specs/03-api/api-conventions.md
```

Relación resultado esperado ↔ specs:

- `routes-delivery/spec.md` define evidencia, cobros, incidencias, devoluciones y vínculo con ruta.
- `route-settlements/spec.md` define apertura, cálculo, cierre, diferencias, reapertura e idempotencia de liquidación.
- `accounts-receivable/spec.md` y `accounts-receivable-api.md` gobiernan `Payment.accountReceivableId` y saldo cobrable.
- `inventory/spec.md` y `entities.md` gobiernan movimientos por devoluciones o diferencias que afectan stock.
- `delivery-api.md`, `route-settlements-api.md` y `api-conventions.md` fijan endpoints, permisos, transacciones y errores.

Objetivo:

Implementar evidencia de entrega, cobros en ruta, incidencias, devoluciones y liquidación de ruta.

Restricción:

No crear endpoints hasta que los specs API correspondientes existan y definan rutas exactas.

Reglas:

- Evidencia puede incluir foto, firma, geolocalización o nota; obligatoriedad exacta queda pendiente de negocio.
- Registrar cobros en ruta solo cuando exista saldo por cobrar y la política lo permita.
- Para MVP, cada pago de ruta aplica a una sola cuenta por cobrar mediante `Payment.accountReceivableId` requerido.
- Liquidación compara pedidos entregados, devoluciones, incidencias y dinero cobrado.
- Devoluciones o rechazos que afecten stock deben generar trazabilidad y movimiento de inventario cuando corresponda.

---

## Fase 8 — Documentos de venta y solicitudes administrativas

### TASK-080 — Consolidar comprobante interno

Estado inicial: `PENDING`

Depende de:

- TASK-053
- TASK-054

Specs requeridos:

```text
specs/modules/sales-documents/spec.md
specs/modules/billing-requests/spec.md
specs/modules/sales/spec.md
specs/.specs/03-api/sales-documents-api.md
specs/.specs/03-api/billing-requests-api.md
specs/.specs/03-api/sales-api.md
```

Relación resultado esperado ↔ specs:

- `sales-documents/spec.md` define comprobante interno, nota sencilla, nota grande y ciclo documental.
- `billing-requests/spec.md` mantiene la solicitud administrativa separada del documento operativo.
- `sales/spec.md` vincula documentos con venta confirmada sin implementar SAT/CFDI.
- `sales-documents-api.md`, `billing-requests-api.md` y `sales-api.md` alinean contratos de ticket, documentos y solicitud administrativa.

Objetivo:

Crear estructura formal para comprobante interno sin integración SAT.

Reglas:

- No afirmar que el ticket es CFDI.
- No integrar SAT en MVP.
- No crear timbrado, PAC, UUID fiscal, cancelación fiscal ni catálogos SAT en MVP.
- Mostrar venta cancelada como cancelada.
- `SaleDocument(documentType=INTERNAL_RECEIPT)` representa comprobante interno/ticket del MVP.
- `BillingRequest` se mantiene separado como relación administrativa y nunca como documento operativo de venta.

---

## Fase 9 — Reportes

### TASK-090 — Implementar reportes backend

Estado inicial: `PENDING`

Depende de:

- TASK-050
- TASK-061
- TASK-034
- TASK-043
- TASK-070
- TASK-073

Specs requeridos:

```text
specs/modules/reports/spec.md
specs/modules/sales/spec.md
specs/modules/inventory/spec.md
specs/modules/accounts-receivable/spec.md
specs/modules/routes-delivery/spec.md
specs/modules/point-of-sale-closing/spec.md
specs/.specs/03-api/reports-api.md
specs/.specs/03-api/api-conventions.md
```

Relación resultado esperado ↔ specs:

- `reports/spec.md` define reportes, permisos y consistencia casi en tiempo real.
- `sales/spec.md`, `inventory/spec.md`, `accounts-receivable/spec.md`, `routes-delivery/spec.md` y `point-of-sale-closing/spec.md` aportan las fuentes de verdad que los reportes agregan.
- `reports-api.md` define endpoints de dashboard, ventas diarias, bajo inventario y corte.
- `api-conventions.md` aporta formato, filtros, auth y latencia esperada.

Endpoints:

- GET /api/reports/dashboard
- GET /api/reports/sales-daily
- GET /api/reports/inventory-low-stock
- GET /api/reports/cash-closing

Pendiente de especificación API antes de implementar:

- Reportes de inventario por ubicación.
- Reportes de cuentas por cobrar y pagos.
- Reportes de reparto, entregas y liquidaciones.

Reglas:

- ADMIN ve información global.
- SELLER ve ventas propias.
- WAREHOUSE ve inventario.
- COLLECTIONS ve cobranza, saldos, pagos y cobros en ruta conforme a permisos.
- DRIVER no ve reportes financieros.
- Reportes operativos deben reflejar operaciones confirmadas con latencia máxima de 60 segundos en condiciones normales.
- Inventario se reporta por ubicación operativa.
- Distinguir ventas de contado, ventas a crédito, pagos de cuentas por cobrar y cobros en ruta.

---

### TASK-091 — Implementar dashboard frontend

Estado inicial: `PENDING`

Depende de:

- TASK-023
- TASK-090

Specs requeridos:

```text
specs/.specs/04-ui/dashboard.md
specs/.specs/04-ui/ui-guidelines.md
specs/modules/reports/spec.md
specs/.specs/03-api/reports-api.md
```

Relación resultado esperado ↔ specs:

- `dashboard.md` define cards, bajo stock, cobranza, reparto y gráficas.
- `ui-guidelines.md` gobierna layout, estados y visibilidad por rol.
- `reports/spec.md` define métricas y permisos de consulta.
- `reports-api.md` define el contrato que alimenta el dashboard.

Entregables:

- DashboardPage.
- Cards principales.
- Tabla de bajo stock por ubicación.
- Cards de cobranza y reparto conforme a permisos.
- Gráficas simples.

---

### TASK-092 — Implementar UI de reportes

Estado inicial: `PENDING`

Depende de:

- TASK-090

Specs requeridos:

```text
specs/.specs/04-ui/reports.md
specs/.specs/04-ui/ui-guidelines.md
specs/modules/reports/spec.md
specs/.specs/03-api/reports-api.md
```

Relación resultado esperado ↔ specs:

- `reports.md` define pantallas, filtros y reportes de ventas, caja, inventario, cobranza y reparto.
- `ui-guidelines.md` define componentes, estados y navegación por rol.
- `reports/spec.md` aporta reglas de permisos y fuentes de verdad.
- `reports-api.md` define contratos consumidos por los reportes frontend.

Entregables:

- ReportsPage.
- SalesDailyReport.
- CashClosingReport.
- LowStockReport.
- InventoryByLocationReport.
- AccountsReceivableReport.
- DeliveryOperationsReport.
- Filtros por fecha.
- Filtros por usuario para ADMIN.
- Filtros por ubicación, tipo de venta, estado de cobranza y ruta cuando aplique.

---

## Fase 10 — Calidad, seguridad y despliegue

### TASK-100 — Pruebas críticas backend

Estado inicial: `PENDING`

Depende de:

- TASK-050
- TASK-052
- TASK-061
- TASK-043
- TASK-073
- TASK-090

Specs requeridos:

```text
specs/.specs/05-testing/testing-strategy.md
specs/.specs/05-testing/acceptance-criteria.md
specs/modules/auth/spec.md
specs/modules/inventory/spec.md
specs/modules/sales/spec.md
specs/modules/accounts-receivable/spec.md
specs/modules/compras/spec.md
specs/modules/routes-delivery/spec.md
specs/modules/route-settlements/spec.md
specs/modules/reports/spec.md
```

Relación resultado esperado ↔ specs:

- `testing-strategy.md` define prioridades, transacción, idempotencia, concurrencia y permisos críticos backend.
- `acceptance-criteria.md` define criterios generales de aceptación del MVP.
- Los specs de módulos listados son indispensables porque la tarea prueba reglas críticas de auth, inventario, ventas, pagos, compras, rutas, liquidación y reportes.

Objetivo:

Crear pruebas unitarias e integración para reglas críticas.

Prioridad:

- Auth.
- Inventario.
- Ventas.
- Cuentas por cobrar y pagos.
- Compras.
- Rutas, cobros y liquidación.
- Reportes.

Validación:

```bash
cd backend
npm test
```

---

### TASK-101 — Pruebas críticas frontend

Estado inicial: `PENDING`

Depende de:

- TASK-054
- TASK-091

Specs requeridos:

```text
specs/.specs/05-testing/testing-strategy.md
specs/.specs/05-testing/acceptance-criteria.md
specs/.specs/04-ui/ui-guidelines.md
specs/.specs/04-ui/inventory.md
specs/.specs/04-ui/sales-pos.md
specs/.specs/04-ui/customers.md
specs/.specs/04-ui/accounts-receivable.md
specs/.specs/04-ui/routes-delivery.md
specs/.specs/04-ui/dashboard.md
specs/.specs/04-ui/reports.md
```

Relación resultado esperado ↔ specs:

- `testing-strategy.md` y `acceptance-criteria.md` definen cobertura esperada y flujos críticos frontend.
- `ui-guidelines.md` define estados, roles y componentes que deben validarse en pruebas UI.
- Los specs UI listados corresponden directamente a los flujos prioritarios: inventario, POS, clientes, cobranza, rutas, dashboard y reportes.

Objetivo:

Crear pruebas de interfaz para flujos principales.

Prioridad:

- Login.
- Inventario.
- POS.
- Clientes.
- Cobranza.
- Rutas y reparto.
- Reportes.

Validación:

```bash
cd frontend
npm test
```

---

### TASK-102 — Revisión de seguridad

Estado inicial: `PENDING`

Depende de:

- TASK-100

Specs requeridos:

```text
specs/.specs/01-architecture/architecture.md
specs/.specs/01-architecture/coding-standards.md
specs/.specs/01-architecture/ai-rules.md
specs/modules/auth/spec.md
specs/.specs/03-api/auth-api.md
specs/.specs/03-api/api-conventions.md
specs/.specs/06-deployment/env-vars.md
```

Relación resultado esperado ↔ specs:

- `architecture.md` define seguridad JWT, refresh token, RBAC, hash y validación.
- `coding-standards.md` y `ai-rules.md` fijan no exponer secretos, no devolver hashes y usar guards/DTOs.
- `auth/spec.md` y `auth-api.md` detallan login, refresh, logout y me.
- `api-conventions.md` y `env-vars.md` cubren Bearer token, errores seguros, CORS/secretos y `.env` fuera de Git.

Checklist:

- Password hash.
- JWT con expiración.
- Refresh token.
- Guards en endpoints.
- RBAC.
- No passwordHash en respuestas.
- Validación DTO.
- CORS configurado.
- No secretos hardcodeados.
- `.env` fuera de Git.
- Errores sin datos sensibles.

---

### TASK-103 — Revisión de permisos

Estado inicial: `PENDING`

Depende de:

- TASK-102

Specs requeridos:

```text
specs/modules/auth/spec.md
specs/modules/usuarios/spec.md
specs/modules/inventory/spec.md
specs/modules/sales/spec.md
specs/modules/accounts-receivable/spec.md
specs/modules/clientes/spec.md
specs/modules/compras/spec.md
specs/modules/routes-delivery/spec.md
specs/modules/reports/spec.md
specs/.specs/03-api/api-conventions.md
specs/.specs/04-ui/ui-guidelines.md
```

Relación resultado esperado ↔ specs:

- `auth/spec.md` y `usuarios/spec.md` definen roles, autenticación y administración de usuarios.
- Los specs de módulos listados contienen los permisos por rol que deben validarse en backend y menú frontend.
- `api-conventions.md` exige autorización en endpoints y alcance operativo.
- `ui-guidelines.md` define menú, rutas protegidas, UnauthorizedState y visibilidad por rol.

Objetivo:

Validar permisos por rol.

Roles:

- ADMIN.
- SELLER.
- WAREHOUSE.
- DRIVER.
- COLLECTIONS.

Validar:

- Menú frontend por rol.
- Rutas frontend protegidas.
- Endpoints backend protegidos.
- Acceso denegado correcto.

---

### TASK-104 — Preparar despliegue Docker

Estado inicial: `PENDING`

Depende de:

- TASK-100
- TASK-101
- TASK-102

Specs requeridos:

```text
specs/.specs/06-deployment/deployment.md
specs/.specs/06-deployment/docker.md
specs/.specs/06-deployment/env-vars.md
specs/.specs/01-architecture/tech-stack.md
```

Relación resultado esperado ↔ specs:

- `deployment.md` define preparación de salida y ejecución final.
- `docker.md` fija Dockerfiles, `docker-compose.yml` y servicios.
- `env-vars.md` gobierna `.env.example`, secretos y variables necesarias.
- `tech-stack.md` confirma componentes que deben empaquetarse y levantarse.

Entregables:

- Dockerfiles finales.
- docker-compose.yml final.
- nginx.conf si aplica.
- .env.example actualizado.
- README de despliegue.

Validación:

```bash
docker compose up --build
```

---

### TASK-105 — Documentación final

Estado inicial: `PENDING`

Depende de:

- TASK-104

Specs requeridos:

```text
specs/README.md
specs/.specs/00-business/PRD.md
specs/.specs/01-architecture/architecture.md
specs/.specs/03-api/api-conventions.md
specs/.specs/06-deployment/deployment.md
specs/.specs/06-deployment/docker.md
specs/.specs/06-deployment/env-vars.md
specs/.specs/07-workflows/task.md
```

Relación resultado esperado ↔ specs:

- `specs/README.md` y `PRD.md` dan contexto ejecutivo y alcance para la documentación final.
- `architecture.md` sostiene explicación de frontend, backend, base de datos y seguridad.
- `api-conventions.md` permite documentar contratos API sin repetir endpoints inventados.
- `deployment.md`, `docker.md` y `env-vars.md` cubren instalación, configuración, migraciones, Docker y variables.
- `task.md` aporta orden de implementación, estados y flujos principales ya construidos.

Entregables:

```text
docs/installation.md
docs/deployment.md
docs/api.md
docs/user-guide.md
README.md
```

Debe incluir:

- Cómo instalar.
- Cómo configurar variables.
- Cómo correr migraciones.
- Cómo iniciar frontend.
- Cómo iniciar backend.
- Cómo usar Docker.
- Usuario inicial.
- Flujos principales.

---

# 12. Orden recomendado de ejecución

```text
TASK-000
TASK-001
TASK-002
TASK-003
TASK-004
TASK-010
TASK-011
TASK-012
TASK-013
TASK-020
TASK-021
TASK-022
TASK-023
TASK-030
TASK-031
TASK-034
TASK-032
TASK-035
TASK-036
TASK-033
TASK-040
TASK-041
TASK-042
TASK-043
TASK-044
TASK-050
TASK-051
TASK-052
TASK-053
TASK-054
TASK-055
TASK-060
TASK-061
TASK-062
TASK-070
TASK-073
TASK-071
TASK-072
TASK-080
TASK-090
TASK-091
TASK-092
TASK-100
TASK-101
TASK-102
TASK-103
TASK-104
TASK-105
```

---

# 13. Lotes de implementación recomendados

## Lote A — Base técnica

```text
TASK-000
TASK-001
TASK-002
TASK-003
TASK-004
```

## Lote B — Base de datos

```text
TASK-010
TASK-011
TASK-012
TASK-013
```

## Lote C — Seguridad

```text
TASK-020
TASK-021
TASK-022
TASK-023
```

## Lote D — Inventario

```text
TASK-030
TASK-031
TASK-034
TASK-032
TASK-035
TASK-036
TASK-033
```

## Lote E — Clientes, políticas y cobranza

```text
TASK-040
TASK-041
TASK-042
TASK-043
TASK-044
```

## Lote F — Ventas MVP

```text
TASK-050
TASK-051
TASK-052
TASK-053
TASK-054
TASK-055
```

## Lote G — Compras

```text
TASK-060
TASK-061
TASK-062
```

## Lote H — Reparto

```text
TASK-070
TASK-073
TASK-071
TASK-072
```

## Lote I — Reportes, QA y despliegue

```text
TASK-080
TASK-090
TASK-091
TASK-092
TASK-100
TASK-101
TASK-102
TASK-103
TASK-104
TASK-105
```

---

# 14. Prompts de ejecución para agentes

## Prompt para iniciar proyecto

```text
Actúa como Spec Driven Development Orchestrator.

Lee:
- task.md
- specs/.specs/00-business/PRD.md
- specs/.specs/00-business/business-rules.md
- specs/.specs/01-architecture/architecture.md
- specs/.specs/01-architecture/folder-structure.md
- specs/.specs/01-architecture/coding-standards.md
- specs/.specs/01-architecture/ai-rules.md

Ejecuta únicamente TASK-000 y TASK-001.

No implementes módulos de negocio.
No crees endpoints.
No crees modelos todavía.
No inventes estructura fuera de los specs.

Al finalizar, entrega:
- Estado de cada task.
- Archivos creados.
- Archivos modificados.
- Validaciones realizadas.
- Próxima task sugerida.
```

## Prompt para ejecutar una tarea específica

```text
Actúa como Spec Driven Development Orchestrator.

Ejecuta únicamente la tarea: TASK-XXX.

Antes de implementar:
1. Lee únicamente el bloque `Specs requeridos` de TASK-XXX.
2. Lee solo esos specs; no agregues specs por cercanía o conveniencia.
3. Identifica dependencias.
4. Verifica que las dependencias estén completadas.
5. Lista los archivos que planeas crear o modificar.

Durante la implementación:
- Respeta TypeScript.
- Respeta arquitectura.
- Respeta rutas API.
- Respeta reglas de negocio.
- No generes código fuera del alcance de TASK-XXX.

Después de implementar:
- Ejecuta validaciones posibles.
- Ejecuta pruebas si existen.
- Reporta resultado con el formato obligatorio de task.md.
```

## Prompt para revisión QA

```text
Actúa como Senior QA Engineer dentro de un proceso Spec Driven Development.

Revisa la tarea: TASK-XXX.

Compara la implementación contra:
- task.md
- únicamente los specs declarados en el bloque `Specs requeridos` de TASK-XXX

Entrega:
- Estado: APROBADA / RECHAZADA / NECESITA CAMBIOS
- Errores críticos
- Errores medios
- Errores menores
- Reglas incumplidas
- Pruebas faltantes
- Cambios recomendados
```

## Prompt para corregir tarea rechazada

```text
Actúa como Senior Software Engineer.

Corrige únicamente los problemas reportados para TASK-XXX.

No cambies arquitectura.
No agregues features nuevas.
No modifiques specs salvo que exista contradicción.
No cambies endpoints existentes.
No cambies modelos sin migración.
No rompas pruebas existentes.

Al terminar:
- Lista correcciones realizadas.
- Explica archivos modificados.
- Ejecuta validaciones.
- Reporta si la task queda COMPLETED o NEEDS_REVIEW.
```

---

# 15. Checklist global antes de producción

```text
[ ] Login funcional.
[ ] Roles funcionales.
[ ] CRUD de productos funcional.
[ ] Ubicaciones operativas funcionales.
[ ] Ajustes de inventario por ubicación funcionales.
[ ] Traspasos entre ubicaciones funcionales.
[ ] Movimientos de inventario registrados con ubicación.
[ ] Equivalencias kilo-pieza aplicadas y trazables cuando corresponda.
[ ] Clientes funcionales.
[ ] Clientes mayoristas y condiciones comerciales funcionales.
[ ] POS funcional.
[ ] Venta de contado funcional.
[ ] Venta a crédito genera cuenta por cobrar.
[ ] Cobranza permite pagos parciales/totales a una sola cuenta por cobrar en MVP.
[ ] Venta descuenta inventario por ubicación operativa.
[ ] Venta no permite stock insuficiente.
[ ] Cancelación restaura inventario.
[ ] Ticket funcional.
[ ] Ticket no se presenta como CFDI ni factura fiscal.
[ ] Compras incrementan inventario.
[ ] Cancelación de compra valida inventario.
[ ] Rutas asignan pedidos.
[ ] Repartidor solo ve sus rutas.
[ ] Evidencia de entrega funcional conforme a política definida.
[ ] Cobros en ruta asociados a cuenta por cobrar y liquidación.
[ ] Liquidación de ruta funcional.
[ ] Dashboard muestra métricas.
[ ] Corte de caja funciona.
[ ] Bajo stock funciona.
[ ] Reportes de inventario, cobranza y reparto reflejan operaciones confirmadas con latencia máxima de 60 segundos en condiciones normales.
[ ] Backend compila.
[ ] Frontend compila.
[ ] Tests críticos pasan.
[ ] Docker levanta servicios.
[ ] No hay secretos hardcodeados.
[ ] README actualizado.
[ ] .env.example actualizado.
```

---

# 16. Política de cambios a specs

Si durante el desarrollo se detecta que un spec debe cambiar, usar este formato:

```text
SPEC CHANGE REQUEST

Motivo:
- Explicación

Archivo a modificar:
- ruta/spec.md

Cambio propuesto:
- Antes:
- Después:

Impacto:
- Base de datos:
- API:
- Frontend:
- Tests:
```

No modificar código hasta que el spec quede consistente.

---

# 17. Criterios para detenerse

El agente debe detenerse si ocurre cualquiera de estos casos:

- Falta un spec requerido.
- Hay contradicción entre specs.
- La tarea depende de otra no completada.
- La implementación requiere credenciales reales.
- El cambio rompe arquitectura.
- El cambio requiere una decisión de negocio no definida.
- No compila TypeScript.
- Una migración puede causar pérdida de datos sin advertencia.
- Una prueba crítica falla y no puede corregirse dentro de la tarea.

---

# 18. Convención de commits sugerida

Formato:

```text
tipo(modulo): descripción
```

Tipos permitidos:

```text
feat
fix
docs
refactor
test
chore
build
ci
```

Ejemplos:

```text
feat(auth): implementar login con jwt
feat(inventario): agregar crud de productos
fix(ventas): validar stock insuficiente antes de confirmar venta
test(ventas): agregar pruebas de cancelación
docs(specs): actualizar reglas de compras
```

---

# 19. Prioridad del MVP

El MVP mínimo funcional debe completarse en este orden:

```text
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
```

Rutas y reparto forman parte del MVP por alcance de negocio. Pueden implementarse después del POS, pero no deben eliminarse del MVP sin cambio explícito del PRD.

---

# 20. Regla final

No optimices por velocidad.  
Optimiza por consistencia.

No generes más código del necesario.  
Genera código mantenible, tipado, validado y alineado con specs.

No trates este archivo como sugerencia.  
Trátalo como contrato de ejecución del proyecto.
