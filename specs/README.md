# Specs del Proyecto — Sistema Distribuidora de Pollos

Fecha de creación: 2026-06-17

Este paquete contiene las especificaciones base para desarrollar el sistema mediante **Spec Driven Development** usando OpenCode, Gentleman AI, Codex u otro orquestador de agentes.

Los specs son la fuente de verdad del proyecto.

---

## Principio principal

Los archivos `.md` en `specs/.specs/` y `specs/modules/` gobiernan el desarrollo del sistema.

El código debe ajustarse a estas especificaciones. Si se requiere cambiar una regla de negocio, una entidad, una ruta API o una pantalla, primero debe actualizarse el spec correspondiente.

---

## Principio de contexto mínimo por TASK

Una TASK no debe cargar toda la documentación del proyecto.

El agente debe iniciar por el manifiesto operativo de la TASK activa:

```text
.specs/07-workflows/task/action.md
```

Después debe leer únicamente los specs requeridos explícitamente por esa TASK.

Los documentos globales, históricos o auxiliares solo deben abrirse si la TASK los menciona, si hay contradicción o si una validación falla por información no visible en el contexto cargado.

---

## Estructura

```text
.specs/
  00-business/
  01-architecture/
  02-database/
  03-api/
  04-ui/
  05-testing/
  06-deployment/
  07-workflows/

modules/
  accounts-receivable/
  auth/
  billing-requests/
  clientes/
  compras/
  inventory/
  point-of-sale-closing/
  reports/
  route-settlements/
  routes-delivery/
  sales/
  sales-documents/
  usuarios/

modules deprecated aliases:
  facturacion/
  inventario/
  reportes/
  routes/
  rutas-reparto/
  ventas/
```

---

## Orden recomendado de ejecución con IA

Para una TASK concreta:

1. Leer `AGENTS.md`.
2. Leer `.specs/07-workflows/task/action.md`.
3. Leer solo los specs listados en la TASK activa.
4. Buscar en specs grandes únicamente las secciones afectadas.
5. Leer los archivos de código relacionados.
6. Leer o ejecutar solo las pruebas relacionadas.
7. Reportar contradicciones antes de implementar cambios fuera del alcance.

No leer por defecto:

```text
.specs/07-workflows/task.md completo
.specs/07-workflows/implementation-plan.md completo
.specs/02-database/database.md completo
.specs/02-database/entities.md completo
.specs/05-testing/testing-strategy.md completo
.specs/05-testing/acceptance-criteria.md completo
openspec/changes/archive/
structure/architecture-summary.md
docs/ completos
```

---

## Cuándo leer documentos globales

Leer documentos globales únicamente si:

- la TASK es de arquitectura;
- la TASK es de base de datos transversal;
- la TASK es de testing global;
- la TASK es de documentación;
- la TASK indica explícitamente esos archivos;
- existe una contradicción documental;
- falta una regla necesaria para validar la implementación.

---

## Stack definido

- Frontend: React, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS.
- Backend: NestJS, TypeScript, Prisma, PostgreSQL.
- Seguridad: JWT, Refresh Tokens, RBAC.
- Infraestructura: Docker, Nginx, PostgreSQL.

---

## Relación con OpenSpec

`openspec/` conserva cambios SDD activos e históricos.

No debe leerse por defecto para implementar una TASK ordinaria.

Debe consultarse solo cuando:

- el usuario lo pida;
- la TASK indique un cambio OpenSpec;
- exista un cambio activo relacionado;
- se requiera auditar una decisión histórica.

---

## Relación con docs

`docs/` contiene material auxiliar de lectura corta.

No sustituye los specs canónicos.

Usar `docs/` solo como apoyo para glosario, reglas resumidas, comandos, estados o decisiones abiertas cuando una TASK lo requiera.
