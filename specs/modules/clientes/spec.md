# Module Spec — Clientes

## Objetivo

Administrar clientes minoristas, mayoristas e institucionales para ventas, crédito, condiciones comerciales, historial, entregas, cobranza y preparación fiscal CFDI 4.0.

## Funcionalidades

- Crear cliente.
- Editar cliente.
- Desactivar cliente.
- Buscar cliente.
- Clasificar cliente como minorista o mayorista.
- Registrar condiciones comerciales: lista de precios, límite de crédito, días de crédito, ruta asociada y dirección de entrega cuando aplique.
- Consultar historial de ventas.
- Consultar estado de crédito y saldos relacionados.
- Seleccionar cliente en venta.
- Identificar clientes bloqueados por mora o límite de crédito.

## Entidades

- Customer.
- CommercialPolicy.
- AccountReceivable.
- Payment.
- DeliveryRoute.

## Campos

- name.
- phone.
- email.
- address.
- customerType.
- priceListId.
- creditLimit.
- creditDays.
- creditStatus.
- requiresBilling.
- billingEmail.
- fiscalName.
- taxId.
- fiscalAddress.
- fiscalPostalCode.
- fiscalRegime.
- fiscalUseCode.
- deliveryAddress.
- assignedRouteId.
- commercialPolicyId.
- isActive.

Los seis campos que integran el perfil fiscal requerido son `fiscalName`, `taxId`, `fiscalPostalCode`, `fiscalRegime`, `fiscalUseCode` y `billingEmail`. `fiscalAddress` permanece opcional porque no forma parte de la regla actual de billabilidad. El perfil puede estar vacío mientras `requiresBilling=false`; al activar `requiresBilling=true`, el backend debe exigir los seis campos y conservar la autoridad de validación.

Los códigos de `fiscalRegime` y `fiscalUseCode` provienen del catálogo SAT versionado por la aplicación; no se permiten entradas libres. La matriz de compatibilidad entre régimen y UsoCFDI debe revalidarse en el servicio de catálogo/PAC antes de emitir, porque esta tarea solo cierra la pertenencia de cada código. Los datos fiscales no emiten ni timbran CFDI por sí mismos.

## Reglas

- Nombre obligatorio.
- Email válido si existe.
- Teléfono único si se captura como identificador comercial.
- `customerType` debe distinguir cliente minorista y mayorista.
- No eliminar físicamente.
- Cliente inactivo no debe seleccionarse en nuevas ventas.
- Un cliente mayorista debe tener clasificación o tipo de cliente definido.
- Las condiciones mayoristas pueden incluir lista de precios, límite de crédito, días de crédito, ruta asociada y dirección de entrega.
- Para ventas a crédito, el cliente debe tener crédito autorizado.
- Un cliente bloqueado por mora o exceso de límite no debe recibir nuevas ventas a crédito sin autorización administrativa explícita.
- Las condiciones específicas del cliente prevalecen sobre políticas globales solo si negocio lo autoriza.
- Las ventas, cuentas por cobrar y pagos deben conservar trazabilidad hacia cliente y política comercial aplicada.
- Normalizar RFC, códigos fiscales, código postal y correos antes de persistirlos.
- Validar RFC con reglas estructurales, código postal fiscal con cinco dígitos y régimen/UsoCFDI contra el catálogo SAT disponible.
- Separar dirección comercial, dirección de entrega y domicilio fiscal en API y UI; no copiar una dirección en otra de forma implícita.
- Los errores de perfil fiscal deben identificar los campos afectados sin convertir la UI en autoridad de negocio.

## Modelo MVP de pagos

Para el MVP, cada pago de cobranza pertenece a una sola cuenta por cobrar mediante `Payment.accountReceivableId` requerido.

Los pagos inmediatos de contado deben conservar trazabilidad contra la venta sin crear una cuenta por cobrar artificial.

Los pagos distribuidos entre varias cuentas mediante `PaymentAllocation` quedan fuera del flujo oficial del MVP y requieren actualización posterior de specs.

## Permisos

- ADMIN: CRUD completo, consulta global y administración de condiciones comerciales autorizadas.
- SELLER: crear, editar y consultar clientes conforme a política; no puede modificar límites de crédito salvo autorización.
- COLLECTIONS: consultar clientes, saldos, historial de pagos y estado de crédito; registrar pagos desde cobranza.
- WAREHOUSE: sin acceso requerido.
- DRIVER: puede consultar datos necesarios de entrega si se asigna pedido.

## API

Las rutas exactas deben definirse en `.specs/03-api/customers-api.md` antes de implementar. Este spec no autoriza crear endpoints adicionales por sí mismo.

Rutas ya referenciadas por el roadmap actual:

- GET /api/customers
- GET /api/customers/:id
- POST /api/customers
- PATCH /api/customers/:id
- DELETE /api/customers/:id
- GET /api/customers/:id/sales

Pendiente de especificación API antes de implementar:

- Consulta de estado de crédito y saldos.
- Gestión de condiciones comerciales.
- Búsqueda/filtro de clientes mayoristas.
- Consulta de historial de pagos.

## UI

- Tabla de clientes.
- Modal crear/editar.
- Buscador.
- Filtros por tipo de cliente y estado de crédito.
- Historial de ventas.
- Resumen de crédito, saldos y pagos.
- Vista de condiciones comerciales.
- Indicador de cliente bloqueado.

## Pruebas mínimas

- Crear cliente minorista.
- Crear cliente mayorista con tipo definido.
- Rechazar cliente sin nombre.
- Rechazar email inválido.
- Evitar duplicado por teléfono cuando aplique.
- Desactivar cliente.
- Rechazar selección de cliente inactivo en nuevas ventas.
- Identificar cliente bloqueado por mora o límite excedido.
- Permitir cliente no facturable con perfil fiscal vacío.
- Rechazar `requiresBilling=true` cuando falte cualquiera de los seis campos del perfil fiscal.
- Rechazar RFC, código postal, régimen o UsoCFDI inválidos.
- Validar que el perfil fiscal no emita CFDI ni modifique ventas o inventario.
