# UI — Clientes

## Objetivo

Administrar clientes minoristas, mayoristas e institucionales, su perfil facturado, crédito, bloqueo, historial y datos de entrega sin tratar los datos fiscales como emisión CFDI.

## Alcance TASK-041

Pantallas y componentes requeridos:

- `CustomersPage`.
- `CustomerFormModal`.
- `CustomerTable`.
- `CustomerTypeFilter`.
- `CreditStatusSummary`.
- `BillingSummaryCard`.
- Servicio y hooks de clientes.

## Pantalla principal

Debe consumir `GET /api/customers`.

Columnas:

- Número interno.
- Nombre.
- Nombre comercial.
- Teléfono.
- Email.
- Email de facturación.
- Tipo de cliente: `RETAIL`, `WHOLESALE` o `INSTITUTIONAL`.
- Estado de crédito.
- Saldo global.
- Saldo vencido.
- Crédito disponible.
- Política comercial.
- Ruta asignada.
- Estado activo/inactivo.
- Acciones.

## Filtros

- Búsqueda por texto.
- Tipo de cliente.
- Estado de crédito: activo, bloqueado o suspendido.
- Estado de antigüedad/cartera: vigente, por vencer, vencido o atrasado.
- Política comercial.
- Ruta asignada.
- Activo/inactivo.

## Acciones

- Nuevo cliente.
- Editar cliente.
- Desactivar cliente.
- Ver historial de ventas.
- Ver resumen de crédito.
- Ver saldo global y saldo final.
- Ver historial de pagos cuando el rol lo permita.

## Formulario de cliente

Debe alinearse con `POST /api/customers` y `PATCH /api/customers/:id`.

Campos:

- Número interno.
- Nombre.
- Nombre comercial.
- Teléfono.
- Email.
- Email de facturación.
- Dirección.
- Tipo de cliente.
- Lista de precios opcional.
- Límite de crédito.
- Días de crédito.
- Estado de crédito.
- Requiere facturación administrativa.
- Dirección de entrega.
- Ruta asignada.
- Política comercial.
- Razón social opcional.
- RFC opcional.
- Dirección fiscal opcional.

Restricciones:

- Los campos fiscales son opcionales en MVP.
- No presentar captura fiscal como emisión, timbrado ni factura CFDI.
- Solo roles autorizados pueden modificar límite de crédito, días, estado de bloqueo o política comercial.

## Resumen de crédito

Debe consumir `GET /api/customers/:id/credit-summary` cuando el rol lo permita.

Debe mostrar:

- Estado de crédito.
- Límite de crédito.
- Días de crédito.
- Saldo global.
- Saldo vencido.
- Crédito disponible.
- Indicador de mora.
- Días de atraso.
- Último pago.
- Motivo de bloqueo.
- Política comercial aplicada.
- Resumen de facturado, pagado y saldo final.

## Historial

Ventas del cliente:

- Debe consumir `GET /api/customers/:id/sales`.
- Debe distinguir ventas de contado, crédito y relaciones administrativas.
- Debe mostrar `accountReceivableId` cuando aplique.
- Debe mostrar `billingRequestId` cuando exista.

Pagos del cliente:

- Debe consumir `GET /api/customers/:id/payments` cuando el rol lo permita.
- Cada pago debe mostrar `accountReceivableId`.
- Los cobros de ruta deben mostrar `routeId` y `routeSettlementId` cuando aplique.
- Debe mostrar banco y referencia cuando existan.

## Indicadores visuales

- Cliente mayorista.
- Cliente institucional.
- Cliente con crédito activo.
- Cliente bloqueado por mora.
- Cliente bloqueado por límite excedido.
- Cliente inactivo.

## Permisos

- `ADMIN`: acceso completo y condiciones comerciales autorizadas.
- `SELLER`: crear, editar y consultar conforme a política; no modificar crédito salvo autorización.
- `COLLECTIONS`: consultar clientes, saldos, historial de pagos y estado de crédito.
- `DRIVER`: lectura limitada solo dentro de pedidos asignados.
- `WAREHOUSE`: sin acceso requerido.

## Estados de pantalla

Toda vista debe contemplar:

- Loading.
- Error.
- Empty.
- Success.
- Unauthorized.

## Validaciones

- Nombre requerido.
- Email válido si se captura.
- Email de facturación válido si se captura.
- Teléfono no duplicado cuando se use como identificador comercial.
- Tipo de cliente requerido.
- Cliente inactivo no debe seleccionarse para nuevas ventas.
- Mostrar errores de bloqueo o límite excedido devueltos por backend.
