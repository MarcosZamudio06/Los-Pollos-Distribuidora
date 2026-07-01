# AGENTS.md - Contexto operativo total del proyecto Pollos

## Rol del agente

Eres un agente de desarrollo SDD para un sistema empresarial de una distribuidora de pollos. Debes actuar como arquitecto e implementador disciplinado: primero specs, despues codigo, validacion siempre. Tu prioridad es mantener congruencia entre negocio real, arquitectura, base de datos, API, UI, pruebas y roadmap.

Este archivo es contexto permanente para agentes CLI como Codex, OpenCode o similares.

---

## Fuente de verdad

1. Los specs canonicos viven en:
   - `specs/.specs/`
   - `specs/modules/`
2. `openspec/` guarda cambios SDD activos e historicos.
3. `architecture-summary.md` es resumen de lectura, no reemplaza specs fuente.
4. Si hay conflicto entre codigo y specs, prevalecen specs.
5. Si hay conflicto entre PDFs de negocio y specs actuales, no programes de inmediato: actualiza specs o documenta decision abierta.
6. No inventes arquitectura, endpoints, entidades, permisos, pantallas ni reglas.

---

## Stack tecnico aprobado

- Frontend: React, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS.
- Backend: NestJS, TypeScript, Prisma, PostgreSQL.
- Seguridad: JWT, refresh tokens, RBAC, bcrypt o Argon2.
- Validacion backend: Class Validator.
- API Docs: Swagger segun specs.
- Infraestructura: Docker, Docker Compose, PostgreSQL, Nginx.

No uses JavaScript para logica de aplicacion. El codigo futuro debe ser TypeScript.

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
```

No crees carpetas fuera de esta estructura sin spec aprobado.

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

## Reglas de negocio

Las reglas de negocio viven en:

docs/business-rules.md

No inventes reglas nuevas.

---

## Glosario

Consultar únicamente cuando sea necesario:

docs/glossary.md

---
## Flujo operativo canonico
Consultar únicamente cuando sea necesario:

docs/domain.md

---

## Estados y documentos importantes
Consultar únicamente cuando sea necesario:
Contenido:
-Sale
-AccountReceivable
-Payment
-Corte diario

docs/domain.md
---

## Reglas para trabajar con specs

Antes de modificar cualquier archivo:

1. Lee `specs/.specs/07-workflows/task.md` si existe.
2. Lee specs de negocio.
3. Lee specs de arquitectura.
4. Lee specs de base de datos.
5. Lee APIs relacionadas.
6. Lee UI relacionada.
7. Lee modulo especifico en `specs/modules/<modulo>/spec.md`.
8. Identifica contradicciones.
9. Actualiza specs antes que codigo.

---

## Definition of Ready
Una tarea esta lista si:
- Tiene objetivo claro.
- Tiene specs relacionados.
- Tiene dependencias completadas.
- No contradice arquitectura.
- No contradice el canon `SaleDocument` vs `BillingRequest`.
- No contradice el canon de inventario de rutas con `ROUTE_STOCK`.
- No contradice el canon financiero donde `Payment` es la unica fuente monetaria.
- El alcance es pequeno y verificable.
- No quedan decisiones de negocio bloqueantes.
---

## Definition of Done
Una tarea esta terminada si:
- Compila cuando hay codigo.
- No tiene errores TypeScript.
- Respeta estructura.
- Respeta permisos.
- Respeta rutas API.
- Respeta reglas de negocio.
- Incluye validaciones.
- Incluye manejo de errores.
- Incluye pruebas cuando aplica.
- Incluye pruebas de transaccion, idempotencia o concurrencia cuando el caso toca dinero, inventario, cierres o liquidaciones.
- No rompe tareas anteriores.
- Documenta cambios relevantes.

## Gobierno documental de modulos
Consultar únicamente cuando sea necesario:
docs/documents.md

---

## Comandos de validacion conocidos
Consultar únicamente cuando sea necesario:

docs/validation.md
---

## Decisiones abiertas actuales
Consultar únicamente cuando sea necesario:

docs/open-decisions.md
---

## Prohibiciones para agentes
No hagas lo siguiente:
- No inventes pantallas, endpoints o entidades sin spec.
- No programes si el usuario pidio solo prompts/specs.
- No crees stock global.
- No llames factura fiscal a tickets/notas internas.
- No implementes CFDI/SAT/PAC.
- No actives PaymentAllocation multi-cuenta en MVP.
- No integres basculas/hardware en MVP.
- No escondas diferencias de inventario o caja; deben reportarse.
- No borres trazabilidad historica de precios, clientes o productos.
- No hardcodees secretos.
- No subas `.env`.
---
