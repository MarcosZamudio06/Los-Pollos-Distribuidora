# Module Spec — Auth

## Objetivo

Gestionar autenticación, sesión y autorización del sistema.

## Funcionalidades

- Login.
- Refresh token.
- Logout.
- Obtener usuario autenticado.
- Protección de rutas.
- Validación de permisos y políticas de alcance.

## Entidades involucradas

- User.
- Role.
- Permission.
- RolePermission.
- AuthSession.

## Endpoints

- POST /api/auth/login
- POST /api/auth/refresh
- POST /api/auth/logout
- GET /api/auth/me
- GET /api/permissions
- GET /api/roles
- GET /api/roles/:id
- PATCH /api/roles/:id/permissions
- GET /api/users/:id/access
- PATCH /api/users/:id/access-profile
- POST /api/users/:id/sessions/revoke
- GET /api/access-control/audit-logs

## Reglas de negocio

- No permitir login de usuarios inactivos.
- Para login público, correo inexistente, contraseña incorrecta y cuenta inactiva
  producen el mismo 401 `Invalid credentials`, incluida cuenta inactiva con clave
  correcta. Decisión de seguridad ERP-PREPROD-SECURITY-REMEDIATION-003: sustituye
  el antiguo 403 específico; el estado real se conserva sólo para observabilidad
  interna autorizada. Cada intento permitido ejecuta una comparación bcrypt,
  usando un hash señuelo coste 12 cuando no existe el correo, sin prometer tiempo
  constante absoluto. Los límites por cuenta/IP siguen vigentes.
- No devolver passwordHash.
- Access token debe expirar.
- Refresh token debe expirar.
- Cada login debe crear una sesión persistente independiente.
- Los refresh tokens deben persistirse únicamente como hash y rotarse en cada renovación.
- La reutilización de un refresh token rotado debe revocar la sesión comprometida.
- Logout debe revocar la sesión actual en el servidor.
- El cambio de contraseña debe incrementar la versión de sesión y revocar todas las sesiones del usuario.
- Las sesiones deben aplicar expiración absoluta y por inactividad.
- El access token debe mantenerse únicamente en memoria del cliente.
- El refresh token debe enviarse en cookie `HttpOnly`, `Secure` en producción y `SameSite=Strict`.
- Endpoints protegidos deben validar JWT.
- La autenticación es global por defecto. Una ruta solo puede omitirla con `@Public()`.
- Toda ruta no pública debe declarar explícitamente `@Authenticated()` o `@RequirePermissions(...)`; una ruta sin clasificación debe rechazarse.
- Las acciones restringidas deben validar permisos atómicos, no nombres de rol distribuidos.
- Los permisos se resuelven desde la sesión y la base de datos en cada validación de token; no se confía en permisos persistidos dentro del JWT.
- Las políticas de recurso validan adicionalmente ubicación operativa, propiedad, estado y versión cuando aplique.
- La interfaz puede ocultar controles con base en capacidades efectivas, pero el backend es la autoridad.
- Los cambios de perfil o permisos deben ser auditables y revocar o invalidar las sesiones afectadas antes de surtir efecto.
- Los roles representan perfiles de trabajo y agrupan permisos; un rol técnico no recibe permisos financieros por implicación.
- La primera versión solo administra perfiles canónicos; no permite crear, eliminar ni renombrar perfiles.
- Una mutación de perfil requiere versión esperada y motivo obligatorio.
- Un actor no puede conceder permisos que no posee.
- Cambiar permisos de un perfil incrementa la versión, incrementa `sessionVersion` de sus usuarios y revoca sus sesiones activas.
- Reasignar un perfil o revocar sesiones incrementa `sessionVersion` y revoca las sesiones activas del usuario.
- Debe permanecer al menos un usuario activo con `access_profiles.manage` y al menos uno con `users.manage`.
- La auditoría de acceso es append-only y no almacena tokens, hashes ni contraseñas.
- Alta, actualización, desactivación, restablecimiento de contraseña y cambios de perfil/permisos serializan la autoridad de acceso mediante un bloqueo transaccional común. La autoridad vigente del actor y su sesión se leen de PostgreSQL después del bloqueo; no se usan los permisos declarados por el cliente ni un principal anterior a la espera.
- Crear o restablecer un usuario exige dominar los permisos del perfil destino. El perfil ADMIN también exige un actor ADMIN vigente por sus facultades heredadas por rol. La asignación de perfil valida tanto el perfil actual como el nuevo.
- Fleet, Sales y CEDIS autentican en middleware de namespace antes de suscribirse. Cada conexión pertenece a authSessionId; logout/reutilización de refresh revoca solo esa sesión, mientras contraseña, desactivación y cambios de acceso invalidan todas las sesiones afectadas después de persistir.
- Los eventos protegidos no se entregan tras el vencimiento efectivo JWT/absoluto/inactivo. Un registro central en memoria controla vencimiento y revalida acceso/rooms como máximo cada 30 segundos sin consultas por evento; las notificaciones de cambios de acceso son inmediatas dentro de la instancia activa.
- No se conserva connection-state recovery de paquetes protegidos: una reconexión reautentica y reconstruye por REST. No se prometen propagación entre réplicas ni revocación de paquetes ya enviados antes de la frontera de seguridad.

- Toda mutación ordinaria de acceso conserva al menos un ADMIN activo con users.manage y access_profiles.manage, además de titulares activos de users.manage y access_profiles.manage. Es una invariante de seguridad: los permisos atómicos no reemplazan facultades heredadas exclusivas del rol ADMIN; nunca se promueve otro perfil automáticamente.
- El cambio de contraseña propia verifica la credencial previa y confirma sesión, estado activo y versión/credencial en la transacción de escritura. Un reset, desactivación o cambio competidor confirmado rechaza la solicitud obsoleta sin sobrescribir credenciales ni revocar sesiones adicionales. Bcrypt se calcula fuera del bloqueo común.
- Las autorizaciones en vuelo se invalidan únicamente por su sesión o usuario; los intentos aún sin identidad se revalidan sin rechazar sesiones ajenas. El registro conserva solo conexiones e intentos en vuelo, no un historial de sesiones revocadas.
- Una desconexión de namespace no implica reconexión automática. El cliente puede intentar una sola recuperación explícita por suscripción tras validar el mismo token con REST, sin refresh automático; un token revocado no se reconecta. La reconexión de transporte mantiene el backoff existente.
- Tras conectar o recibir cambios se cancela el snapshot REST obsoleto antes de iniciar una lectura autoritativa. Fleet conserva los deltas GPS recibidos durante la lectura; Sales protege los eventos nuevos frente a respuestas antiguas; CEDIS reconstruye desde REST sin replay protegido.

## Permisos

- Login público.
- Me requiere autenticación.
- Logout requiere autenticación.
- Refresh requiere la cookie de refresh válida.
- Permisos CEDIS: `cedis.view`, `cedis.manage`, `cedis.dispatch`, `cedis.receive_supplies`, `cedis.request_returns`, `cedis.receive_returns`, `cedis.reconcile`, `cedis.close`, `cedis.view_costs`.
- `ADMIN` recibe todos los permisos CEDIS. `WAREHOUSE` recibe consulta, despacho, solicitud de devoluciones y recepción de suministros y devoluciones; `SELLER` recibe consulta, recepción de suministros y solicitud de devoluciones únicamente dentro de su sucursal. `cedis.request_returns` no concede recepción/completado en CEDIS; esa transición conserva `cedis.receive_returns`. `cedis.view_costs` no sustituye ni concede `costs.read`.
- Permisos de caja propia: `cash_shift.open_own` permite consultar terminales propias, consultar el turno actual y abrir un turno en la ubicación asignada; `cash_shift.close_own` permite cerrar únicamente el turno propio con el dispositivo registrado.
- `collections.receive_cash` permite registrar pagos `CASH` de cobranza en ubicación fija. `COLLECTIONS` recibe `collections.receive_cash`, `cash_shift.open_own` y `cash_shift.close_own`; `SELLER` conserva los dos permisos de turno propio; ningún rol operativo recibe por implicación `cash_shifts.administrative_close`, reapertura de turnos, movimientos de caja ni ventas POS adicionales.

## UI

- Pantalla login.
- Access token únicamente en memoria; ningún token se persiste en `localStorage` o almacenamiento accesible por JavaScript.
- Redirección según autenticación.
- Pantalla 403 para acceso denegado.

## Pruebas mínimas

- Login exitoso.
- Login con contraseña incorrecta.
- Usuario inactivo no puede entrar.
- Ruta no pública sin token falla.
- Ruta sin clasificación de acceso falla la prueba arquitectónica.
- Usuario sin permiso recibe 403.
- Un perfil técnico no puede ejecutar acciones financieras sensibles.
