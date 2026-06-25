# Specs del Proyecto — Sistema Distribuidora de Pollos

Fecha de creación: 2026-06-17

Este paquete contiene las especificaciones base para desarrollar el sistema mediante **Spec Driven Development** usando OpenCode, Gentleman AI u otro orquestador de agentes.

## Principio principal

Los archivos `.md` son la fuente de verdad del proyecto.

El código debe ajustarse a estas especificaciones. Si se requiere cambiar una regla de negocio, una entidad, una ruta API o una pantalla, primero debe actualizarse el spec correspondiente.

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
  auth/
  usuarios/
  inventario/
  ventas/
  compras/
  clientes/
  rutas-reparto/
  facturacion/
  reportes/
```

## Orden recomendado de ejecución con IA

1. Leer `.specs/00-business/PRD.md`
2. Leer `.specs/01-architecture/architecture.md`
3. Leer `.specs/01-architecture/ai-rules.md`
4. Leer `.specs/02-database/database.md`
5. Leer el `modules/<modulo>/spec.md` correspondiente
6. Implementar el módulo
7. Validar contra `.specs/05-testing/testing-strategy.md`
8. Documentar cambios realizados

## Stack definido

- Frontend: React, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS
- Backend: NestJS, TypeScript, Prisma, PostgreSQL
- Seguridad: JWT, Refresh Tokens, RBAC
- Infraestructura: Docker, Nginx, PostgreSQL
