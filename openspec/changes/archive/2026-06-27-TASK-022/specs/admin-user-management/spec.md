# Especificación — Administración de usuarios por ADMIN

## Propósito

Define la administración backend de usuarios internos. Todos los endpoints de Users DEBEN estar disponibles solo para usuarios ADMIN activos y nunca DEBEN exponer credenciales.

## Requisitos

### Requisito: Persistencia de estado administrativo del usuario

El modelo `User` DEBE persistir `mustChangePassword` booleano, `deactivatedAt` timestamp nullable, `deactivatedByUserId` referencia nullable al actor y `deactivationReason` texto opcional/nullable.

#### Escenario: Valores iniciales tras actualización

- DADO usuarios existentes sin esos campos históricos
- CUANDO el sistema opera después de la actualización
- ENTONCES DEBEN tratarse como `mustChangePassword=false`
- Y DEBEN tener campos de desactivación en `null`

### Requisito: Acceso administrativo exclusivo

El sistema DEBE restringir `GET /api/users`, `GET /api/users/:id`, `POST /api/users`, `PATCH /api/users/:id`, `PATCH /api/users/:id/password` y `DELETE /api/users/:id` a usuarios ADMIN activos.

#### Escenario: ADMIN accede a Users

- DADO un usuario ADMIN activo autenticado
- CUANDO solicita cualquier endpoint de Users
- ENTONCES el sistema procesa la solicitud según permisos y reglas del endpoint

#### Escenario: Rol no ADMIN es rechazado

- DADO un usuario autenticado sin rol ADMIN
- CUANDO solicita cualquier endpoint de Users
- ENTONCES el sistema DEBE rechazar el acceso

### Requisito: Listado con usuarios activos por defecto

El sistema DEBE listar solo usuarios activos en `GET /api/users` por defecto. Los usuarios inactivos DEBEN aparecer solo con filtro explícito `status=inactive`, `status=all` o `includeInactive=true`.

#### Escenario: Listado predeterminado

- DADO usuarios activos e inactivos registrados
- CUANDO ADMIN consulta `GET /api/users` sin filtros de inactivos
- ENTONCES la respuesta DEBE incluir solo usuarios activos

#### Escenario: Inclusión explícita de inactivos

- DADO usuarios activos e inactivos registrados
- CUANDO ADMIN consulta con `status=inactive`, `status=all` o `includeInactive=true`
- ENTONCES la respuesta DEBE respetar el filtro solicitado

### Requisito: Consulta segura por identificador

El sistema DEBE devolver usuarios por `GET /api/users/:id` sin incluir `passwordHash` ni datos equivalentes de credenciales.

#### Escenario: Usuario existente consultado

- DADO un usuario existente
- CUANDO ADMIN consulta `GET /api/users/:id`
- ENTONCES la respuesta DEBE incluir datos administrativos permitidos
- Y NO DEBE incluir `passwordHash`

### Requisito: Creación con email único y contraseña temporal segura

El sistema DEBE crear usuarios con email único, contraseña temporal segura, contraseña almacenada como hash y `mustChangePassword=true` persistido.

#### Escenario: Usuario creado correctamente

- DADO un email no registrado y una contraseña temporal válida
- CUANDO ADMIN crea el usuario
- ENTONCES el usuario DEBE quedar activo con `mustChangePassword=true`
- Y la respuesta NO DEBE exponer contraseña ni hash

#### Escenario: Email duplicado rechazado

- DADO un email ya registrado
- CUANDO ADMIN intenta crear otro usuario con ese email
- ENTONCES el sistema DEBE rechazar la creación

### Requisito: Edición de rol con protección del último ADMIN

El sistema DEBE permitir editar `roleId` solo a ADMIN y DEBE impedir cualquier cambio que deje cero ADMIN activos, incluyendo la auto-democión del último ADMIN activo.

#### Escenario: Cambio de rol permitido

- DADO al menos dos ADMIN activos
- CUANDO un ADMIN cambia el rol de un usuario permitido
- ENTONCES el sistema DEBE guardar el cambio

#### Escenario: Último ADMIN protegido

- DADO un único ADMIN activo
- CUANDO ese ADMIN intenta auto-degradarse o perder el rol ADMIN
- ENTONCES el sistema DEBE rechazar el cambio

### Requisito: Cambio administrativo de contraseña

El sistema DEBE permitir a ADMIN establecer contraseña temporal con política mínima, marcar `mustChangePassword=true` y no exponer contraseña ni hash.

#### Escenario: Contraseña temporal válida

- DADO un usuario existente y una contraseña temporal que cumple la política mínima
- CUANDO ADMIN cambia la contraseña
- ENTONCES el sistema DEBE guardar la nueva credencial de forma segura
- Y DEBE marcar `mustChangePassword=true`

#### Escenario: Contraseña temporal débil

- DADO una contraseña temporal que no cumple la política mínima
- CUANDO ADMIN solicita el cambio
- ENTONCES el sistema DEBE rechazar la solicitud

### Requisito: Baja lógica sin eliminación física

El sistema DEBE ejecutar `DELETE /api/users/:id` como baja lógica con `isActive=false`, `deactivatedAt`, `deactivatedByUserId` y `deactivationReason` opcional/nullable. El sistema NO DEBE eliminar físicamente usuarios.

#### Escenario: Usuario desactivado

- DADO un usuario activo que no es el último ADMIN activo
- CUANDO ADMIN solicita la baja
- ENTONCES el usuario DEBE quedar inactivo con `deactivatedAt` y `deactivatedByUserId`
- Y DEBE guardar `deactivationReason` si fue proporcionada

#### Escenario: Baja lógica sin razón

- DADO un usuario activo permitido para baja
- CUANDO ADMIN lo desactiva sin razón
- ENTONCES el usuario DEBE quedar inactivo con `deactivationReason=null`

#### Escenario: Baja del último ADMIN bloqueada

- DADO un único ADMIN activo
- CUANDO se solicita desactivarlo o eliminarlo lógicamente
- ENTONCES el sistema DEBE rechazar la operación
