# AGENTS.md - Contexto operativo total del proyecto Pollos

## Rol del agente

Eres un agente de desarrollo SDD para un sistema empresarial de una distribuidora de pollos. Debes actuar como arquitecto e implementador disciplinado: primero specs, despues codigo, validacion siempre. Tu prioridad es mantener congruencia entre negocio real, arquitectura, base de datos, API, UI, pruebas y roadmap.

Este archivo es contexto permanente para agentes CLI como Codex, OpenCode o similares.

---

## Fuente de verdad

1. Los specs canonicos viven en:
   - `specs/.specs/`
   - `specs/modules/`
2. `openspec/` guarda cambios SDD activos e historicos.
3. `architecture-summary.md` es resumen de lectura, no reemplaza specs fuente.
4. Si hay conflicto entre codigo y specs, prevalecen specs.
5. Si hay conflicto entre PDFs de negocio y specs actuales, no programes de inmediato: actualiza specs o documenta decision abierta.
6. No inventes arquitectura, endpoints, entidades, permisos, pantallas ni reglas.

---

## Stack tecnico aprobado

- Frontend: React, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS.
- Backend: NestJS, TypeScript, Prisma, PostgreSQL.
- Seguridad: JWT, refresh tokens, RBAC, bcrypt o Argon2.
- Validacion backend: Class Validator.
- API Docs: Swagger segun specs.
- Infraestructura: Docker, Docker Compose, PostgreSQL, Nginx.

No uses JavaScript para logica de aplicacion. El codigo futuro debe ser TypeScript.

---

## Estructura aprobada

```text
frontend/
backend/
shared/
docker/
docs/
scripts/
specs/
openspec/
```

No crees carpetas fuera de esta estructura sin spec aprobado.

---

## Producto

Sistema empresarial para una distribuidora de pollos con:

- ventas al publico general;
- ventas de menudeo;
- clientes fijos;
- clientes mayoristas e institucionales;
- control de inventario por ubicacion;
- traspasos desde matriz a pollerias/rutas;
- ventas por kilo, pieza o ambas;
- tickets de bascula capturados manualmente;
- notas de venta simples y notas grandes;
- ventas facturables administrativas, sin CFDI en MVP;
- reparto diario;
- cobranza en ruta;
- creditos cortos y creditos atrasados;
- cuentas por cobrar;
- pagos parciales/totales;
- cierres diarios de punto de venta;
- cortes de caja;
- gastos;
- sobrantes/faltantes;
- liquidaciones de ruta;
- reportes operativos casi en tiempo real.

Objetivo operativo: reducir errores manuales, evitar ventas sin stock, dar trazabilidad a inventario, ventas, credito, reparto, cobranza, caja y reportes diarios.

---

## Reglas no negociables

- Inventario siempre por `OperationalLocation`.
- No existe stock global como fuente de verdad.
- Toda venta, compra, ajuste, movimiento y traspaso debe conservar ubicacion operativa.
- Toda venta a credito genera `AccountReceivable`.
- Todo pago de cobranza del MVP requiere `Payment.accountReceivableId` y aplica a una sola cuenta por cobrar.
- Un pago inmediato de venta de contado no debe crear una cuenta por cobrar artificial; debe quedar trazable contra la venta y seguir usando `Payment` como única fuente monetaria.
- `PaymentAllocation` esta fuera del MVP.
- Traspasos son entidad/dominio propio.
- Equivalencias kilo-pieza deben persistirse y auditarse.
- Ticket, nota y comprobante interno no son CFDI.
- SAT, CFDI, timbrado, PAC, UUID fiscal y cancelacion fiscal estan fuera del MVP.
- Integraciones automaticas con basculas, lectores o hardware especializado estan fuera del MVP.
- La captura manual de folios/tickets de bascula si puede estar dentro del MVP.
- Operaciones criticas deben ejecutarse transaccionalmente cuando se implemente codigo.
- No hardcodear secretos ni subir `.env`.

---

## Glosario de negocio

- **Matriz**: ubicacion principal desde donde sale producto hacia pollerias externas, rutas o clientes.
- **Sucursal / almacen / ubicacion operativa**: lugar fisico o logico donde existe inventario y se registran operaciones.
- **Polleria externa / punto de venta externo**: ubicacion que vende al publico general o clientes fijos fuera de matriz.
- **Ruta**: operacion de reparto a domicilio o clientes recurrentes.
- **Repartidor / transportista**: usuario que entrega producto y puede cobrar.
- **Ticket de bascula / etiqueta**: comprobante generado por bascula con kilos, precio e importe. En MVP se captura manualmente.
- **Nota sencilla**: nota manual para venta no facturable.
- **Nota grande**: nota manual usada para credito, control administrativo o venta facturable.
- **Venta facturable administrativa**: venta que el negocio relaciona con factura administrativa o requerimiento futuro, pero no genera CFDI en MVP.
- **Cliente de menudeo**: cliente recurrente o publico general, puede comprar de contado o credito corto.
- **Cliente facturado**: cliente institucional o mayorista que requiere control administrativo con RFC, razon social, correo, nota/factura y credito.
- **Credito corto**: credito de horas, mismo dia o pocos dias.
- **Credito atrasado**: saldo que no se recupero y pasa a dias posteriores.
- **Abono**: pago parcial aplicado a una cuenta por cobrar.
- **Corte diario**: cierre operativo de punto de venta con entradas, salidas, ingresos, gastos, sobrantes/faltantes y utilidad.
- **Liquidacion de ruta**: cierre de una ruta con ventas entregadas, cobradas, a credito, abonos, efectivo y transferencias.
- **Sobrante/Faltante**: diferencia entre inventario recibido, vendido, devuelto y existente.
- **Canastillas de clientes**: hallazgo de negocio identificado; mantener como decision abierta salvo spec confirmado.

---

## Flujo operativo canonico

### 1. Abastecimiento e inventario

1. Matriz recibe o compra producto.
2. Producto se registra por kilos, piezas o ambas unidades.
3. Matriz envia producto a pollerias externas o rutas mediante traspaso/movimiento trazable.
4. Cada ubicacion destino recibe kilos/productos como entrada operativa.
5. No se debe usar stock global para vender o reportar.

### 2. Venta en punto externo

1. Cliente compra al detalle o como cliente fijo.
2. La venta puede generarse por ticket de bascula, nota sencilla o nota grande.
3. El sistema registra producto, kilos/piezas, precio, importe, folio fisico y ubicacion.
4. Si es contado, registra pago.
5. Si es credito, genera cuenta por cobrar.
6. Al final del dia se realiza corte diario con entradas, salidas, ingresos, gastos y utilidad.

### 3. Venta de menudeo con reparto

1. Administracion o vendedor registra venta/nota para cliente de reparto.
2. Se asigna a ruta/repartidor.
3. Repartidor entrega producto.
4. La venta puede quedar pagada, a credito o con abono.
5. Puede existir segunda vuelta de cobranza por el mismo u otro repartidor.
6. La ruta se liquida con efectivo, transferencias, abonos, creditos pendientes y diferencias.

### 4. Clientes facturados

1. Cliente institucional/mayorista tiene numero interno, RFC, razon social, alias y correo.
2. Venta facturable se registra por nota/folio, producto, kilos, precio e importe.
3. Si queda a credito, genera cuenta por cobrar.
4. Pagos se registran por fecha, metodo, banco, referencia y documento aplicado.
5. Reportes muestran facturado, pagado, saldo final, vencido y por vencer.
6. No se genera CFDI en MVP.

---

## Modulos principales

- Auth.
- Usuarios/RBAC.
- Ubicaciones operativas.
- Productos y categorias.
- Equivalencias kilo-pieza.
- Inventario.
- Traspasos.
- Ventas/POS.
- Documentos de venta internos.
- Clientes.
- Politicas comerciales.
- Cuentas por cobrar.
- Pagos/cobranza.
- Compras/proveedores.
- Rutas/reparto.
- Liquidaciones de ruta.
- Cortes diarios de punto de venta.
- Reportes.
- Configuracion operativa.

---

## Estados y documentos importantes

### Sale

Debe soportar, segun specs vigentes o futuros:

- canal: mostrador, punto externo, ruta, institucional/mayoreo;
- documento: ticket de bascula, nota sencilla, nota grande, recibo interno;
- `collectionStatus`: no pagado, parcialmente pagado, pagado, cancelado;
- ubicacion operativa obligatoria;
- folio fisico cuando aplique;
- cliente opcional para publico general y obligatorio para credito/facturable;
- usuario que vendio, entrego y/o cobro cuando aplique.
- `BillingRequest` se modela aparte como relacion administrativa; no agrega un valor nuevo al documento de `Sale`.

### AccountReceivable

Debe soportar:

- venta origen;
- cliente;
- folio fisico/documento administrativo;
- fecha de emision;
- fecha de vencimiento;
- monto original;
- monto pagado;
- saldo;
- `status` de cobranza: no pagado, parcialmente pagado, pagado, cancelado;
- `agingStatus`: vigente, por vencer o vencido;
- pagos asociados uno a uno por MVP.

### Payment

Debe soportar:

- `accountReceivableId` obligatorio solo para pagos de cobranza o liquidación de saldo pendiente;
- `saleId` cuando el pago representa contado inmediato o abono inicial sin cuenta por cobrar artificial;
- monto;
- fecha;
- metodo: efectivo, transferencia, deposito, tarjeta, boucher, otro;
- banco opcional;
- referencia opcional;
- usuario que registra;
- ubicacion o ruta cuando aplique.

Regla canonica:

- `Payment` es la unica fuente monetaria del sistema.
- `paymentType` clasifica solo el tipo de venta (`CASH_SALE` o `CREDIT_SALE`).
- `collectionStatus` clasifica el estado de cobranza o saldo.
- `agingStatus` clasifica antigüedad o mora.
- `Customer.creditStatus` clasifica bloqueo o habilitación administrativa del cliente.
- `CashMovement` no sustituye pagos; solo clasifica entradas/salidas operativas de caja para conciliación.

### Corte diario

Debe soportar:

- ubicacion;
- fecha;
- entradas;
- salidas;
- ventas por ticket/nota;
- efectivo;
- boucher/tarjeta;
- transferencias;
- gastos;
- sobrantes/faltantes;
- compra/costo;
- venta;
- utilidad bruta/neta;
- estado borrador, revisado, cerrado, cancelado.

---

## Reglas para trabajar con specs

Antes de modificar cualquier archivo:

1. Lee `specs/.specs/07-workflows/task.md` si existe.
2. Lee specs de negocio.
3. Lee specs de arquitectura.
4. Lee specs de base de datos.
5. Lee APIs relacionadas.
6. Lee UI relacionada.
7. Lee modulo especifico en `specs/modules/<modulo>/spec.md`.
8. Identifica contradicciones.
9. Actualiza specs antes que codigo.

Cuando agregues una entidad:

- Actualiza business rules.
- Actualiza entities/database specs.
- Actualiza API spec.
- Actualiza UI spec si aplica.
- Actualiza module spec.
- Agrega pruebas esperadas en specs/testing si corresponde.
- Agrega decisiones abiertas si hay incertidumbre.

---

## Definition of Ready

Una tarea esta lista si:

- Tiene objetivo claro.
- Tiene specs relacionados.
- Tiene dependencias completadas.
- No contradice arquitectura.
- No contradice el canon `SaleDocument` vs `BillingRequest`.
- No contradice el canon de inventario de rutas con `ROUTE_STOCK`.
- No contradice el canon financiero donde `Payment` es la unica fuente monetaria.
- El alcance es pequeno y verificable.
- No quedan decisiones de negocio bloqueantes.

---

## Definition of Done

Una tarea esta terminada si:

- Compila cuando hay codigo.
- No tiene errores TypeScript.
- Respeta estructura.
- Respeta permisos.
- Respeta rutas API.
- Respeta reglas de negocio.
- Incluye validaciones.
- Incluye manejo de errores.
- Incluye pruebas cuando aplica.
- Incluye pruebas de transaccion, idempotencia o concurrencia cuando el caso toca dinero, inventario, cierres o liquidaciones.
- No rompe tareas anteriores.
- Documenta cambios relevantes.

## Gobierno documental de modulos

Nombres canonicos de specs de modulo:

- `specs/modules/inventory/spec.md`
- `specs/modules/sales/spec.md`
- `specs/modules/sales-documents/spec.md`
- `specs/modules/billing-requests/spec.md`
- `specs/modules/reports/spec.md`
- `specs/modules/routes-delivery/spec.md`

Aliases deprecated:

- `specs/modules/facturacion/spec.md`
- `specs/modules/inventario/spec.md`
- `specs/modules/ventas/spec.md`
- `specs/modules/reportes/spec.md`
- `specs/modules/routes/spec.md`
- `specs/modules/rutas-reparto/spec.md`

---

## Comandos de validacion conocidos

Usa los comandos documentados del proyecto cuando existan:

```bash
npm --prefix backend test
npm --prefix backend run test:e2e
npm --prefix backend run test:cov
npm --prefix frontend run lint && npm --prefix backend run lint
npm --prefix frontend run build && npm --prefix backend run build
npm --prefix backend run format
```

No uses `npm test` raiz como verificacion SDD si es placeholder.

---

## Decisiones abiertas actuales

Mantener visibles hasta que el negocio confirme:

- Modelo final sucursal-almacen: jerarquia, ubicaciones independientes o mixto.
- Regla exacta para decidir ubicacion de descuento en ventas complejas.
- Equivalencias oficiales kilo-pieza por producto.
- Politica exacta de redondeo para kilos, piezas, equivalencias, subtotales, saldos y pagos.
- Tolerancias de merma, diferencia de peso, devolucion y rechazo parcial.
- Requisito offline para experiencia movil de repartidores.
- Evidencia obligatoria de entrega.
- Profundidad futura de CFDI sin implementarlo en MVP.
- Alcance exacto de politicas comerciales por cliente, tipo, ubicacion o combinacion.
- Catalogo final de metodos de pago y bancos.
- Politica de folios por sucursal, punto de venta o ruta.
- Manejo de canastillas de clientes.

---

## Prohibiciones para agentes

No hagas lo siguiente:

- No inventes pantallas, endpoints o entidades sin spec.
- No programes si el usuario pidio solo prompts/specs.
- No crees stock global.
- No llames factura fiscal a tickets/notas internas.
- No implementes CFDI/SAT/PAC.
- No actives PaymentAllocation multi-cuenta en MVP.
- No integres basculas/hardware en MVP.
- No escondas diferencias de inventario o caja; deben reportarse.
- No borres trazabilidad historica de precios, clientes o productos.
- No hardcodees secretos.
- No subas `.env`.

---

## Orden recomendado de actualizacion SDD

1. Actualizar contexto general de agentes con este `AGENTS.md`.
2. Ejecutar prompt de puntos de venta externos y corte diario.
3. Ejecutar prompt de venta/inventario/menudeo/reparto/cobranza.
4. Ejecutar prompt de clientes facturados/cartera/pagos.
5. Revisar consistencia de entidades.
6. Ajustar roadmap y tareas SDD.
7. Implementar por incrementos pequenos.
