# Reglas para Agentes de IA

## Fuente de verdad

Los specs son la fuente única de verdad.

El agente no debe inventar reglas, rutas, entidades, pantallas o permisos que contradigan estos documentos.

## Reglas obligatorias

- No cambiar arquitectura sin actualizar `.specs/01-architecture/architecture.md`.
- No crear endpoints no definidos en `.specs/03-api/`.
- No modificar entidades sin actualizar `.specs/02-database/database.md`.
- No cambiar reglas de negocio sin actualizar `.specs/00-business/business-rules.md`.
- No crear carpetas fuera de `.specs/01-architecture/folder-structure.md`.
- No usar JavaScript; usar TypeScript.
- No usar `any` salvo justificación.
- No omitir validaciones.
- No omitir pruebas para lógica crítica.
- No mezclar responsabilidades de módulos.
- No dejar código incompleto con comentarios tipo `TODO` sin documentarlo.
- No generar archivos duplicados que hagan lo mismo.
- No planear ni actualizar trabajo nuevo usando módulos deprecated si existe un spec canónico.
- No iniciar implementación si contradice el canon de `SaleDocument/BillingRequest`, `ROUTE_STOCK` o `Payment` como única fuente monetaria.

## Comportamiento esperado del agente

Antes de implementar:

1. Leer spec global.
2. Leer spec del módulo.
3. Identificar entidades involucradas.
4. Identificar endpoints.
5. Identificar permisos.
6. Implementar.
7. Validar.
8. Documentar cambios.

## Formato de salida esperado al implementar

Cada respuesta de implementación debe incluir:

```text
Archivos creados:
- ruta/archivo.ts: propósito

Archivos modificados:
- ruta/archivo.ts: cambio realizado

Validaciones incluidas:
- descripción

Pruebas sugeridas o creadas:
- descripción

Notas:
- riesgos, pendientes o decisiones tomadas
```

## Prohibiciones

- No crear una aplicación completa en una sola respuesta.
- No generar módulos sin spec.
- No crear un nuevo spec duplicado para inventory, sales, reports o routes/delivery.
- No ignorar errores de TypeScript.
- No hardcodear credenciales.
- No guardar secretos en repositorio.
- No exponer contraseñas.
