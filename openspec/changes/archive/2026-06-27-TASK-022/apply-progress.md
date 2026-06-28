# Apply Progress: TASK-022 — Implementar Users backend

## Estado del lote

- Modo: Strict TDD.
- Artifact store solicitado: hybrid.
- Persistencia Engram: no disponible en el tooling actual; se persistió en OpenSpec filesystem y se reporta esta limitación.
- Estrategia de entrega: PRs encadenados, `stacked-to-main`.
- Work Unit actual: 3 — Exponer endpoints ADMIN y verificación final.
- Boundary aplicado: tareas 1.1 a 5.2 acumuladas; este lote implementó únicamente 4.1 a 5.2.
- Fuera de alcance respetado: no se tocó frontend, `.env.example`, secretos ni `backend/dist/**` como artefacto persistido.

## Tareas completadas

- [x] 1.1 Relectura de specs requeridos y diseño; no se detectaron conflictos bloqueantes.
- [x] 1.2 RED de contrato Prisma para `mustChangePassword` y campos nullable de baja.
- [x] 1.3 GREEN de schema Prisma y migración no destructiva.
- [x] 2.1 RED de Auth para usuarios inactivos y `mustChangePassword`.
- [x] 2.2 GREEN de Auth service/types/guard/module.
- [x] 2.3 REFACTOR de respuestas/excepciones Auth sin crear rutas nuevas.
- [x] 3.1 RED de `UsersService` para email único, hash, sanitización, filtros, último ADMIN y baja lógica.
- [x] 3.2 GREEN de `UsersModule`, `UsersService` y DTOs de users.
- [x] 3.3 REFACTOR de `toUserResponse()` y transacciones de último ADMIN en `UsersService`.
- [x] 3.4 Remediación WU2 de hallazgos fresh review: último ADMIN serializable, validación estricta de `includeInactive` y manejo `P2002`.
- [x] 4.1 RED de `UsersController` para endpoints ADMIN-only, validación DTO, wrapper y ausencia de credenciales.
- [x] 4.2 GREEN de `UsersController`, registro en `UsersModule` e import de `UsersModule` en `AppModule`.
- [x] 4.3 REFACTOR de rutas `GET/POST/PATCH/DELETE /api/users` y mensajes seguros sin exponer credenciales.
- [x] 5.1 Verificación con `npm --prefix backend test` y `npm --prefix backend run build`.
- [x] 5.2 Confirmación de alcance: sin cambios en frontend, `.env.example`, secretos ni `backend/dist/**` persistido.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | N/A | Spec review | ✅ 11/11 focused baseline | N/A — tarea de lectura | ✅ Sin conflicto bloqueante | N/A | N/A |
| 1.2 | `backend/src/prisma/schema.contract.spec.ts` | Unit/contract | ✅ 11/11 focused baseline | ✅ Test escrito primero; falló por migración/campos faltantes | ✅ Incluido en focused run 15/15 | ✅ Campos schema + migración SQL + relación de auditoría | ✅ Sin refactor adicional necesario |
| 1.3 | `backend/src/prisma/schema.contract.spec.ts` | Unit/contract | ✅ 11/11 focused baseline | ✅ Cubierto por RED de 1.2 | ✅ Focused run 15/15 | ✅ Default no destructivo y columnas nullable | ✅ Migración mínima no destructiva |
| 2.1 | `backend/src/modules/auth/auth.service.spec.ts`, `backend/src/modules/auth/jwt-auth.guard.spec.ts` | Unit | ✅ 11/11 focused baseline | ✅ Tests escritos primero; fallaron por flag ausente y guard permisivo | ✅ Focused run 15/15 | ✅ Login normal, login con cambio pendiente, refresh inactivo y guard con cambio pendiente | ✅ Excepciones consistentes |
| 2.2 | `backend/src/modules/auth/auth.service.spec.ts`, `backend/src/modules/auth/jwt-auth.guard.spec.ts` | Unit | ✅ 11/11 focused baseline | ✅ Cubierto por RED de 2.1 | ✅ Focused run 15/15 | ✅ Propagación de flag + bloqueo de protected access | ✅ Tipos y exports mínimos |
| 2.3 | `backend/src/modules/auth/auth.service.spec.ts`, `backend/src/modules/auth/jwt-auth.guard.spec.ts` | Unit | ✅ 11/11 focused baseline | ✅ Cubierto por RED de 2.1 | ✅ `npm --prefix backend test` 39/39 | ✅ Casos activos/inactivos/password pendiente | ✅ No se crearon rutas fuera de TASK-022 |
| 3.1 | `backend/src/modules/users/users.service.spec.ts` | Unit | ✅ 11/11 focused Auth baseline | ✅ Test escrito primero; falló por `Cannot find module './users.service'` | ✅ Focused run 7/7 después de implementación | ✅ 7 escenarios: email único, password débil, hash, sanitización, filtros, último ADMIN, baja lógica y not found | ✅ Ajuste de setup del test para aislar conflicto de email real |
| 3.2 | `backend/src/modules/users/users.service.spec.ts` | Unit | N/A — archivos nuevos | ✅ Cubierto por RED de 3.1 contra servicio/DTOs inexistentes | ✅ Focused run 7/7; full backend 47/47 | ✅ Create/update/password/deactivate/list/findOne con Prisma mock | ✅ `export type` para `UserStatusFilter` por `isolatedModules` |
| 3.3 | `backend/src/modules/users/users.service.spec.ts` | Unit | ✅ 7/7 focused antes de refactor | ✅ Cubierto por RED de 3.1 | ✅ Focused run 7/7 y build backend passing | ✅ Transacciones para democión y baja del último ADMIN | ✅ `toUserResponse()` centralizado y helper `assertNotLastActiveAdmin()` compartido |
| 3.4 | `backend/src/modules/users/users.service.spec.ts`, `backend/src/modules/users/dto/list-users-query.dto.spec.ts` | Unit/DTO | ✅ Focused users baseline reprodujo fresh review | ✅ Tests agregados primero; fallaron por transacción sin `Serializable`, `includeInactive=maybe` convertido a `false` y `P2002` sin mapear | ✅ Focused run 10/10, full backend 50/50 y build backend passing | ✅ Opciones Prisma `Serializable` en democión/baja último ADMIN, strings booleanos estrictos y carreras `P2002` create/update | ✅ Cambios mínimos, sin controller/endpoints ni frontend |
| 4.1 | `backend/src/modules/users/users.controller.spec.ts` | API/controller | N/A — archivo nuevo | ✅ Test escrito primero; falló por `Cannot find module './users.controller'` | ✅ Focused run 13/13 después de crear controller | ✅ 13 casos: seis rutas ADMIN-only, listado, consulta, creación válida, creación inválida, edición, password y baja lógica | ✅ Assertions verifican wrapper y ausencia de `passwordHash`/contraseñas |
| 4.2 | `backend/src/modules/users/users.controller.spec.ts` | API/controller | ✅ RED de 4.1 capturado | ✅ Cubierto por RED de 4.1 contra controller inexistente | ✅ Focused run 13/13; `UsersModule` registra controller e importa `AuthModule`; `AppModule` importa `UsersModule` | ✅ Rutas `GET`, `POST`, `PATCH`, `PATCH password` y `DELETE` ejercitadas vía Supertest | ✅ Wiring mínimo sin agregar endpoints fuera de TASK-022 |
| 4.3 | `backend/src/modules/users/users.controller.spec.ts`, `backend/src/modules/users/users.service.spec.ts` | API/controller | ✅ 13/13 controller focused | ✅ Cubierto por pruebas de mensajes/wrapper/credenciales de 4.1 | ✅ Focused run controller+service 22/22 | ✅ Mensajes seguros y contrato `/api/users` verificados sin exponer `passwordHash` ni temporary passwords | ✅ Ajuste en `UsersService` para usar literal tipado `'Serializable'` y evitar acceso runtime a `Prisma` en tests con mock parcial |
| 5.1 | Suite backend completa | Verification | ✅ Focused controller+service 22/22 | N/A — tarea de verificación final | ✅ `npm --prefix backend test` 63/63 y `npm --prefix backend run build` passing | ✅ Full suite + build | ✅ Artefactos `backend/dist/**` generados por build fueron revertidos/eliminados |
| 5.2 | Git working tree audit | Scope audit | ✅ `git status --short` revisado | N/A — tarea de auditoría | ✅ Confirmado sin cambios frontend, `.env.example`, secretos ni `backend/dist/**` persistido | ✅ Revisión de alcance posterior a build | ✅ Sin refactor adicional necesario |

## Test Summary

- Total tests written/updated: 25 escenarios principales acumulados; este lote agregó 13 escenarios API/controller de `UsersController`.
- Total tests passing: 63/63 con `npm --prefix backend test`.
- Layers used: Unit/contract/API controller.
- Approval tests: None — no refactor puro de comportamiento existente sin cambio de spec.
- Pure functions created: 0.

## Remediation Evidence — Fresh Review Findings

- CRITICAL resuelto: se agregó cobertura en `backend/src/modules/auth/auth.service.spec.ts` para rechazar acceso protegido con un access token ya emitido cuando el usuario ahora está inactivo en base de datos.
- WARNING resuelto: se alineó `backend/prisma/schema.prisma` con la migración existente agregando `@@index([deactivatedByUserId])` en `User`; `backend/src/prisma/schema.contract.spec.ts` ahora cubre el índice para prevenir drift.
- Strict TDD evidencia: el RED enfocado pasó Auth y falló contrato Prisma por ausencia de `@@index([deactivatedByUserId])`; después del cambio mínimo de schema, el focused run quedó GREEN 13/13.
- Scope drift resuelto: se removieron los cambios fuera de alcance de `SEED_ADMIN_PASSWORD` en `.env.example` y `docker-compose.yml`; auditoría fresca confirmó que no quedan diffs en esos archivos ni en `backend/dist/**`.
- CRITICAL WU2 resuelto: `UsersService.update()` y `UsersService.deactivate()` ahora ejecutan la lectura/conteo/mutación de último ADMIN con `Prisma.TransactionIsolationLevel.Serializable`; tests assertan explícitamente las opciones de `$transaction`.
- WARNING WU2 resuelto: `ListUsersQueryDto` solo transforma booleanos reales y strings `'true'`/`'false'`; `includeInactive=maybe` permanece inválido y falla `@IsBoolean()`.
- SUGGESTION WU2 aplicado: carreras de email duplicado `P2002` durante `create`/`update` se traducen a `ConflictException('Email is already registered')` en lugar de propagarse como error inesperado.
- Strict TDD evidencia WU2: el focused run falló primero por `P2002` sin mapear, transacción sin `Serializable` y `includeInactive=maybe` convertido a `false`; después de la implementación mínima, focused run 10/10, full backend 50/50 y build passing.
- WARNING WU3 resuelto: `backend/src/modules/users/users.controller.spec.ts` ahora cubre validación HTTP para query params inválidos (`status=bad`, `includeInactive=maybe`) y payloads inválidos de `PATCH /api/users/:id`, `PATCH /api/users/:id/password` y `DELETE /api/users/:id`, verificando que no se llame al service.
- SUGGESTION WU3 aplicado: `backend/src/app.module.spec.ts` ahora assert explícitamente que `AppModule` registra `UsersModule`, además de `AuthModule`.
- CRITICAL verify resuelto: `backend/src/modules/users/users.service.spec.ts` ahora ejerce baja lógica exitosa sin `reason` y verifica que `deactivationReason` se persiste y retorna como `null`.
- WARNING verify resuelto: `backend/src/modules/users/users.service.spec.ts` ahora assert directamente que `UsersService.findAll({ status: 'all' })` consulta sin filtro `where`, además de la cobertura controller pass-through existente.
- Strict TDD evidencia verify: el RED fue una brecha de cobertura confirmada por `sdd-verify` — la implementación ya usaba `dto.reason ?? null`; al agregar la prueba de escenario requerida y la assertion de `status=all`, el focused run quedó GREEN 28/28 y la suite backend completa 69/69.
- WARNING lint resuelto: se corrigieron únicamente issues ESLint/Prettier en archivos backend de TASK-022; el changed-file ESLint equivalente quedó sin errores y se mantuvo la suite backend 69/69 con build passing.

## Comandos ejecutados

- `npm --prefix backend test -- src/prisma/schema.contract.spec.ts src/modules/auth/auth.service.spec.ts src/modules/auth/jwt-auth.guard.spec.ts` → baseline 11/11 passing.
- `npm --prefix backend test -- src/prisma/schema.contract.spec.ts src/modules/auth/auth.service.spec.ts src/modules/auth/jwt-auth.guard.spec.ts` → RED falló como esperado por campos/flag/guard faltantes.
- `npm --prefix backend test -- src/prisma/schema.contract.spec.ts src/modules/auth/auth.service.spec.ts src/modules/auth/jwt-auth.guard.spec.ts` → GREEN 15/15 passing.
- `npm --prefix backend test` → 39/39 passing.
- `npm exec prisma generate` desde `backend/` → Prisma Client regenerado localmente para validar tipos.
- `npm --prefix backend run build` → passing.
- Remediation RED: `npm --prefix backend test -- src/prisma/schema.contract.spec.ts src/modules/auth/auth.service.spec.ts` → Auth PASS; Prisma contract FAIL por falta de `@@index([deactivatedByUserId])`.
- Remediation GREEN focused: `npm --prefix backend test -- src/prisma/schema.contract.spec.ts src/modules/auth/auth.service.spec.ts` → 13/13 passing.
- Remediation full: `npm --prefix backend test` → 40/40 passing.
- Cleanup scope: `git diff -- .env.example docker-compose.yml` → sin diff después de remover `SEED_ADMIN_PASSWORD`.
- Cleanup scope: `git checkout -- backend/dist` → revertidos artefactos generados por build fuera del alcance de revisión.
- Work Unit 2 safety net: `npm --prefix backend test -- src/modules/auth/auth.service.spec.ts src/modules/auth/jwt-auth.guard.spec.ts` → 11/11 passing.
- Work Unit 2 RED: `npm --prefix backend test -- src/modules/users/users.service.spec.ts` → falló como esperado por `Cannot find module './users.service'`.
- Work Unit 2 GREEN: `npm --prefix backend test -- src/modules/users/users.service.spec.ts` → 7/7 passing.
- Work Unit 2 full test: `npm --prefix backend test` → 47/47 passing.
- Work Unit 2 build: `npm --prefix backend run build` → falló inicialmente por re-export de type con `isolatedModules`; corregido con `export type`.
- Work Unit 2 build final: `npm --prefix backend run build` → passing.
- Work Unit 2 cleanup scope: `git checkout -- backend/dist` y eliminación de artefactos no trackeados bajo `backend/dist/src/modules/users/**`; no quedan cambios en `backend/dist/**`.
- Work Unit 2 remediation RED: `npm --prefix backend test -- src/modules/users/users.service.spec.ts src/modules/users/dto/list-users-query.dto.spec.ts` → falló como esperado por `P2002` sin mapear, `$transaction` sin opciones serializables e `includeInactive=maybe` aceptado como `false`.
- Work Unit 2 remediation GREEN focused: `npm --prefix backend test -- src/modules/users/users.service.spec.ts src/modules/users/dto/list-users-query.dto.spec.ts` → 10/10 passing.
- Work Unit 2 remediation full: `npm --prefix backend test` → 50/50 passing.
- Work Unit 2 remediation build: `npm --prefix backend run build` → passing.
- Work Unit 2 remediation cleanup scope: `git checkout -- backend/dist && rm -rf backend/dist/src/modules/users` → artefactos generados revertidos/eliminados.
- Work Unit 3 RED: `npm --prefix backend test -- src/modules/users/users.controller.spec.ts` → falló como esperado por `Cannot find module './users.controller'`.
- Work Unit 3 GREEN focused: `npm --prefix backend test -- src/modules/users/users.controller.spec.ts` → 13/13 passing.
- Work Unit 3 refactor focused: `npm --prefix backend test -- src/modules/users/users.controller.spec.ts src/modules/users/users.service.spec.ts` → 22/22 passing.
- Work Unit 3 full test inicial: `npm --prefix backend test` → falló en `src/database/prisma.module.spec.ts` por mock parcial de `@prisma/client` sin `Prisma.TransactionIsolationLevel` al importar `AppModule` con `UsersModule`.
- Work Unit 3 full test final: `npm --prefix backend test` → 63/63 passing.
- Work Unit 3 build: `npm --prefix backend run build` → passing.
- Work Unit 3 cleanup scope: `git checkout -- backend/dist && rm -rf backend/dist/src/modules/users` → artefactos generados revertidos/eliminados.
- Work Unit 3 warning remediation focused: `npm --prefix backend test -- src/modules/users/users.controller.spec.ts src/app.module.spec.ts` → 19/19 passing.
- Work Unit 3 warning remediation full: `npm --prefix backend test` → 68/68 passing.
- Verify remediation focused: `npm --prefix backend test -- src/modules/users/users.service.spec.ts src/modules/users/users.controller.spec.ts` → 28/28 passing.
- Verify remediation full: `npm --prefix backend test` → 69/69 passing.
- Lint remediation format: `npx prettier --write src/modules/users/users.service.spec.ts src/modules/users/dto/list-users-query.dto.ts src/modules/users/users.controller.spec.ts src/modules/users/users.service.ts` desde `backend/` → formatted/unchanged según salida de Prettier.
- Lint remediation changed-file check: `npx eslint src/app.module.spec.ts src/app.module.ts src/common/guards/jwt-auth.guard.ts src/modules/auth/auth.module.ts src/modules/auth/auth.service.spec.ts src/modules/auth/auth.service.ts src/modules/auth/auth.types.ts src/modules/auth/jwt-auth.guard.spec.ts src/prisma/schema.contract.spec.ts src/modules/users/dto/*.ts src/modules/users/users.controller.spec.ts src/modules/users/users.controller.ts src/modules/users/users.module.ts src/modules/users/users.service.spec.ts src/modules/users/users.service.ts` desde `backend/` → passing sin output.
- Lint remediation full: `npm --prefix backend test` → 69/69 passing.
- Lint remediation build: `npm --prefix backend run build` → passing.
- Lint remediation cleanup scope: `git checkout -- backend/dist` y eliminación de artefactos no trackeados bajo `backend/dist/src/modules/users/**`; no quedan cambios persistidos en `backend/dist/**`.

## Archivos cambiados

| File | Acción | Qué se hizo |
|------|--------|-------------|
| `backend/src/prisma/schema.contract.spec.ts` | Modificado | Agregado contrato para campos de acceso/baja, migración SQL e índice de auditoría. |
| `backend/prisma/schema.prisma` | Modificado | Agregados `mustChangePassword`, campos de baja, relación self-audit e índice `deactivatedByUserId`. |
| `backend/prisma/migrations/20260626120000_add_user_access_fields/migration.sql` | Creado | Migración no destructiva para estado de acceso y auditoría de baja. |
| `backend/src/modules/auth/auth.service.spec.ts` | Modificado | RED/GREEN para flag de cambio obligatorio, login/refresh inactivo, acceso protegido tras desactivación y no exponer hash. |
| `backend/src/modules/auth/jwt-auth.guard.spec.ts` | Modificado | RED/GREEN para bloqueo de acceso protegido con `mustChangePassword=true`. |
| `backend/src/modules/auth/auth.types.ts` | Modificado | Agregado `mustChangePassword` a `AuthenticatedUser`. |
| `backend/src/modules/auth/auth.service.ts` | Modificado | Propaga `mustChangePassword` y conserva bloqueo de inactivos. |
| `backend/src/common/guards/jwt-auth.guard.ts` | Modificado | Bloquea acceso protegido normal cuando `mustChangePassword=true`. |
| `backend/src/modules/auth/auth.module.ts` | Modificado | Exporta `AuthService` y `JwtAuthGuard` para módulos posteriores. |
| `openspec/changes/TASK-022/tasks.md` | Modificado | Marcadas completadas tareas 3.1-3.3, preservando 1.1-2.3. |
| `openspec/changes/TASK-022/apply-progress.md` | Modificado | Progreso cumulative de Work Units 1-2 con evidencia TDD. |
| `backend/src/modules/users/users.service.spec.ts` | Creado | RED/GREEN unitario para email único, hash, sanitización, filtros, último ADMIN, baja lógica y usuario inexistente. |
| `backend/src/modules/users/users.module.ts` | Creado | Registra y exporta `UsersService` sin exponer controller todavía. |
| `backend/src/modules/users/users.service.ts` | Creado | Implementa reglas de negocio, DTO orchestration, hash, sanitización y transacciones de último ADMIN. |
| `backend/src/modules/users/dto/create-user.dto.ts` | Creado | DTO de creación con email, roleId y password temporal mínima. |
| `backend/src/modules/users/dto/update-user.dto.ts` | Creado | DTO de edición parcial de usuario. |
| `backend/src/modules/users/dto/update-user-password.dto.ts` | Creado | DTO para contraseña temporal mínima. |
| `backend/src/modules/users/dto/list-users-query.dto.ts` | Creado | DTO de filtros `status` e `includeInactive`. |
| `backend/src/modules/users/dto/list-users-query.dto.spec.ts` | Creado | Cubre validación estricta de `includeInactive` para booleanos y strings `true`/`false`. |
| `backend/src/modules/users/dto/deactivate-user.dto.ts` | Creado | DTO para razón opcional de baja lógica. |
| `backend/src/modules/users/dto/index.ts` | Creado | Barrel de DTOs con export type compatible con `isolatedModules`. |
| `backend/src/modules/users/users.controller.spec.ts` | Creado | Cobertura API/controller para endpoints ADMIN-only, DTO validation, wrapper y ausencia de credenciales. |
| `backend/src/modules/users/users.controller.ts` | Creado | Expone `GET/POST/PATCH/DELETE /api/users` con `JwtAuthGuard`, `RolesGuard` y `@Roles('ADMIN')`. |
| `backend/src/modules/users/users.module.ts` | Modificado | Registra `UsersController` e importa `AuthModule` para resolver guards/AuthService. |
| `backend/src/app.module.ts` | Modificado | Importa `UsersModule` para exponer los endpoints bajo el prefijo global `/api`. |
| `backend/src/modules/users/users.service.ts` | Modificado | Ajuste mínimo para mantener aislamiento serializable sin depender de `Prisma` runtime en tests con mock parcial. |
| `backend/src/modules/users/users.service.spec.ts` | Modificado | Agregada evidencia runtime para baja lógica sin razón (`deactivationReason=null`) y assertion directa de service para `status=all`. |
| `backend/src/modules/users/dto/list-users-query.dto.ts` | Modificado | Remediación lint: tipado seguro de `Transform` para evitar retornos `any` sin cambiar la transformación. |
| `backend/src/modules/users/users.controller.spec.ts` | Modificado | Remediación lint: tipado local del body de Supertest antes de assertions. |
| `backend/src/modules/users/users.service.spec.ts` | Modificado | Remediación lint: mocks sin `require-await`, argumentos de mock tipados vía `unknown` y matchers Prettier-compliant. |
| `backend/src/modules/users/users.service.ts` | Modificado | Remediación lint: `toUserResponse()` construye respuesta segura explícita sin variable descartada. |

## Desviaciones del diseño

None — la implementación sigue el diseño acumulado. Work Unit 3 agregó `UsersController`, registró `UsersModule` en `AppModule` y preservó el contrato seguro sin exponer credenciales.

## Issues encontrados

- Engram no estuvo disponible en el tooling actual; no se pudo persistir el artefacto híbrido en memoria persistente.
- `npm --prefix backend run build` requirió regenerar Prisma Client localmente después de editar schema para que TypeScript reconociera `mustChangePassword`.
- `npm --prefix backend run build` genera artefactos en `backend/dist/**`; fueron revertidos/eliminados para respetar el alcance de revisión.
- El build detectó que `isolatedModules` exige `export type` para re-exportar `UserStatusFilter`; se corrigió en el barrel de DTOs.
- Work Unit 3 detectó que `src/database/prisma.module.spec.ts` mockea parcialmente `@prisma/client`; al importar `AppModule` con `UsersModule`, el acceso runtime a `Prisma.TransactionIsolationLevel` fallaba. Se corrigió dentro de `UsersService` usando literal tipado para conservar la opción serializable sin tocar el test legacy.
- Verify detectó brecha de evidencia, no falla de implementación: `UsersService.deactivate()` ya persistía `dto.reason ?? null`, pero faltaba una prueba passing específica para el escenario de spec “Baja lógica sin razón”.
- Lint remediation detectó que `npm --prefix backend run build` vuelve a generar `backend/dist/**`; los artefactos generados fueron revertidos/eliminados después de verificar build.

## Tareas restantes

- Ninguna. TASK-022 queda listo para `sdd-verify`.
