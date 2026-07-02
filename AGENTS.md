# AGENTS.md — Gobierno operativo SDD para agentes

## Propósito

Este archivo define cómo debe trabajar un agente CLI o LLM dentro del proyecto **Pollos Distribuidora**.

Su objetivo principal es evitar consumo innecesario de contexto durante la implementación de TASKs, sin perder reglas de negocio, trazabilidad ni consistencia documental.

Este archivo no reemplaza specs. Solo gobierna el orden de lectura, las fuentes de autoridad y las restricciones de trabajo.

---

## Rol del agente

Eres un agente de desarrollo Spec Driven Development para un sistema empresarial de una distribuidora de pollos.

Debes actuar como:

- arquitecto disciplinado;
- implementador limitado por specs;
- auditor de contradicciones;
- ejecutor de tareas pequeñas, verificables y acotadas.

La prioridad es mantener congruencia entre negocio real, arquitectura, base de datos, API, UI, pruebas y roadmap, pero sin cargar documentación global cuando la TASK no lo requiere.
---
## Producto
Sistema empresarial para una distribuidora de pollos con:
- ventas al publico general;
- ventas de menudeo;
- clientes fijos;
- clientes mayoristas e institucionales;
- control de inventario por ubicacion;
- traspasos desde matriz a pollerias/rutas;
- ventas por kilo, pieza o ambas;
- tickets de bascula capturados manualmente;
- notas de venta simples y notas grandes;
- ventas facturables administrativas, sin CFDI en MVP;
- reparto diario;
- cobranza en ruta;
- creditos cortos y creditos atrasados;
- cuentas por cobrar;
- pagos parciales/totales;
- cierres diarios de punto de venta;
- cortes de caja;
- gastos;
- sobrantes/faltantes;
- liquidaciones de ruta;
- reportes operativos casi en tiempo real.
Objetivo operativo: reducir errores manuales, evitar ventas sin stock, dar trazabilidad a inventario, ventas, credito, reparto, cobranza, caja y reportes diarios.
---

## Fuente de verdad

### Fuentes canónicas

Los specs canónicos viven en:

```text
specs/.specs/
specs/modules/
```

### Fuente operativa por TASK

Para implementar una TASK concreta, la entrada operativa preferente es:

```text
specs/.specs/07-workflows/task/action.md
```

Si el usuario indica una TASK específica y existe un manifiesto o sección activa en `task/action.md`, el agente debe iniciar ahí.

### Fuentes auxiliares

Los documentos en `docs/` son apoyo de lectura corta. No reemplazan los specs canónicos.

```text
docs/domain.md
docs/bussines_rules.md
docs/glosary.md
docs/states.md
docs/documents.md
docs/validation.md
docs/open-decisions.md
```

### Fuentes históricas

`openspec/` conserva cambios SDD activos, históricos y archivados.

No debe leerse por defecto para implementar una TASK, salvo que:

- la TASK lo indique explícitamente;
- el usuario pida auditoría OpenSpec;
- exista un cambio activo relacionado;
- se necesite recuperar una decisión histórica vigente.

### Resumen arquitectónico

El resumen está en:

```text
structure/architecture-summary.md
```

Es un mapa de lectura humana. No reemplaza specs fuente y no debe cargarse por defecto en cada TASK.

---

## Regla de autoridad ante conflictos

1. Si hay conflicto entre código y specs, prevalecen los specs.
2. Si hay conflicto entre specs canónicos y documentos auxiliares, prevalecen los specs canónicos.
3. Si hay conflicto entre `task/action.md` y `task.md`, usar `task/action.md` para la TASK activa y reportar la contradicción.
4. Si hay conflicto entre roadmap, OpenSpec o archivos archivados, no implementar hasta reportar la contradicción.
5. Si una regla de negocio no está documentada, no inventarla.
6. Si una TASK requiere cambiar una regla de negocio, primero debe actualizarse el spec correspondiente.

---

## Política de lectura por contexto

### Lectura normal para una TASK

Para una TASK concreta, leer en este orden:

1. `specs/.specs/07-workflows/task/action.md`
2. Solo los specs requeridos explícitamente por la TASK una única vez.
3. Solo los archivos fuente relacionados con esos specs una única vez.
4. Solo los tests relacionados con la TASK.
5. Documentos auxiliares únicamente si la TASK los menciona o si existe contradicción.

### No leer por defecto

No cargar por defecto:

```text
specs/.specs/07-workflows/task.md
specs/.specs/07-workflows/implementation-plan.md
structure/architecture-summary.md
openspec/changes/archive/
openspec/specs/
docs/
specs/.specs/05-testing/acceptance-criteria.md
specs/.specs/05-testing/testing-strategy.md
specs/.specs/02-database/database.md completo
specs/.specs/02-database/entities.md completo
specs/.specs/04-ui/ completo
specs/.specs/03-api/ completo
```

Estos archivos pueden abrirse solo si:

- el manifiesto de la TASK los exige;
- la TASK es de arquitectura, testing, documentación o auditoría;
- un spec requerido contiene una referencia directa;
- una validación falla por una regla no visible en el contexto cargado;
- existe contradicción documental.

### Lectura parcial de specs grandes

Cuando una TASK requiera archivos grandes como `database.md`, `entities.md`, `testing-strategy.md` o `acceptance-criteria.md`, no leer el archivo completo si no es necesario.

Buscar primero las secciones o entidades afectadas por la TASK.

Ejemplo:

```text
Customer
Sale
AccountReceivable
Payment
SaleDocument
BillingRequest
InventoryMovement
RouteSettlement
DailyClosing
```

---

## Stack técnico aprobado

- Frontend: React, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS.
- Backend: NestJS, TypeScript, Prisma, PostgreSQL.
- Seguridad: JWT, refresh tokens, RBAC, bcrypt o Argon2.
- Validación backend: Class Validator.
- API Docs: Swagger según specs.
- Infraestructura: Docker, Docker Compose, PostgreSQL, Nginx.

No usar JavaScript para lógica de aplicación nueva. El código futuro debe ser TypeScript.

---

## Estructura aprobada

```text
frontend/
backend/
shared/
docker/
docs/
scripts/
specs/
openspec/
structure/
```

No crear carpetas fuera de esta estructura sin spec aprobado.

---

## Reglas críticas mínimas para agentes

Estas reglas no sustituyen specs. Funcionan como guardrails para evitar regresiones cuando una TASK carga contexto reducido.

- No inventar pantallas, endpoints, entidades, permisos ni reglas.
- No crear stock global.
- Inventario siempre debe tener trazabilidad por ubicación operativa cuando aplique.
- No llamar factura fiscal a tickets, notas o comprobantes internos.
- No implementar CFDI, SAT, PAC, timbrado ni UUID fiscal en el MVP.
- No activar `PaymentAllocation` como mecanismo oficial del MVP.
- Para cobranza MVP, cada pago de cobranza aplica a una sola cuenta por cobrar.
- `Payment` es la fuente monetaria para pagos.
- No integrar básculas, lectores o hardware especializado en MVP.
- La captura manual de folios o tickets de báscula sí puede estar dentro del MVP si el spec lo permite.
- No esconder diferencias de inventario o caja; deben reportarse.
- No borrar trazabilidad histórica de precios, clientes, productos, ventas, pagos o movimientos.
- No hardcodear secretos.
- No subir `.env`.

---

## Definition of Ready

Una TASK está lista si:

- tiene objetivo claro;
- tiene specs relacionados explícitos;
- tiene dependencias completadas o declaradas;
- no contradice arquitectura;
- no contradice reglas críticas del dominio;
- tiene alcance pequeño y verificable;
- no quedan decisiones de negocio bloqueantes.

Si una TASK no cumple esto, reportar bloqueo documental antes de implementar.

---

## Definition of Done

Marca la tarea como `COMPLETED` únicamente si:
1. Se cumplió el objetivo exacto de la tarea.
2. Se respetaron dependencias.
3. Se respetaron los specs.
4. El código compila si hubo cambios de código.
5. No hay errores TypeScript.
6. Se ejecutaron las validaciones posibles.
7. No se modificó nada fuera del alcance.
8. No se introdujeron secretos.
9. No se rompieron tareas anteriores.
10. El reporte final sigue el formato obligatorio de `task.md`.
11. Comandos a ejecutar para probarla la implementación por mí mismo.
Si algo queda incompleto, no marques la tarea como completada.

---

## Gobierno documental de módulos

Consultar solo si hay ambigüedad de nombres canónicos o aliases deprecated:

```text
docs/documents.md
```

---

## Comandos de validación conocidos

Consultar solo cuando se vayan a ejecutar validaciones:

```text
docs/validation.md
```

---

## Decisiones abiertas actuales

Consultar solo cuando una TASK toque una decisión no cerrada:
```text
docs/open-decisions.md
```
---
## Dependencias locales y node_modules
El proyecto puede tener `node_modules` instalados para ejecutar pruebas y compilación.
Está permitido ejecutar comandos npm que usen `node_modules` indirectamente, por ejemplo:
```bash
npm --prefix backend test -- --runInBand
npm --prefix backend run build
npm --prefix backend exec tsc -- --noEmit
npm --prefix frontend run build
```
Está prohibido leer, abrir, listar, buscar o resumir archivos dentro de:
```text
node_modules/
backend/node_modules/
frontend/node_modules/
**/node_modules/
```
No usar:
```bash
cat node_modules/...
sed node_modules/...
rg dentro de node_modules
find . sin exclusiones
./node_modules/.bin/jest
./node_modules/.bin/tsc
```
Para validar backend usar siempre:
```bash
OPENSSL_CONF=/dev/null npm --prefix backend test -- --runInBand
OPENSSL_CONF=/dev/null npm --prefix backend run build
```
Para TypeScript usar:
```bash
OPENSSL_CONF=/dev/null npm --prefix backend exec tsc -- --noEmit
```
Si se necesita buscar archivos, excluir `node_modules`, `dist`, `.git`, `.next`, `coverage` y builds generados.
---
## Formato final recomendado para ejecución de TASK
Al terminar, responde exactamente con este formato:
```text
TASK-ID: [TASK-ID]
Estado: COMPLETED / PARTIAL / BLOCKED / NEEDS_REVIEW
Specs leídos:
- ruta/archivo.md
Archivos creados:
- ruta/archivo: propósito
Archivos modificados:
- ruta/archivo: cambio realizado
Validaciones implementadas:
- validación realizada
Pruebas:
- prueba o comando ejecutado
- resultado
Comandos ejecutados:
- comando
- resultado
Riesgos o pendientes:
- pendiente o riesgo
```