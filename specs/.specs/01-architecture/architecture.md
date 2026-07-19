# Arquitectura del Sistema

## 1. Tipo de arquitectura

El sistema debe desarrollarse como un monorepo con frontend y backend separados.

```text
pollo-distribucion/
  frontend/
  backend/
  shared/
  docker/
  docs/
  .specs/
  modules/
  package.json
  docker-compose.yml
  README.md
```

## 2. Estilo arquitectónico

El backend seguirá una arquitectura modular por características.

Cada módulo debe contener sus propios:

- Controller.
- Service.
- DTOs.
- Entities o modelos relacionados.
- Repository o capa de acceso a datos.
- Tests.

El frontend también seguirá arquitectura por características, evitando una carpeta única con todos los componentes mezclados.

## 3. Frontend

Tecnologías:

- React.
- Vite.
- TypeScript.
- React Router.
- TanStack Query.
- Tailwind CSS.
- Axios o Fetch wrapper propio.

Responsabilidades:

- Mostrar interfaz de usuario.
- Consumir API.
- Validar formularios de manera básica.
- Manejar sesión del usuario.
- Proteger rutas por autenticación y rol.
- Mostrar errores comprensibles para el usuario.

Superficies de uso dentro del alcance MVP:

- Administración web para propietarios, administradores y usuarios autorizados.
- Interfaz web tipo escritorio para POS, mostrador, pedidos y consulta operativa.
- Interfaz web tipo escritorio para almacén, entradas, salidas, ajustes y traspasos.
- Experiencia móvil para choferes/repartidores, resuelta técnicamente como app móvil, PWA o web móvil según decisión posterior de arquitectura.

El frontend no debe contener reglas críticas de negocio. Las reglas críticas deben validarse en backend.

La experiencia móvil de choferes debe considerarse parte del alcance funcional del MVP. La capacidad de operar sin conexión queda como decisión abierta de negocio y arquitectura; hasta definirse, no se debe asumir sincronización offline, almacenamiento local durable ni resolución automática de conflictos.

## 4. Backend

Tecnologías:

- NestJS.
- TypeScript.
- Prisma.
- PostgreSQL.
- JWT.
- Bcrypt o Argon2 para contraseñas.

Responsabilidades:

- Exponer API REST.
- Validar datos de entrada.
- Aplicar reglas de negocio.
- Controlar permisos.
- Administrar persistencia.
- Generar respuestas consistentes.
- Registrar errores relevantes.

Módulos de dominio requeridos por alcance de negocio:

- Usuarios, roles y autenticación.
- Productos, categorías e inventario por ubicación operativa.
- Sucursales, almacenes o ubicaciones operativas, según decisión final del modelo sucursal-almacén.
- Compras, entradas, ajustes, mermas y traspasos.
- Clientes, incluyendo clientes mayoristas, institucionales y facturados con condiciones comerciales.
- Solicitudes administrativas de factura y relación interna de documentos.
- Ventas/POS de contado y a crédito.
- Cierre diario de puntos de venta externos.
- Cuentas por cobrar, pagos, saldos vencidos, días de atraso y bloqueo de crédito.
- Rutas, reparto, evidencia de entrega, devoluciones, incidencias y liquidación de ruta.
- Documentos de venta internos: nota sencilla, nota grande, ticket/comprobante interno.
- Solicitudes administrativas de factura como relación interna separada.
- Comprobantes internos/tickets.
- Reportes operativos casi en tiempo real.

## 5. Base de datos

Motor:

- PostgreSQL.

ORM:

- Prisma.

La base de datos debe tener integridad referencial mediante llaves foráneas, restricciones y transacciones.

El modelo de persistencia debe soportar inventario por ubicación operativa y no depender de un único stock global por producto. Cada venta, compra, ajuste, traspaso y movimiento de inventario debe quedar asociado a una ubicación operativa definida.

Las operaciones críticas de venta, compra, cancelación, pago de cuenta por cobrar, ajuste de inventario, traspaso y liquidación de ruta deben ejecutarse con transacciones cuando modifiquen saldos, stock o estados relacionados.

## 5.1 Decisiones abiertas que afectan arquitectura

Estas decisiones no deben resolverse por implementación sin aprobación de negocio:

- Modelo final de sucursal y almacén: una sucursal con uno o más almacenes, almacenes independientes o ambos mediante ubicación operativa genérica.
- Regla exacta para decidir desde qué almacén o ubicación descuenta una venta.
- Equivalencias oficiales kilo-pieza por producto y quién puede modificarlas.
- Política exacta de redondeo para kilos, piezas, equivalencias, precios, subtotales, saldos y pagos.
- Tolerancias de merma, diferencia de peso, devolución, rechazo parcial e incidencias de reparto.
- Requisito offline de la experiencia móvil de choferes y ventana máxima de operación sin sincronización.
- Combinación obligatoria de evidencia de entrega: foto, firma, geolocalización, notas u otros elementos.
- Profundidad de preparación para CFDI/SAT futuro sin emitir facturas fiscales en el MVP.

Hasta cerrar estas decisiones, los módulos deben diseñarse con campos y relaciones que permitan trazabilidad, pero no deben inventar reglas finales de cálculo, obligatoriedad o autorización. La configuración de bancos y medios de pago puede vivir como catálogo administrable, pero su lista final sigue abierta.

## 5.2 Separación entre decisiones estructurales y configuración administrativa

La arquitectura debe distinguir entre decisiones estructurales del dominio y parámetros operativos configurables. Esta separación evita convertir invariantes del modelo en interruptores administrativos que podrían romper consistencia de datos, trazabilidad o integridad referencial.

### Decisiones estructurales no configurables

Estas decisiones forman parte fija de los specs y no deben exponerse como toggles administrativos:

| Decisión | Regla estructural |
|----------|-------------------|
| Inventario por ubicación | El stock se controla por producto y ubicación operativa; no se debe volver a un stock global único por producto. |
| Referencia obligatoria a ubicación | Ventas, compras, ajustes, movimientos y traspasos deben conservar la ubicación operativa afectada. |
| Traspasos como dominio propio | Un traspaso entre ubicaciones requiere encabezado, detalle, origen, destino, estado, responsable y movimientos trazables. |
| Cuentas por cobrar | Toda venta a crédito genera una cuenta por cobrar como registro de dominio de primera clase. |
| Pagos | Los pagos a cuentas por cobrar son registros de dominio independientes y trazables, no simples cambios de saldo sin historial. |
| Soporte kilo/pieza | La capacidad de vender y controlar productos por kilo, pieza o ambas unidades es parte central del dominio. |
| Equivalencias kilo-pieza | Las equivalencias oficiales deben persistirse y auditarse; no deben quedar como cálculo informal en frontend. |
| Comprobantes del MVP | El MVP solo emite ticket, nota sencilla, nota grande o comprobante interno. No emite CFDI, no timbra y no integra SAT. |

### Parámetros configurables por administración

Estos parámetros pueden vivir en un módulo administrativo de configuración porque modifican comportamiento operativo sin cambiar el modelo estructural:

| Área | Parámetros configurables |
|------|--------------------------|
| Crédito y cobranza | Límite de crédito por cliente o política comercial, días de crédito, pago por documento, comportamiento ante mora, bloqueo por límite excedido, autorización administrativa excepcional. |
| Facturación administrativa | Relación interna de solicitud administrativa de factura, folio comercial y estado de enlace con venta o cuenta por cobrar. |
| Cálculo comercial | Modo de redondeo para kilos, equivalencias, subtotales, saldos y pagos dentro de los rangos aprobados por negocio. |
| Inventario | Tolerancia de merma o diferencia de peso, umbrales de bajo inventario por producto/ubicación, estrategia predeterminada para seleccionar ubicación de descuento en venta. |
| Reparto | Evidencia de entrega requerida, política de cobro en ruta, política offline del chofer si negocio la confirma como configurable. |
| Reportes | Intervalo de refresco casi en tiempo real dentro del límite de negocio de 60 segundos. |

El módulo de configuración administrativa debe auditar cambios, registrar usuario responsable y evitar que una configuración elimine requisitos estructurales. Por ejemplo, puede configurar el límite de crédito, pero no puede desactivar la existencia de cuentas por cobrar para ventas a crédito.

### Límites fuera del MVP

SAT, CFDI real, timbrado, cancelación fiscal, catálogo fiscal obligatorio e integración con PAC quedan fuera del MVP. Cualquier módulo fiscal debe tratarse como fase posterior y requerir actualización explícita de PRD, arquitectura, base de datos, API y UI antes de implementarse.

## 6. Seguridad

- Autenticación mediante JWT.
- Refresh token para renovación de sesión.
- RBAC para permisos.
- Hash de contraseñas.
- Validación de datos con DTOs.
- Protección contra entradas inválidas.
- No exponer datos sensibles.

## 7. Comunicación frontend-backend

La comunicación será mediante API REST bajo el prefijo:

```text
/api
```

Ejemplo:

```text
GET /api/products
POST /api/sales
```

Las rutas API específicas deben estar definidas en `.specs/03-api/` antes de implementarse. Este documento solo define responsabilidades arquitectónicas; no autoriza crear endpoints nuevos por sí mismo.

## 8. Manejo de errores

Toda respuesta de error debe mantener estructura consistente:

```json
{
  "success": false,
  "message": "Descripción del error",
  "error": "ERROR_CODE",
  "statusCode": 400
}
```

## 9. Manejo de respuestas exitosas

Toda respuesta exitosa debe mantener estructura consistente:

```json
{
  "success": true,
  "message": "Operación realizada correctamente",
  "data": {}
}
```

## 10. Principios obligatorios

- No duplicar lógica.
- No crear archivos gigantes.
- No mezclar frontend con backend.
- No poner lógica de negocio crítica en componentes React.
- No acceder a base de datos directamente desde controllers.
- No usar `any` salvo justificación documentada.
- No crear rutas API no definidas en specs.

## 11. Reportes operativos casi en tiempo real

Los reportes de ventas, inventario, cobranza y reparto deben reflejar operaciones confirmadas con latencia máxima de 60 segundos en condiciones normales de operación, conforme al PRD y reglas de negocio.

La arquitectura puede usar consultas transaccionales, vistas, agregados o procesos de actualización interna, pero no debe depender de cierres manuales para mostrar datos operativos actuales. Los cortes de caja, liquidaciones de ruta y cierres contables pueden seguir siendo procesos separados.

## 12. Facturación y comprobantes

En el MVP, la arquitectura debe tratar la facturación básica como ticket o comprobante interno de venta y como solicitud administrativa de factura solo a nivel interno. El comprobante interno no es CFDI, no debe presentarse como factura fiscal y no debe integrar SAT.

La preparación de datos para una futura fase fiscal puede contemplarse como campos comerciales y trazabilidad de venta/cliente, pero la emisión, timbrado, cancelación fiscal CFDI e integración SAT quedan fuera del MVP salvo cambio explícito del PRD. La relación de solicitud administrativa se resuelve con dominios internos, no con CFDI.

## 13. Arquitectura de puntos de venta externos

Los puntos de venta externos se modelan como `OperationalLocation` activas. No constituyen un stock paralelo ni un agregado global: reciben producto mediante `InventoryTransfer` o movimientos trazables y operan sobre `InventoryBalance` por ubicación.

El módulo de Ventas/POS debe soportar, sin mezclar responsabilidades:

- Canal de venta de punto externo para público general y clientes fijos.
- Documento comercial interno de tipo ticket/etiqueta de báscula, nota simple, nota grande o comprobante interno.
- Relación de facturación administrativa interna sin CFDI.
- Referencia manual al folio de báscula sin integración automática con hardware.
- Precios y descuentos resueltos en backend mediante reglas y políticas comerciales.

`ScaleTicketReference` es evidencia operativa manual. No confirma ventas, no descuenta inventario y no representa un dispositivo integrado.

`SaleDocument` concentra la trazabilidad documental de las ventas internas: nota sencilla, nota grande, ticket/comprobante interno y otros comprobantes operativos de venta. `BillingRequest` concentra por separado la relación administrativa de cliente, venta y cuenta por cobrar cuando aplique. Ambos viven como dominios propios para no mezclar documentos operativos con solicitudes administrativas, CFDI ni cierres de caja.

## 13.1 Arquitectura de inventario para rutas

Las rutas operativas no consumen inventario directamente desde su almacén o sucursal de origen una vez cargadas. Cada `DeliveryRoute` debe asociarse 1:1 con una `OperationalLocation` de tipo `ROUTE_STOCK`, que actúa como ubicación operativa exclusiva de la mercancía en tránsito.

Flujo canónico:

1. Preparación de ruta.
2. Carga mediante `InventoryTransfer` desde `WAREHOUSE`, `BRANCH` o `MIXED` hacia `ROUTE_STOCK`.
3. Venta y entrega descontando exclusivamente desde `ROUTE_STOCK`.
4. Devolución de sobrante mediante `InventoryTransfer` desde `ROUTE_STOCK` hacia la ubicación fija autorizada.
5. Liquidación de ruta para conciliar entregas, cobros, devoluciones y diferencias.

Reglas estructurales:

- No existe doble decremento entre carga a ruta y venta en ruta.
- Toda devolución o rechazo con impacto físico debe conservar `locationId` y referencia de ruta.
- `RouteSettlement` concilia diferencias; no reemplaza `InventoryTransfer` ni `InventoryMovement`.

## 14. Módulo de cierre diario de punto de venta

`PointOfSaleDailyClose` es un agregado de dominio propio y distinto de `RouteSettlement`.

| Agregado | Responsabilidad |
| --- | --- |
| `PointOfSaleDailyClose` | Conciliar una ubicación fija, fecha de negocio, producto, ventas, caja, gastos y utilidad. |
| `RouteSettlement` | Conciliar una ruta, repartidor, entregas, devoluciones, incidencias y cobros en tránsito. |

El módulo de cierre diario debe depender de contratos públicos de Ventas, Inventario, Pagos, Ubicaciones y Reportes. No debe duplicar ventas, pagos ni movimientos; conserva asociaciones y snapshots de totales para auditoría.

Las transiciones críticas de estado y cualquier ajuste asociado deben ejecutarse en transacción. Cerrar, cancelar o reabrir debe validar ubicación, permisos, versión vigente y ausencia de operaciones sin trazabilidad. Una referencia de báscula o línea de conciliación no modifica inventario por sí sola; cualquier corrección física usa el flujo autorizado de ajustes de inventario.

## 14.1 Lecturas y frescura

- Los reportes operativos consultan operaciones confirmadas y exponen `generatedAt`, `dataAsOf` y `freshnessSeconds`.
- La frescura máxima esperada permanece en 60 segundos bajo condiciones normales.
- El cierre diario puede mostrar una fotografía auditable del momento de revisión o cierre, pero no bloquea el dashboard ni los reportes casi en tiempo real.
- Los totales derivados deben recalcularse en backend antes de cada validación o transición de estado.

## 14.2 RBAC

- `ADMIN`: cierre, cancelación y reapertura.
- `SELLER`: captura y consulta del borrador de su ubicación.
- `WAREHOUSE`: consulta de traspasos, entradas y kilos enviados.
- `COLLECTIONS`: consulta de pagos e ingresos; sin modificación de inventario.
- `CASHIER` no se incorpora hasta una decisión explícita de negocio.

## 14.3 Límites y decisiones abiertas

- No integrar básculas, lectores ni hardware en el MVP.
- No convertir tickets, notas o cierres en CFDI.
- No incorporar `PaymentAllocation`.
- Mantener abiertas las tolerancias de diferencia, fórmulas de utilidad, política de redondeo, catálogo de conceptos y reglas de reapertura.

## 15. Módulo post-MVP de conciliación de facturas externas

El cambio explícito de PRD habilita un bounded context de facturación operativo que registra facturas emitidas externamente. Mantiene separados `Sale`, `SaleDocument`, `BillingRequest`, `Invoice` y `Payment`; no invoca servicios de venta, inventario o pagos al vincular, cancelar o sustituir facturas.

`SaleDocument` es la raíz de lectura facturable y `SaleItem` la unidad exacta de aplicación. El estado de facturación se deriva mediante un servicio de dominio puro. Los acumulados se protegen con transacción serializable, bloqueo ordenado, versión, idempotencia y restricción PostgreSQL de respaldo.

`LegalEntity` modela el emisor y no se confunde con `OperationalLocation`. Reporte, indicadores y exportaciones comparten read model y predicado de filtros. Importes JSON se serializan como cadenas decimales; CSV/XLSX conserva importes numéricos.

La fuente canónica es `specs/modules/billing-reportable-notes/spec.md`. Persisten fuera de alcance CFDI/XML, timbrado, PAC, integración SAT y `PaymentAllocation`.
