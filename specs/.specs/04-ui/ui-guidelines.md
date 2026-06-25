# Guía de Interfaz

## Objetivo visual

La interfaz debe ser clara, rápida y funcional para operación diaria de ventas, almacén, cobranza, reparto y administración.

Prioridades:

- Rapidez en punto de venta.
- Tablas fáciles de consultar.
- Acciones principales visibles.
- Formularios coherentes con contratos API.
- Mensajes de error comprensibles.
- Estados remotos consistentes.
- Diseño responsive.

## Layout principal

Elementos:

- Sidebar lateral.
- Header superior.
- Área principal de contenido.
- Menú de usuario.
- Indicador de sesión.
- Indicador de rol.
- Indicador de ubicación operativa cuando aplique.

## Componentes base

Crear componentes reutilizables:

- Button.
- Input.
- Select.
- Modal.
- Dialog.
- Table.
- Badge.
- Card.
- Alert.
- Loading.
- ErrorState.
- EmptyState.
- UnauthorizedState.
- ConfirmDialog.
- LocationSelector.
- MoneyAmount.
- QuantityInput para kilo, pieza o ambas unidades.
- StatusBadge.

## Estados obligatorios

Toda pantalla con datos remotos debe contemplar:

- Loading.
- Error.
- Empty.
- Success.
- Unauthorized.

## Roles y menú

### ADMIN

Ver:

- Dashboard.
- Ventas.
- Inventario.
- Traspasos.
- Compras.
- Clientes.
- Cuentas por cobrar.
- Rutas.
- Liquidaciones.
- Reportes.
- Usuarios.
- Políticas comerciales.
- Configuración operativa.

### SELLER

Ver:

- Ventas.
- Clientes conforme a política.
- Mis ventas.
- Mi corte.
- Disponibilidad de inventario por ubicación para POS.

### WAREHOUSE

Ver:

- Inventario.
- Saldos por ubicación.
- Ajustes.
- Movimientos.
- Traspasos.
- Compras.
- Reportes de inventario autorizados.

### DRIVER

Ver:

- Mis rutas.
- Entregas.
- Evidencia.
- Incidencias.
- Cobros permitidos en ruta.

### COLLECTIONS

Ver:

- Cuentas por cobrar.
- Clientes.
- Pagos.
- Saldos vencidos.
- Cobros en ruta.
- Liquidaciones autorizadas.
- Reportes de cobranza autorizados.

## Formularios

Reglas:

- Validar campos requeridos.
- Mostrar mensajes bajo cada campo.
- Deshabilitar botón mientras se envía.
- Confirmar acciones destructivas.
- Mantener nombres de campos coherentes con API: `locationId`, `presentationType`, `quantityKg`, `quantityPieces`, `unit`, `unitEquivalentId`, `paymentType`, `paymentMethod`, `accountReceivableId`.
- No enviar precios calculados por frontend como fuente de verdad en ventas.
- No convertir kilo/pieza en frontend sin equivalencia oficial aprobada.

## Presentación semántica

- `KG`: producto comercializado a kilo.
- `WHOLE`: unidad entera, como pollo completo.
- `CUT`: corte, como pechuga, pierna, muslo o ala.

## Unidades y cantidades

- `KG`: capturar kilos con decimales.
- `PIECE`: capturar piezas como enteros.
- `KG_AND_PIECE`: permitir captura según el flujo y mostrar equivalencia aplicada cuando exista.
- Los saldos deben mostrarse por ubicación operativa.
- No mostrar stock global como fuente de verdad.

## Mensajes y restricciones fiscales

- Usar “ticket interno” o “comprobante interno” para el MVP.
- No usar “CFDI”, “SAT”, “timbrado”, “PAC”, “UUID fiscal” ni “factura fiscal” como acciones o promesas funcionales del MVP.
- Los datos fiscales de cliente son opcionales y solo preparan una fase futura.

## Configuración y políticas

- La UI puede exponer políticas comerciales y configuración operativa permitida.
- No debe presentar toggles para desactivar invariantes estructurales: inventario por ubicación, cuentas por cobrar en crédito, traspasos como dominio propio ni ticket interno como comprobante MVP.
- La política offline de choferes no debe configurarse ni asumirse hasta decisión cerrada.

## Reportes casi en tiempo real

- Mostrar `generatedAt` o indicador de última actualización cuando el endpoint lo entregue.
- El intervalo de refresco configurable no debe superar 60 segundos en condiciones normales.
- No depender de cierres manuales para mostrar operaciones confirmadas.
