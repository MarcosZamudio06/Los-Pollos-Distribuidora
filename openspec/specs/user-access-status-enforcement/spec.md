# Especificación — Cumplimiento de estado de acceso de usuarios

## Propósito

Define cómo Auth y los accesos protegidos deben respetar el estado operativo del usuario y la obligación de cambio de contraseña inicial.

## Requisitos

### Requisito: Bloqueo inmediato de usuarios inactivos

El sistema DEBE impedir de forma inmediata que usuarios con `isActive=false` inicien sesión o accedan a endpoints protegidos.

#### Escenario: Login de usuario inactivo

- DADO un usuario registrado con `isActive=false`
- CUANDO intenta iniciar sesión con credenciales válidas
- ENTONCES el sistema DEBE rechazar la autenticación

#### Escenario: Acceso protegido tras desactivación

- DADO un usuario autenticado que fue desactivado
- CUANDO intenta acceder a un endpoint protegido
- ENTONCES el sistema DEBE rechazar el acceso

### Requisito: Cambio obligatorio de contraseña temporal

El sistema DEBE exigir cambio de contraseña cuando `mustChangePassword=true` persistido antes de permitir uso normal del sistema.

La única excepción de acceso protegido permitida para un usuario con `mustChangePassword=true` DEBE ser una ruta explícitamente marcada para completar el cambio de contraseña propia. Esa excepción DEBE requerir JWT válido, DEBE validar la contraseña actual, DEBE guardar la nueva contraseña como hash, DEBE persistir `mustChangePassword=false` al completarse y NO DEBE exponer `passwordHash`.

#### Escenario: Usuario con cambio pendiente inicia sesión

- DADO un usuario activo con `mustChangePassword=true`
- CUANDO inicia sesión con contraseña temporal válida
- ENTONCES el sistema DEBE indicar que el cambio de contraseña es obligatorio

#### Escenario: Acceso normal bloqueado por cambio pendiente

- DADO un usuario activo autenticado con `mustChangePassword=true`
- CUANDO intenta acceder a un recurso protegido no necesario para cambiar contraseña
- ENTONCES el sistema DEBE rechazar o limitar el acceso hasta completar el cambio

#### Escenario: Cambio de contraseña propia permitido como excepción explícita

- DADO un usuario activo autenticado con JWT válido y `mustChangePassword=true`
- CUANDO solicita `POST /api/auth/change-password` con contraseña actual válida y nueva contraseña válida
- ENTONCES el sistema DEBE actualizar la contraseña de forma segura
- Y DEBE persistir `mustChangePassword=false`
- Y DEBE permitir el acceso normal posterior según rol y estado activo
- Y NO DEBE devolver `passwordHash`

#### Escenario: Excepción rechazada sin JWT o contraseña actual válida

- DADO un usuario activo con `mustChangePassword=true`
- CUANDO solicita el cambio de contraseña propia sin JWT válido o con contraseña actual incorrecta
- ENTONCES el sistema DEBE rechazar la operación
- Y NO DEBE modificar la credencial

#### Escenario: Usuario existente sin cambio pendiente

- DADO un usuario existente migrado con `mustChangePassword=false`
- CUANDO inicia sesión con credenciales válidas
- ENTONCES el sistema DEBE permitir el flujo normal según su rol y estado activo

### Requisito: Estado de acceso consistente

El sistema DEBE aplicar las reglas de `isActive` y `mustChangePassword` de forma consistente en autenticación y autorización protegida.

#### Escenario: Usuario reactivado sin cambio pendiente

- DADO un usuario activo con `mustChangePassword=false`
- CUANDO inicia sesión y accede a recursos protegidos permitidos por su rol
- ENTONCES el sistema DEBE permitir el flujo normal

#### Escenario: Usuario inactivo con rol ADMIN

- DADO un usuario ADMIN con `isActive=false`
- CUANDO intenta iniciar sesión o usar endpoints ADMIN
- ENTONCES el sistema DEBE bloquearlo como usuario inactivo
