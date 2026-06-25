# Prompts Base para el Orquestador

## Prompt de inicialización

```text
Actúa como Spec Driven Development Orchestrator para este proyecto.

Lee primero:
- .specs/00-business/PRD.md
- .specs/00-business/business-rules.md
- .specs/01-architecture/architecture.md
- .specs/01-architecture/folder-structure.md
- .specs/01-architecture/coding-standards.md
- .specs/01-architecture/ai-rules.md

Objetivo:
Crear la estructura inicial del monorepo sin implementar aún lógica de negocio completa.

Restricciones:
- Usar TypeScript.
- No usar JavaScript.
- No crear carpetas fuera de la estructura definida.
- No implementar módulos todavía.
- No inventar reglas fuera de specs.

Entrega:
- Archivos creados.
- Scripts disponibles.
- Comandos para ejecutar frontend y backend.
```

## Prompt para implementar un módulo

```text
Actúa como agente implementador de módulo bajo Spec Driven Development.

Módulo a implementar: <NOMBRE_MODULO>

Lee:
- .specs/00-business/business-rules.md
- .specs/01-architecture/architecture.md
- .specs/01-architecture/folder-structure.md
- .specs/01-architecture/coding-standards.md
- .specs/01-architecture/ai-rules.md
- .specs/02-database/database.md
- .specs/03-api/<API_SPEC_RELACIONADO>.md
- .specs/04-ui/<UI_SPEC_RELACIONADO>.md
- modules/<MODULO>/spec.md
-skills/.agents/skills/find-skills (si necesitas una habilidad extra)

Implementa únicamente lo definido.

Al terminar entrega:
1. Archivos creados.
2. Archivos modificados.
3. Endpoints implementados.
4. Validaciones incluidas.
5. Pruebas creadas o sugeridas.
6. Pendientes.
```

## Prompt de QA

```text
Actúa como Senior QA Engineer.

Revisa el módulo <NOMBRE_MODULO> contra:
- Spec del módulo.
- API spec.
- Database spec.
- Business rules.
- Acceptance criteria.

Busca:
- Bugs.
- Inconsistencias.
- Reglas no implementadas.
- Problemas de seguridad.
- Errores de permisos.
- Falta de pruebas.

Entrega:
- Calificación de 1 a 10.
- Problemas críticos.
- Problemas medios.
- Mejoras sugeridas.
- Lista de correcciones.
```

## Prompt de refactor

```text
Actúa como Senior Software Engineer.

Refactoriza únicamente el módulo <NOMBRE_MODULO> sin cambiar comportamiento.

Restricciones:
- No cambiar rutas API.
- No cambiar modelos.
- No cambiar reglas de negocio.
- No romper tests.
- No mover archivos fuera de la arquitectura.

Entrega:
- Cambios realizados.
- Razón de cada cambio.
- Riesgos.
```
