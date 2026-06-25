# Workflow para OpenCode + Gentleman AI

## Principio

El orquestador debe implementar por specs, no por ocurrencias.

## Orden de trabajo

### 1. Inicialización

Leer:

- `.specs/00-business/PRD.md`
- `.specs/00-business/business-rules.md`
- `.specs/01-architecture/architecture.md`
- `.specs/01-architecture/folder-structure.md`
- `.specs/01-architecture/ai-rules.md`

Resultado esperado:

- Crear estructura base del monorepo.
- Configurar frontend.
- Configurar backend.
- Configurar TypeScript.
- Configurar linting.

### 2. Base de datos

Leer:

- `.specs/02-database/database.md`
- `.specs/02-database/entities.md`
- `.specs/02-database/prisma-guidelines.md`

Resultado esperado:

- Crear `schema.prisma`.
- Crear migración inicial.
- Crear seed.
- Crear PrismaModule.

### 3. Autenticación

Leer:

- `modules/auth/spec.md`
- `.specs/03-api/auth-api.md`

Resultado esperado:

- Login.
- Refresh token.
- Guards.
- Decoradores de roles.
- Usuario autenticado.

### 4. Inventario

Leer:

- `modules/inventory/spec.md`
- `.specs/03-api/inventory-api.md`
- `.specs/04-ui/inventory.md`

Resultado esperado:

- CRUD productos.
- Ajustes de inventario.
- Movimientos.
- Pantalla inventario.

### 5. Ventas

Leer:

- `modules/sales/spec.md`
- `.specs/03-api/sales-documents-api.md`
- `.specs/03-api/billing-requests-api.md`
- `.specs/03-api/sales-api.md`
- `.specs/04-ui/sales-pos.md`

Resultado esperado:

- POS.
- Crear venta.
- Descontar inventario.
- Cancelar venta.
- Ticket.
- SaleDocument.
- BillingRequest.

### 6. Compras

Leer:

- `modules/compras/spec.md`
- `.specs/03-api/purchases-api.md`
- `.specs/04-ui/purchases.md`

### 7. Clientes

Leer:

- `modules/clientes/spec.md`
- `.specs/03-api/customers-api.md`
- `.specs/04-ui/customers.md`

### 8. Rutas y reparto

Leer:

- `modules/routes-delivery/spec.md`
- `.specs/03-api/delivery-api.md`
- `.specs/03-api/route-settlements-api.md`
- `.specs/04-ui/routes-delivery.md`

### 9. Reportes

Leer:

- `modules/reports/spec.md`
- `.specs/03-api/reports-api.md`
- `.specs/04-ui/reports.md`

### 9.1 Cierre POS

Leer:

- `modules/point-of-sale-closing/spec.md`
- `.specs/03-api/point-of-sale-closing-api.md`
- `.specs/04-ui/point-of-sale-closing.md`

### 10. QA

Leer:

- `.specs/05-testing/testing-strategy.md`
- `.specs/05-testing/acceptance-criteria.md`

Resultado esperado:

- Pruebas unitarias.
- Validación de reglas críticas.
- Corrección de errores.

## Prompt base para el orquestador

```text
Actúa como Spec Driven Development Orchestrator.

Antes de escribir código:
1. Lee los specs relevantes.
2. Identifica contratos, entidades, permisos y reglas.
3. Implementa únicamente lo definido.
4. No contradigas specs existentes.
5. Si encuentras conflicto, detente y reporta el conflicto.

Al terminar:
- Lista archivos creados.
- Lista archivos modificados.
- Explica validaciones.
- Explica pruebas.
- Reporta pendientes.
```
