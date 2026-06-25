# UI — Layout General

## Objetivo

Definir navegación, protección de rutas y estructura visual común para las superficies web de administración, POS, almacén, cobranza, reportes y experiencia móvil de repartidor.

## Sidebar

Debe contener navegación por módulo según rol.

Items base:

- Dashboard.
- Ventas / POS.
- Inventario.
- Traspasos.
- Compras.
- Clientes.
- Cuentas por cobrar.
- Rutas y reparto.
- Liquidaciones de ruta.
- Reportes.
- Usuarios.
- Políticas comerciales.
- Configuración operativa.

## Navegación por rol

### ADMIN

Puede ver:

- Dashboard completo.
- Ventas.
- Inventario.
- Traspasos.
- Compras.
- Clientes.
- Cuentas por cobrar.
- Rutas y reparto.
- Liquidaciones.
- Reportes.
- Usuarios.
- Políticas comerciales.
- Configuración operativa.

### SELLER

Puede ver:

- Ventas / POS.
- Clientes conforme a política.
- Mis ventas.
- Mi corte.
- Consulta limitada de disponibilidad por ubicación para venta.

### WAREHOUSE

Puede ver:

- Inventario.
- Saldos por ubicación.
- Movimientos.
- Ajustes.
- Traspasos.
- Compras.
- Reportes de inventario autorizados.

### DRIVER

Puede ver:

- Mis rutas.
- Pedidos asignados.
- Captura de evidencia.
- Incidencias y cobros permitidos en ruta.

No debe ver reportes financieros globales.

### COLLECTIONS

Puede ver:

- Cuentas por cobrar.
- Clientes y resumen de crédito.
- Pagos.
- Cobros en ruta autorizados.
- Liquidaciones de ruta conforme a permisos.
- Reportes de cobranza autorizados.

## Header

Debe mostrar:

- Nombre de pantalla.
- Usuario autenticado.
- Rol activo.
- Ubicación operativa activa cuando el flujo la requiera.
- Botón de cerrar sesión.
- Acciones rápidas si aplica.

## Protección de rutas

- Usuario no autenticado debe ir a login.
- Usuario sin permiso debe ver pantalla 403.
- Rutas deben validarse por rol.
- Las pantallas que operan por ubicación deben exigir o resolver `locationId` conforme a la política definida, sin inventar reglas de selección.

## Diseño responsive

- En escritorio, sidebar fija.
- En tablet/móvil, sidebar colapsable.
- POS debe ser usable en pantallas medianas.
- La experiencia del repartidor debe ser usable en móvil.
- No asumir capacidad offline ni sincronización local hasta decisión posterior.

## Estados transversales

Toda ruta con datos remotos debe soportar:

- Loading.
- Error.
- Empty.
- Success.
- Unauthorized.

## Restricciones MVP

- El comprobante del MVP es ticket interno.
- No usar navegación, etiquetas ni acciones de CFDI, SAT, timbrado, PAC o factura fiscal.
- No exponer pantallas que cambien invariantes estructurales, como desactivar inventario por ubicación o cuentas por cobrar para crédito.
