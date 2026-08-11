# Auditoría integral y plan de corrección

**Fecha de ejecución:** 2026-08-10
**Proyecto:** Pollos Distribuidor
**Alcance:** arquitectura, frontend, backend, API, PostgreSQL/Prisma, seguridad, reglas de negocio, operación, pruebas y despliegue
**Regla de trabajo:** auditoría de solo lectura sobre código de producción; no se implementaron correcciones ni se editaron datos directamente en PostgreSQL.

## 1. Resumen ejecutivo

### Dictamen

**Estado general: NO APTO para representar de forma confiable un día completo de producción.**

El sistema tiene una base técnica considerable: módulos por dominio, autenticación JWT con sesiones persistidas, controles RBAC, validación global, transacciones `Serializable` en operaciones críticas, restricciones PostgreSQL para inventario, 60 migraciones aplicables sobre una base limpia, cobertura automatizada con umbrales y una puerta CI amplia. Sin embargo, la ejecución real de un día operativo encontró defectos que afectan simultáneamente inventario y dinero.

El defecto más grave permite vender productos `PIECE` descontando existencias, pero registrando cantidad facturable, costo, subtotal y total en cero. En el ejercicio se entregaron dos piezas con precio de catálogo de $12.00 cada una y la venta quedó `CONFIRMED`, `PAID`, total $0.00 y sin pago. La caja interna cerró con diferencia cero porque el propio sistema omitió los $24.00; eso NO representa una conciliación de negocio correcta.

Además:

- un cobro normal de una cuenta por cobrar queda bloqueado después de cerrar el día de la venta original;
- el rol `COLLECTIONS` puede registrar cobros, pero no puede abrir el turno que el cobro en efectivo exige;
- una merma de tránsito registra cantidad perdida sin modificar el saldo indicado por el mismo movimiento;
- los ajustes administrativos de inventario no son idempotentes y un reintento puede duplicar stock;
- los descuentos se guardan en cabecera sin distribuirse a partidas, dejando reservas de facturación inconsistentes;
- los filtros `dateTo` de fecha civil excluyen casi todo el día solicitado;
- el `docker-compose.production.yml` omite tres variables obligatorias y el backend no inicia;
- el bootstrap productivo existe, pero no forma parte de ningún flujo de despliegue y no rota la contraseña del administrador al reejecutarse.

### Resultado contra el objetivo final

| Objetivo | Resultado | Evidencia resumida |
|---|---:|---|
| Inventario cuadrado | **FAIL** | El saldo global numérico terminó en 24 kg y 27 piezas, pero una merma de tránsito de 1 pieza declara `9 → 9`; la ecuación por tipo de movimiento no reproduce el saldo. |
| Caja cuadrada | **FAIL de negocio** | El corte interno dio $256.00 esperado y contado, diferencia $0.00; al incluir las 2 piezas entregadas, el efectivo esperado sería $280.00. |
| Ventas cuadradas | **FAIL** | Venta esperada independiente $314.00; venta registrada $290.00; diferencia **-$24.00**. |
| Pagos/cobros cuadrados | **FAIL de ciclo de vida** | Los pagos persistidos sí suman $166.00 y la CxC queda en $124.00, pero un cobro posterior de $10.00 fue rechazado por el corte histórico ya cerrado. |
| Traspasos origen/destino | **FAIL de trazabilidad** | Los balances globales conservan masa, pero la merma de recepción no representa su propio impacto en el saldo destino. |
| Trazabilidad completa | **FAIL** | Existe relación entre entidades, pero hay movimientos contablemente contradictorios y una venta de piezas sin valor ni costo. |
| Coherencia frontend/backend/PostgreSQL | **FAIL** | El POS calcula 2 × $12.00 = $24.00; el backend y la DB registran $0.00. Los filtros de fecha de la UI envían fechas civiles que el backend interpreta como medianoche. |

### Riesgos principales

1. **Pérdida directa de ingresos y margen:** productos por pieza pueden salir sin cobrar ni reconocer costo.
2. **Cobranza interrumpida:** el cierre histórico de una venta impide recibir pagos futuros de su CxC.
3. **Duplicación de inventario:** un reintento de ajuste administrativo aplica el movimiento otra vez.
4. **Libro de inventario ambiguo:** una merma puede declarar cantidad sin cambio de saldo.
5. **Despliegue productivo no ejecutable:** el compose productivo no satisface la configuración que el backend exige al construir sus módulos.
6. **Reportes silenciosamente incompletos:** `dateTo=AAAA-MM-DD` excluye operaciones posteriores a las 00:00.

## 2. Método, evidencia y límites

### 2.1 Método aplicado

- Lectura de specs canónicos en `specs/.specs/` y `specs/modules/` para contrastar código, API y reglas.
- Revisión estática de controladores, servicios, DTO, Prisma, migraciones, seeds, Docker, CI, frontend y documentación.
- Búsqueda de autenticación omitida, roles contradictorios, transacciones, idempotencia, filtros de fecha, SQL inseguro, secretos, XSS y llamadas externas sin timeout.
- Migración de una base PostgreSQL/PostGIS limpia con las 60 migraciones.
- Seed de desarrollo y creación de datos operativos mediante los endpoints reales.
- Ejecución del backend compilado y del frontend Vite.
- Ejercicio operativo completo mediante HTTP/API real contra la base aislada `pollos_audit_day_20260810`.
- Conciliaciones matemáticas independientes; no se usaron totales del sistema como fuente de verdad para decidir si cuadraba.
- Ejecución de lint, typecheck, pruebas, coberturas, builds, auditoría de dependencias, validación Prisma y E2E disponibles.

### 2.2 Entorno de prueba

| Componente | Configuración usada |
|---|---|
| Fecha de negocio | 2026-08-10 |
| Backend | NestJS compilado, puerto 4100, `start:prod` |
| Frontend | Vite, `http://127.0.0.1:4173` |
| Base de datos | PostgreSQL/PostGIS local, base aislada `pollos_audit_day_20260810` |
| ORM | Prisma; 60 migraciones aplicadas desde cero |
| Usuario operativo | usuarios de desarrollo `ADMIN` y `SELLER` según cada operación |
| Zona horaria esperada | `America/Mexico_City` |

### 2.3 Límites y pruebas pendientes

- **Docker no pudo ejecutarse en este entorno.** Tanto el acceso normal como el escalado terminaron con `zsh: operation not permitted: docker`; además `command -v docker` no expuso binario. Se revisaron Dockerfiles y compose de forma estática, pero no se afirma que las imágenes hayan arrancado localmente.
- `gitleaks` no está instalado localmente. El workflow CI sí ejecuta `gitleaks/gitleaks-action@v3`, pero el escaneo completo del historial quedó **PENDIENTE** en esta sesión.
- No se abrió ni inspeccionó ningún `.env` local ni archivo de credenciales. Se revisaron `.env.example`, validadores y referencias de configuración.
- No se recorrieron manualmente todas las combinaciones de cada pantalla. La prueba de punta a punta se concentró en inventario, compras, ventas, traspasos, CxC, caja y CEDIS, que son las rutas de mayor riesgo solicitadas.
- La revisión de código muerto se limitó a referencias, compilación, lint y marcadores; no se hizo instrumentación de cobertura de producción. No se encontraron `TODO`, `FIXME`, `HACK` o `XXX` en TypeScript/Markdown/YAML de aplicación, pero eso no demuestra ausencia total de código inalcanzable.

## 3. Matriz de auditoría integral

| Área | Estado | Evidencia / conclusión |
|---|---:|---|
| Arquitectura y responsabilidades | **FAIL** | Hay 27 módulos de negocio y límites reconocibles, pero servicios de 2,100–3,377 líneas concentran cálculo, políticas, persistencia, proyecciones y serialización. |
| Backend y API | **FAIL** | Los endpoints existen y validan DTO, pero los flujos reales revelaron venta por pieza a $0 y cobranza post-cierre imposible. |
| Frontend | **FAIL** | POS y backend usan fórmulas distintas para `PIECE`; rutas eager producen un bundle de 1.97 MB minificado. |
| PostgreSQL, Prisma y schema | **PASS con observaciones** | Schema válido; 60 migraciones aplicaron en limpio; hay constraints de no negativos, reservas e historial. Persisten inconsistencias semánticas creadas por servicios. |
| Migraciones y seeds | **PARTIAL** | Migraciones sanas. El seed operativo calcula piezas por su cuenta y puede ocultar el bug del endpoint; bootstrap productivo no está conectado al despliegue. |
| Autenticación y sesiones | **PASS funcional / deuda de rendimiento** | JWT, rotación de refresh, hash de sesión, revocación e inactividad funcionan; cada petición autenticada escribe `lastUsedAt`. |
| Autorización y roles | **FAIL** | Guards globales fallan cerrados, pero `COLLECTIONS` no puede abrir el turno requerido para cobrar efectivo. |
| Seguridad de aplicación | **PARTIAL** | Helmet, CORS estricto, body limit, validación `whitelist`, errores 500 sanitizados y timeouts externos presentes; auditoría de dependencias: 0 vulnerabilidades. Gitleaks local pendiente. |
| Transacciones y concurrencia | **PARTIAL** | Ventas, CxC, traspasos y cierres usan transacciones/locks/versiones; ajuste de inventario es atómico pero no idempotente. |
| Inventario y movimientos | **FAIL** | El balance global puede cuadrar mientras el ledger por tipo no; reintentos de ajuste duplican cantidades. |
| Entradas/compras | **PASS en ejercicio** | Compra creó partidas y movimientos correctos en kg/pieza; no se probó concurrencia masiva. |
| Salidas/mermas | **FAIL parcial** | Merma operativa normal fue correcta; merma por faltante de recepción declaró cantidad sin delta. |
| Traspasos | **FAIL de trazabilidad** | Origen y recepción usan transacción e idempotencia, pero la semántica de la variación es contradictoria. |
| Ventas | **FAIL crítico** | Venta `PIECE` puede quedar `CONFIRMED/PAID` a $0 con inventario decrementado. |
| Pagos y CxC | **FAIL crítico** | El saldo exitoso cuadra, pero pagos posteriores quedan ligados indebidamente al corte de la venta original. |
| Corte de caja | **FAIL de negocio / PASS interno** | El corte reproduce sus propios registros, pero no detecta la venta por pieza omitida. |
| CEDIS, sucursales y jerarquía | **PARTIAL** | Jerarquía y scopes existen; el ciclo cierra atómicamente, pero revisión diaria permite un estado que después bloquea el ciclo. |
| Plantillas/configuraciones | **PASS limitado** | `SaleDocument` conserva `printTemplateVersion=1`, acorde al spec de versionado; no existe catálogo de plantillas y el canon actual no exige uno. |
| Errores y estados | **FAIL** | Se alcanzó una venta pagada a cero y un cierre `REVIEWED` con diferencia obligatoria aún pendiente. Un 429 de login se muestra como credenciales inválidas. |
| Rendimiento | **FAIL** | Consultas de producto por partida dentro de transacción serializable, escritura de sesión por request y bundle frontend sin code splitting. |
| Tests | **FAIL de suficiencia** | 856 backend y 325 frontend pasan, pero solo hay 3 casos E2E y falta el viaje inventario+dinero+traspaso+cierre. |
| Docker y despliegue | **FAIL/PENDIENTE runtime** | Compose productivo omite variables obligatorias y no ejecuta bootstrap; runtime Docker no disponible localmente. |
| CI/CD | **PARTIAL** | CI cubre calidad, PostGIS, Docker, dependencias y secretos; no prueba el compose productivo ni bootstrap y usa npm mientras la operación local indicada actualmente usa pnpm. |
| Duplicación/código muerto/TODO | **PARTIAL** | Sin marcadores TODO; duplicación de lógica de ventana operativa y tamaño de servicios elevan riesgo. Ausencia total de dead code no demostrada. |
| Documentación vs implementación | **FAIL** | README declara que solo existe el bootstrap y que no hay módulos, Prisma, endpoints ni UI, lo contrario al repositorio actual. |

## 4. Hallazgos

### AUD-001 — Venta por pieza registra valor y costo cero
COMPLETED

- **Severidad:** CRÍTICA
- **Categoría:** ventas, inventario, dinero, consistencia frontend/backend/DB
- **Archivos afectados:** `backend/src/modules/sales/sales.service.ts:845-875,2170-2257`; `frontend/src/features/ventas/posLogic.ts:64-84`; `specs/.specs/02-database/entities.md:127-140`; `specs/.specs/00-business/business-rules.md:51-55`.
- **Módulo:** Sales / POS.
- **Descripción exacta:** para un producto `PIECE`, el backend valida `quantityPieces`, pero calcula `billableQuantityKg` solo con kilos o piezas convertidas mediante equivalencia. Una pieza pura no tiene equivalencia y termina con cantidad facturable 0.
- **Cómo se produce:** `quantityKg=0`, `quantityPieces>0`, `unit=PIECE`; `subtotal = unitPrice × billableQuantityKg = precio × 0`.
- **Cómo reproducirlo:** crear una venta de 2 piezas del producto `cmsno9po00015ydxyqf1krgej` a $12.00. Con pago $24.00 responde 400 porque el pago excede el total $0.00; con `payments=[]` responde 201.
- **Evidencia encontrada:** `SALE-000003` (`cmsnof8xj002nyd5lxbvw1l2k`) quedó `CONFIRMED`, `PAID`, total $0.00. `SaleItem`: `quantityPieces=2`, `quantity=0`, `unitPrice=12`, `subtotal=0`, `costSubtotalSnapshot=0`. Inventario sucursal: 9 → 7 piezas. El POS frontend calcula `2 × 12 = 24`.
- **Impacto:** entrega gratuita, margen/costo omitido, caja aparentemente cuadrada, impuestos/reportes/documentos/CEDIS contaminados y posible fraude operativo.
- **Comportamiento actual:** inventario disminuye y la venta queda pagada a cero.
- **Comportamiento esperado:** una partida `PIECE` usa `quantityPieces` como cantidad facturable; subtotal $24.00, costo $16.00 y `CASH_SALE` exige pago exacto $24.00.
- **Causa raíz:** se reutilizó un campo conceptual `billableQuantityKg` para tres unidades; el modelo monetario confunde dimensión de cobro con kilos equivalentes.
- **Solución propuesta:** introducir una cantidad monetaria por unidad capturada (`billableQuantity`) y un cálculo de dominio exhaustivo por `KG`, `PIECE` y `KG_AND_PIECE`; prohibir ventas de total cero con cantidades positivas.
- **Cambios necesarios:** **código:** cálculo/persistencia en Sales y validador de consistencia; **DB:** localizar ventas históricas `PIECE` con cantidad positiva y total/costo cero, remediarlas de forma auditable, sin UPDATE silencioso; **API:** mantener cantidad/unidad explícitas; **UI:** mostrar error estable si backend rechaza inconsistencia y conservar fórmula compartida; **documentación:** fijar ecuaciones por unidad.
- **Tests necesarios:** unitarios para pieza pura y mixta; integración venta+movimiento+Payment; E2E POS de 2 piezas; propiedad `sum(items.total)=sale.total`; regresión de costo y CEDIS.
- **Riesgo de regresión:** ALTO, por impacto en equivalencias, descuentos, documentos, inventario y seed operativo.
- **Dependencias:** debe corregirse antes de AUD-004, AUD-012 y de cualquier remediación histórica.

### AUD-002 — Cobranza posterior bloqueada por el corte de la venta original

COMPLETED

- **Severidad:** CRÍTICA
- **Categoría:** cuentas por cobrar, pagos, corte diario, reglas de negocio
- **Archivos afectados:** `backend/src/modules/accounts-receivable/accounts-receivable.service.ts:128-310,545-601`; `specs/.specs/03-api/accounts-receivable-api.md:47-92`; tests del mismo servicio.
- **Módulo:** Accounts Receivable / Daily Close / Cash Management.
- **Descripción exacta:** al cobrar una CxC, el servicio toma el `pointOfSaleDailyClose` de la venta como corte autoritativo, lo bloquea y exige que el turno actual pertenezca al mismo corte. Si aquel día está cerrado, rechaza incluso un pago `TRANSFER` que no necesita turno.
- **Cómo se produce:** venta a crédito día D → cerrar corte D → intentar pago en D+1 o después del cierre.
- **Cómo reproducirlo:** sobre CxC `cmsnof8vi002hyd5l5askr7sf`, saldo $124.00 después del cierre, enviar pago `TRANSFER` de $10.00 con `Idempotency-Key` nuevo.
- **Evidencia encontrada:** HTTP 400 `DAILY_CLOSE_REOPEN_REQUIRED`; no se creó `Payment` y el saldo permaneció $124.00. El spec exige que el pago en efectivo derive el corte del turno actual y que cobros de ruta sigan `RouteSettlement`; no exige reabrir el día de venta.
- **Impacto:** cobranza ordinaria multi-día imposible, saldos envejecen falsamente y el negocio debe reabrir periodos históricos para recibir dinero.
- **Comportamiento actual:** el origen temporal del pago se confunde con el origen temporal de la venta.
- **Comportamiento esperado:** el pago se asigna al corte/turno/ruta del momento y lugar de cobro; la venta y CxC conservan relación histórica sin mutar el corte original.
- **Causa raíz:** selección de `authoritativeDailyCloseId` prioriza `sale.pointOfSaleDailyCloseId` y se usa tanto para bloqueo como para recalcular.
- **Solución propuesta:** separar `saleDailyCloseId` de `collectionDailyCloseId`; transferencias no requieren turno; efectivo de punto fijo usa el turno abierto actual; el pago actualiza CxC/venta y recalcula solo el cierre de cobro cuando esté en estado mutable.
- **Cambios necesarios:** **código/API:** AccountsReceivableService y resolución de CashShift; **DB:** no se requiere cambio estructural, ya existe `Payment.pointOfSaleDailyCloseId`; **UI:** pedir turno/dispositivo solo para CASH fijo y mostrar el corte de cobro; **specs:** aclarar contabilización multi-día.
- **Tests necesarios:** D+1 CASH, D+1 TRANSFER, ruta, venta sin corte, corte de venta cerrado, idempotencia, concurrencia de dos pagos y sobrepago.
- **Riesgo de regresión:** ALTO; puede duplicar o asignar cobros al corte equivocado si se mezcla la recálculo.
- **Dependencias:** relacionado con AUD-007 y AUD-012; resolver antes de reescribir tests que hoy esperan el rechazo.

### AUD-003 — El compose productivo no puede iniciar el backend

COMPLETED

- **Severidad:** CRÍTICA
- **Categoría:** Docker, configuración, despliegue
- **Archivos afectados:** `docker-compose.production.yml:15-44`; `backend/src/modules/delivery/routing-providers.service.ts:40-52`; `.env.example:24-27`.
- **Módulo:** Infraestructura / Delivery Routing.
- **Descripción exacta:** `RoutingProvidersService` exige en su constructor `PHOTON_URL`, `VROOM_URL` y `OSRM_URL`; el servicio backend de `docker-compose.production.yml` no propaga ninguna.
- **Cómo se produce:** levantar el backend con la configuración exacta del compose productivo.
- **Cómo reproducirlo:** iniciar `start:prod` sin esas variables. El proceso termina antes de escuchar HTTP con `Error: PHOTON_URL is required`.
- **Evidencia encontrada:** el compose de desarrollo sí define las tres variables en líneas 61, 62 y 71; el productivo no. El backend inició solo al suministrarlas explícitamente.
- **Impacto:** indisponibilidad total en un despliegue productivo construido desde el archivo oficial.
- **Comportamiento actual:** una dependencia opcional desde la perspectiva operativa de ventas es obligatoria al construir el módulo y derriba toda la aplicación.
- **Comportamiento esperado:** el compose satisface todas las variables obligatorias o el módulo de mapas degrada explícitamente sin impedir el resto del ERP.
- **Causa raíz:** deriva entre `.env.example`/compose de desarrollo y compose productivo; no hay prueba de arranque de compose productivo.
- **Solución propuesta:** declarar URLs/timeout administrados en producción y agregar validación de configuración previa; decidir de forma explícita si routing es obligatorio o degradable.
- **Cambios necesarios:** **config/Docker:** compose productivo y runbook; **código:** solo si se aprueba modo degradado; **DB/API/UI:** ninguno.
- **Tests necesarios:** `docker compose -f docker-compose.production.yml config`; arranque/healthcheck con servicios stub o reales; prueba negativa de variable faltante con mensaje accionable.
- **Riesgo de regresión:** MEDIO; cambio de infraestructura aislado, pero rutas podrían apuntar a servicios inseguros o inexistentes.
- **Dependencias:** coordinar con AUD-008 y la validación CI de despliegue.

### AUD-004 — Descuentos de cabecera no se distribuyen a partidas

EN PROCESO

- **Severidad:** ALTA
- **Categoría:** integridad financiera, facturación administrativa
- **Archivos afectados:** `backend/src/modules/sales/sales.service.ts:716-730,845-875,1065-1080`; `specs/modules/billing-reportable-notes/spec.md:70-76,109`.
- **Módulo:** Sales / Billing Requests / Billing Reports.
- **Descripción exacta:** la venta aplica descuento al total de cabecera, pero cada `SaleItem` persiste `discount=0`, `taxableBase=subtotal` y `total=subtotal`. La solicitud de facturación guarda el total descontado en el documento y los totales sin descuento en `BillingRequestSaleItem`.
- **Cómo se produce:** venta de dos o más partidas con autorización de descuento y solicitud de documento inmediata.
- **Cómo reproducirlo:** crear venta con subtotal S y descuento D>0; comparar suma de `SaleItem.total`, `Sale.total`, `BillingRequestSaleDocument.requestedTotal` y suma de `requestedItems.requestedTotal`.
- **Evidencia encontrada:** el código asigna descuento solo en cabecera y copia importes predescuento por partida; contradice el validador canónico que exige ecuaciones por partida y sumas contra cabecera.
- **Impacto:** partidas no conciliables, reserva/aplicación de factura por importes superiores, reportes de base/total incorrectos y remediaciones bloqueadas.
- **Comportamiento actual:** cabecera descontada y partidas sin descuento.
- **Comportamiento esperado:** distribución monetaria determinista y redondeada; sumas exactas de partida igualan cabecera y reservas.
- **Causa raíz:** descuento modelado como atributo exclusivo de Sale aunque la autoridad de facturación es `SaleItem`.
- **Solución propuesta:** prorrateo canónico por subtotal con asignación explícita del residuo de centavos; persistir descuento/base/total finales por partida antes de crear documentos.
- **Cambios necesarios:** **código:** Sales y BillingRequest; **DB:** remediación versionada de ventas afectadas; **API/UI:** exponer el desglose; **documentos:** actualizar snapshots.
- **Tests necesarios:** una/múltiples partidas, centavos, 100%, límites, reserva parcial exacta, exportes y validator.
- **Riesgo de regresión:** ALTO.
- **Dependencias:** aplicar después del nuevo kernel monetario de AUD-001.

### AUD-005 — Merma de recepción declara cantidad sin cambio de saldo

COMPLETED

- **Severidad:** ALTA
- **Categoría:** inventario, traspasos, trazabilidad CEDIS
- **Archivos afectados:** `backend/src/modules/inventory/inventory-transfers.service.ts:736-810`; reconciliación de ciclos CEDIS.
- **Módulo:** Inventory Transfers / Branch Supply Receipts.
- **Descripción exacta:** el destino incrementa solo lo recibido y luego crea un movimiento `SHRINKAGE` por la diferencia usando el saldo actual como anterior y nuevo. El movimiento contiene `quantityPieces=1`, pero `previousQuantityPieces=newQuantityPieces=9`.
- **Cómo se produce:** enviar 10 piezas y confirmar recepción de 9.
- **Cómo reproducirlo:** confirmar el recibo `ffbf4feb-17b1-4f48-b64a-96cdc11ef23e` del traspaso `cmsnodsaa000syd5lwa15hgob` con 9 de 10 piezas.
- **Evidencia encontrada:** `TRANSFER_IN` destino 0→9 por 9 piezas; `SHRINKAGE` posterior por 1 pieza con 9→9.
- **Impacto:** dos ecuaciones incompatibles: sumar/restar `movement.quantity` da un saldo, mientras usar `new-previous` da otro; auditorías y reportes pueden descontar la merma dos veces o no descontarla.
- **Comportamiento actual:** el faltante se modela como marcador cuantitativo sin impacto, pero usa el mismo tipo que una merma física con impacto.
- **Comportamiento esperado:** definir una sola semántica. Recomendación: la mercancía faltante nunca entra al destino; registrar una variación de tránsito separada de `SHRINKAGE`, o reconocerla en una ubicación de tránsito con delta real.
- **Causa raíz:** se quiso preservar la diferencia sin crear ubicación/entidad contable de tránsito y se reutilizó `InventoryMovement` con campos contradictorios.
- **Solución propuesta:** introducir tipo/entidad de `TRANSFER_VARIANCE` con enviado/recibido/diferencia, o ubicación de tránsito; impedir por constraint/validador que un movimiento decremental positivo tenga delta cero.
- **Cambios necesarios:** **DB:** enum/campos o tabla de variación y migración; **código:** recepción, reportes y reconciliación; **API/UI:** mostrar faltante sin mezclarlo con saldo destino.
- **Tests necesarios:** faltante/sobrante kg y pieza, ecuación por ubicación, global, reintento idempotente y ciclo CEDIS.
- **Riesgo de regresión:** ALTO.
- **Dependencias:** resolver antes de AUD-010 y antes de confiar en reportes de movimientos.

### AUD-006 — Ajustes de inventario no son idempotentes

EN PROCESO

- **Severidad:** ALTA
- **Categoría:** idempotencia, concurrencia, inventario
- **Archivos afectados:** `backend/src/modules/inventory/inventory.controller.ts:34-44`; `backend/src/modules/inventory/inventory.service.ts:176-254`; schema/migración futura.
- **Módulo:** Inventory.
- **Descripción exacta:** `POST /inventory/adjustments` no recibe `Idempotency-Key`, no persiste hash del payload y cada invocación crea un nuevo movimiento y vuelve a modificar el balance.
- **Cómo se produce:** timeout del cliente después de commit y reintento automático/manual de la misma solicitud.
- **Cómo reproducirlo:** enviar dos veces el mismo `INITIAL`/`ADJUSTMENT_IN` con idéntico payload; ambas llamadas son aceptadas.
- **Evidencia encontrada:** la operación es `Serializable`, pero no busca un evento existente antes de `increase/decrease` y `inventoryMovement.create`.
- **Impacto:** stock duplicado o pérdida duplicada, aun cuando cada transacción aislada sea atómica.
- **Comportamiento actual:** atomicidad sin garantía de ejecución única.
- **Comportamiento esperado:** misma clave+payload devuelve el resultado previo; misma clave+payload distinto responde conflicto.
- **Causa raíz:** se trató el ajuste como CRUD y no como comando financiero/inventariable reintentable.
- **Solución propuesta:** contrato `Idempotency-Key`, hash canónico y unicidad persistida; usar evento/registro dedicado o columnas protegidas.
- **Cambios necesarios:** **DB:** clave/hash/índice único; **backend/API:** controller/service/replay; **UI:** generar y conservar clave hasta respuesta terminal.
- **Tests necesarios:** replay, colisión, concurrencia real, timeout simulado, retry después de P2034.
- **Riesgo de regresión:** MEDIO-ALTO.
- **Dependencias:** ninguna; patrón reutilizable en otros comandos.

### AUD-007 — El rol COLLECTIONS no puede satisfacer el contrato de cobro en efectivo

- **Severidad:** ALTA
- **Categoría:** autorización, roles, caja, cobranza
- **Archivos afectados:** `backend/src/modules/accounts-receivable/accounts-receivable.controller.ts:56-76`; `backend/src/modules/cash-management/cash-management.controller.ts:97-148`; spec de CxC.
- **Módulo:** Accounts Receivable / Cash Management.
- **Descripción exacta:** registrar pago permite `ADMIN` y `COLLECTIONS`; abrir/consultar/cerrar turno permite `ADMIN` y `SELLER`. El cobro `CASH` fijo exige turno del actor. La intersección real es solo `ADMIN`.
- **Cómo se produce:** un usuario `COLLECTIONS` intenta recibir efectivo en sucursal.
- **Cómo reproducirlo:** con token COLLECTIONS, abrir turno: 403; sin turno, registrar CASH: rechazo por precondición.
- **Evidencia encontrada:** anotaciones `@Roles` incompatibles entre controladores; el spec autoriza COLLECTIONS y exige turno para CASH.
- **Impacto:** rol de cobranza no puede ejecutar su función sin compartir/admin elevar credenciales.
- **Comportamiento actual:** RBAC correcto por endpoint, pero incorrecto como flujo compuesto.
- **Comportamiento esperado:** el rol autorizado puede completar el viaje con privilegio mínimo.
- **Causa raíz:** permisos diseñados por pantalla/controlador y no por caso de uso de punta a punta.
- **Solución propuesta:** reemplazar intersecciones rígidas de rol por permisos (`collections.receive_cash`, `cash_shift.open_own`) y limitar turno propio/ubicación; alternativa: caja recibe el pago y COLLECTIONS solo registra no efectivo.
- **Cambios necesarios:** roles/permisos, guards, UI de cobranza/turno y specs.
- **Tests necesarios:** matriz ADMIN/SELLER/COLLECTIONS, ubicación ajena, turno ajeno, CASH/TRANSFER/ruta.
- **Riesgo de regresión:** ALTO por posible ampliación excesiva de privilegios.
- **Dependencias:** decidir junto con AUD-002.

### AUD-008 — Bootstrap productivo desconectado e incompleto para rotación

- **Severidad:** ALTA
- **Categoría:** despliegue, datos maestros, seguridad operacional
- **Archivos afectados:** `backend/prisma/bootstrap-production.ts`; `backend/package.json:15-17`; `docker-compose.production.yml:1-44`; `.env.example`.
- **Módulo:** Prisma bootstrap / Infraestructura.
- **Descripción exacta:** existe `bootstrap:production`, pero ni `migrate`, ni backend, ni compose productivo lo ejecutan. Una base recién migrada carece de roles, permisos, CEDIS, sucursal y administrador. Además, el `upsert` de usuario no actualiza `passwordHash` en la rama `update`.
- **Cómo se produce:** desplegar sobre PostgreSQL vacío usando únicamente los mecanismos del compose productivo.
- **Cómo reproducirlo:** aplicar migraciones y arrancar; consultar roles/usuarios/ubicaciones: vacíos. Reejecutar bootstrap con nueva `SEED_ADMIN_PASSWORD`: el admin existente conserva hash anterior.
- **Evidencia encontrada:** script en package.json sin consumidor; servicio `migrate` está tras perfil `migration`; `.env.example` ni compose productivo declaran `SEED_ADMIN_PASSWORD`.
- **Impacto:** instalación técnicamente sana pero inoperable; rotación asumida que no ocurre.
- **Comportamiento actual:** bootstrap manual, no documentado y parcialmente idempotente.
- **Comportamiento esperado:** paso one-shot explícito, auditable y obligatorio, separado del startup normal; política clara para crear/rotar admin.
- **Causa raíz:** se creó el script sin integrarlo a la topología de despliegue.
- **Solución propuesta:** servicio/perfil `bootstrap` dependiente de migración, runbook y verificación de postcondiciones; no rotar contraseña silenciosamente: comando explícito o secreto one-shot con política documentada.
- **Cambios necesarios:** compose, `.env.example`, README/runbook, bootstrap y pruebas.
- **Tests necesarios:** DB vacía, reejecución, ausencia de secreto, roles/permisos completos, admin existente y rotación explícita.
- **Riesgo de regresión:** ALTO si un despliegue reescribe credenciales inesperadamente.
- **Dependencias:** coordinar con AUD-003.

### AUD-009 — `dateTo` excluye el día civil solicitado

- **Severidad:** ALTA
- **Categoría:** consultas, frontend/backend, reportes operativos
- **Archivos afectados:** `sales.service.ts:468,2772`; `purchases.service.ts:656`; `customers.service.ts:329`; `billing-requests.service.ts:1400`; `inventory.service.ts:501`; `inventory-transfers.service.ts:1997`; filtros frontend correspondientes.
- **Módulo:** transversal.
- **Descripción exacta:** las UI envían `AAAA-MM-DD`; backend usa `lte: new Date(dateTo)`, que representa las 00:00. Solo incluye exactamente la medianoche, no el resto del día.
- **Cómo se produce:** elegir la misma fecha inicial/final en historial.
- **Cómo reproducirlo:** `GET /api/sales` devolvió 3 ventas; `GET /api/sales?dateFrom=2026-08-10&dateTo=2026-08-10` devolvió 0.
- **Evidencia encontrada:** prueba HTTP real y patrón repetido en seis servicios.
- **Impacto:** ventas, compras, movimientos, clientes y solicitudes aparentemente faltantes; cierres/reportes manuales falsos.
- **Comportamiento actual:** rango cerrado contra inicio del último día.
- **Comportamiento esperado:** intervalo semiabierto `[inicio(dateFrom), inicio(día siguiente a dateTo))` en zona acordada.
- **Causa raíz:** conversión dispersa de fecha civil a `Date` sin helper de dominio.
- **Solución propuesta:** normalizador compartido de rangos civiles con validación de orden y zona; usar `gte`/`lt`.
- **Cambios necesarios:** helper backend, todos los servicios, DTO/OpenAPI y tests UI/API; DB sin cambios.
- **Tests necesarios:** mismo día, fin de mes/año, DST/zonas, timestamps exactos en límites.
- **Riesgo de regresión:** MEDIO.
- **Dependencias:** relacionado con AUD-011.

### AUD-010 — El cierre puede revisarse con diferencias obligatorias pendientes

- **Severidad:** ALTA
- **Categoría:** estados, cierre diario, CEDIS
- **Archivos afectados:** `point-of-sale-daily-close.service.ts:965-1122,1887-1895`; `branch-supply-cycles.service.ts:560-624`.
- **Módulo:** Daily Close / Branch Supply Cycle.
- **Descripción exacta:** `validateWithin` devuelve diferencias, pero `valid` solo depende de errores de ubicación/turno/conteo; `review` permite `DRAFT→REVIEWED` con `SCALE_DIFFERENCE=PENDING_JUSTIFICATION`. El ciclo CEDIS después rechaza cerrar, mientras justificar/autorizar exige `DRAFT`.
- **Cómo se produce:** diferencia de báscula no justificada, validar y revisar, luego cerrar ciclo.
- **Cómo reproducirlo:** en cierre `cmsnof8qz001nyd5l5jprkrba`, revisar con diferencia -5 kg; cerrar ciclo `cmsnods98000oyd5ls9vq8v02`.
- **Evidencia encontrada:** revisión exitosa; cierre CEDIS 409 por diferencias; fue necesario reabrir administrativamente, justificar, autorizar, validar y revisar de nuevo.
- **Impacto:** estado operativo estancado y reaperturas evitables de periodo.
- **Comportamiento actual:** “válido para revisar” no equivale a “cerrable por CEDIS”.
- **Comportamiento esperado:** impedir review si una diferencia obligatoria no está resuelta, o permitir resolverla controladamente en REVIEWED antes del cierre.
- **Causa raíz:** dos máquinas de estado aplican criterios de completitud distintos.
- **Solución propuesta:** política única de blockers compartida por validate/review/cycle close; devolver códigos accionables antes de transicionar.
- **Cambios necesarios:** servicios de cierre/ciclo, API de estados, UI y specs.
- **Tests necesarios:** cada estado de diferencia, review, close coordinado, version conflict y reapertura.
- **Riesgo de regresión:** ALTO.
- **Dependencias:** AUD-005 debe fijar semántica de variaciones primero.

### AUD-011 — La ventana operativa ignora `APP_TIMEZONE`

- **Severidad:** MEDIA
- **Categoría:** tiempo, configuración, cierre
- **Archivos afectados:** `point-of-sale-daily-close.service.ts:2432-2453`; `branch-supply-cycles.service.ts:2119-2128`; `backend/src/config/app.config.ts`.
- **Módulo:** Daily Close / CEDIS.
- **Descripción exacta:** la fecha actual se obtiene con `APP_TIMEZONE`, pero la ventana se fija a 06:00 UTC y 24 horas en dos implementaciones separadas.
- **Cómo se produce:** configurar otra zona IANA o una zona/fecha con cambio DST.
- **Cómo reproducirlo:** usar `APP_TIMEZONE=America/Cancun` o una zona con DST y crear operaciones alrededor de medianoche local; comparar asignación al businessDate.
- **Evidencia encontrada:** `Date.UTC(..., 6)` hardcodeado en ambos servicios.
- **Impacto:** operaciones unidas al corte/ciclo equivocado y filtros de cierre inconsistentes con la fecha mostrada.
- **Comportamiento actual:** la configuración es parcialmente ceremonial.
- **Comportamiento esperado:** límites derivados de fecha civil+zona mediante una única utilidad probada.
- **Causa raíz:** supuesto geográfico codificado y duplicado.
- **Solución propuesta:** servicio temporal compartido que convierta intervalos locales a UTC, con política explícita para DST.
- **Cambios necesarios:** código/config/tests; DB/API sin cambio estructural.
- **Tests necesarios:** México, Cancún, zona con DST, límites exactos.
- **Riesgo de regresión:** MEDIO.
- **Dependencias:** usar el mismo helper que AUD-009.

### AUD-012 — La suite no prueba el flujo crítico completo y codifica una regla errónea

- **Severidad:** MEDIA
- **Categoría:** tests, cobertura, confiabilidad
- **Archivos afectados:** `backend/test/*.e2e-spec.ts`; specs unitarios de Sales/AccountsReceivable; frontend crítico.
- **Módulo:** transversal.
- **Descripción exacta:** pasan 856 tests backend y 325 frontend, pero hay solo 2 archivos E2E con 3 casos. No existe viaje compra→traspaso→recepción→venta→cobro→cierre. Sales no prueba creación exitosa `PIECE`; tests de CxC esperan `DAILY_CLOSE_REOPEN_REQUIRED`, consolidando el comportamiento contrario al canon.
- **Cómo se produce:** la calidad agregada supera umbrales aunque las combinaciones entre módulos no se ejecutan.
- **Cómo reproducirlo:** revisar cobertura/casos y ejecutar el día descrito en este documento; aparecen defectos no detectados por CI.
- **Evidencia encontrada:** backend 84.36% statements; frontend 59.10%; E2E deja registros append-only en DB y requiere base desechable; áreas frontend de inventario/reportes/cierre tienen cobertura baja.
- **Impacto:** falsa confianza; regresiones financieras pueden pasar CI.
- **Comportamiento actual:** predominan pruebas unitarias con mocks y contratos aislados.
- **Comportamiento esperado:** un corpus E2E desechable con conciliación independiente y invariantes cruzadas.
- **Causa raíz:** métricas globales sin matriz de journeys críticos.
- **Solución propuesta:** fixture de día operativo reproducible, DB única por ejecución y asserts de saldos, movimientos, pagos, estados e idempotencia.
- **Cambios necesarios:** tests/fixtures/CI; no cambiar producción como parte de esta tarea de prueba salvo para corregir defectos.
- **Tests necesarios:** el ejercicio completo de §5, más carreras de pago/ajuste/venta/traspaso.
- **Riesgo de regresión:** BAJO al agregar pruebas; costo de mantenimiento MEDIO.
- **Dependencias:** escribir expectativas correctas después de AUD-001, AUD-002, AUD-004 y AUD-005.

### AUD-013 — Servicios transaccionales y POS concentran demasiadas responsabilidades

- **Severidad:** MEDIA
- **Categoría:** arquitectura, mantenibilidad
- **Archivos afectados:** `sales.service.ts` (3,377 líneas); `point-of-sale-daily-close.service.ts` (2,474); `branch-supply-cycles.service.ts` (2,224); `inventory-transfers.service.ts` (2,134); `SalesPosPage.tsx` (1,829).
- **Módulo:** Sales, Daily Close, CEDIS, Inventory, POS frontend.
- **Descripción exacta:** una sola clase/componente mezcla reglas, permisos, queries, locks, idempotencia, proyección, documentos y transformación HTTP/UI.
- **Cómo se produce:** cualquier cambio monetario atraviesa bloques distantes y mocks extensos.
- **Cómo reproducirlo:** medir archivos y rastrear la creación de venta desde cálculo hasta documentos/realtime en una clase.
- **Evidencia encontrada:** tamaños indicados; AUD-001 y AUD-004 comparten el mismo método gigante y escaparon de tests.
- **Impacto:** alto costo cognitivo, transacciones más largas y regresión cruzada.
- **Comportamiento actual:** arquitectura modular por carpetas, pero no por responsabilidades internas.
- **Comportamiento esperado:** servicios de aplicación pequeños sobre políticas/calculadores puros y repositorios/orquestadores claros.
- **Causa raíz:** crecimiento incremental sin extracción posterior de dominios estables.
- **Solución propuesta:** después de congelar comportamiento con tests, extraer `SalePricing`, `SaleConsistency`, `CollectionPosting`, `DailyClosePolicy`, `TransferVariance` y hooks de persistencia.
- **Cambios necesarios:** refactor gradual, sin reescritura masiva ni cambio de contratos.
- **Tests necesarios:** caracterización antes de mover código, luego pruebas puras y de integración.
- **Riesgo de regresión:** ALTO si se refactoriza antes de corregir/cubrir reglas.
- **Dependencias:** posterior a AUD-012 y a correcciones funcionales.

### AUD-014 — Consultas y escrituras innecesarias en rutas calientes

- **Severidad:** MEDIA
- **Categoría:** rendimiento, concurrencia
- **Archivos afectados:** `sales.service.ts:2170-2193`; `auth.service.ts:166-186`; otros loops de partidas.
- **Módulo:** Sales / Auth.
- **Descripción exacta:** Sales ejecuta `product.findUnique` secuencial por partida dentro de una transacción serializable. Cada verificación de access token actualiza `AuthSession.lastUsedAt`.
- **Cómo se produce:** tickets con N partidas y tráfico autenticado alto.
- **Cómo reproducirlo:** trazar queries de una venta de N partidas y N requests API; se observan N lecturas de producto y una escritura de sesión por request.
- **Evidencia encontrada:** `for ... await findUnique`; `verifyAccessToken` hace `updateMany` siempre.
- **Impacto:** mayor latencia, tiempo bajo locks, conflictos serializables y carga de escritura.
- **Comportamiento actual:** consulta/escritura lineal por unidad de trabajo/request.
- **Comportamiento esperado:** productos cargados en lote; `lastUsedAt` actualizado por bucket/umbral conservando TTL seguro.
- **Causa raíz:** implementación directa y tracking de actividad sin amortización.
- **Solución propuesta:** `findMany id in (...)` y mapa; actualización de sesión solo si el timestamp está más viejo que un umbral atómico.
- **Cambios necesarios:** servicios y métricas; DB sin cambio obligatorio, índice de sesiones a revisar por plan.
- **Tests necesarios:** conteo de queries, carga, TTL/idle edge cases y concurrencia.
- **Riesgo de regresión:** MEDIO, especialmente en expiración de sesión.
- **Dependencias:** optimizar Sales después de AUD-001/AUD-004.

### AUD-015 — Bundle frontend monolítico y sin carga diferida por ruta

- **Severidad:** MEDIA
- **Categoría:** rendimiento frontend
- **Archivos afectados:** `frontend/src/app/router.tsx:1-53`; barrels de features; `vite.config.ts`.
- **Módulo:** Frontend shell/router.
- **Descripción exacta:** todas las páginas se importan eager. Build genera JS principal de 1,967.26 kB minificado y 517.43 kB gzip; Vite advierte chunk >500 kB.
- **Cómo se produce:** abrir login/POS descarga código de reportes, mapas, cobranza, CEDIS y administración.
- **Cómo reproducirlo:** `pnpm --dir frontend run build`.
- **Evidencia encontrada:** warning de Vite y ausencia de `React.lazy`/dynamic imports en router.
- **Impacto:** arranque lento, peor experiencia móvil/sucursal y más costo de parseo.
- **Comportamiento actual:** un chunk principal para casi todo el ERP.
- **Comportamiento esperado:** división por ruta/módulo con fallback y prefetch controlado.
- **Causa raíz:** router construido con imports estáticos.
- **Solución propuesta:** `lazy` por feature, separar librerías pesadas de mapas/exportes y presupuesto de bundle en CI.
- **Cambios necesarios:** router/barrels/Vite/tests de navegación.
- **Tests necesarios:** build budget, rutas RBAC con lazy, errores de carga y smoke visual.
- **Riesgo de regresión:** MEDIO.
- **Dependencias:** independiente de la corrección financiera.

### AUD-016 — El comando backend `start` no encuentra el artefacto compilado

- **Severidad:** BAJA
- **Categoría:** ejecutabilidad local, scripts
- **Archivos afectados:** `backend/package.json:11-17`; configuración Nest/TypeScript.
- **Módulo:** Backend tooling.
- **Descripción exacta:** tras build exitoso, `pnpm --dir backend run start` ejecuta `nest start` y busca `backend/dist/main`; el entrypoint real está en `dist/backend/src/main`.
- **Cómo se produce:** usar el comando `start` anunciado por package/README.
- **Cómo reproducirlo:** build y luego `pnpm --dir backend run start`.
- **Evidencia encontrada:** `MODULE_NOT_FOUND: backend/dist/main`; `start:prod` sí apunta a la ruta real y fue ejecutable.
- **Impacto:** onboarding/operación local rota; Docker actual no se afecta porque usa `start:prod`.
- **Comportamiento actual:** build pasa, comando por defecto falla.
- **Comportamiento esperado:** todos los scripts publicados apuntan al mismo entrypoint válido.
- **Causa raíz:** desalineación de `sourceRoot/outDir` y script Nest.
- **Solución propuesta:** corregir configuración de build o script, sin mantener dos layouts ambiguos.
- **Cambios necesarios:** package/Nest config y README.
- **Tests necesarios:** smoke `build && start` contra `/health/ready`.
- **Riesgo de regresión:** BAJO.
- **Dependencias:** actualizar documentación en AUD-017.

### AUD-017 — Documentación y gestores de paquetes contradicen el proyecto actual

- **Severidad:** BAJA
- **Categoría:** documentación, CI/CD, configuración
- **Archivos afectados:** `README.md:1-66`; `docs/validation.md`; `.github/workflows/quality-gate.yml`; package/lockfiles; configuración Prisma en package.json.
- **Módulo:** gobierno del repositorio.
- **Descripción exacta:** README afirma que solo existe foundation y no hay módulos, endpoints, guards, Prisma ni UI. Comandos de README/docs/CI usan npm, mientras la regla operativa vigente exige pnpm. Prisma advierte que `package.json#prisma` está deprecado.
- **Cómo se produce:** seguir onboarding o validación documentada.
- **Cómo reproducirlo:** comparar README con 27 módulos, schema y UI; ejecutar Prisma validate para observar warning.
- **Evidencia encontrada:** contradicción literal en README línea 18; CI npm funciona con lockfiles propios, pero no reproduce exactamente el flujo local pnpm.
- **Impacto:** operadores ejecutan rutas equivocadas, resultados locales/CI divergen y el bootstrap productivo queda invisible.
- **Comportamiento actual:** fuentes auxiliares envejecidas.
- **Comportamiento esperado:** runbook único, comandos soportados y descripción real de módulos/deploy.
- **Causa raíz:** documentación inicial no actualizada y transición incompleta de tooling.
- **Solución propuesta:** decidir un gestor canónico; alinear CI, docs y lockfiles; mover configuración Prisma al formato vigente; documentar migración/bootstrap/healthcheck.
- **Cambios necesarios:** docs, workflow, package configs; sin cambios de negocio.
- **Tests necesarios:** ejecutar todos los comandos copiados desde docs en CI.
- **Riesgo de regresión:** BAJO-MEDIO por cambio de instalación reproducible.
- **Dependencias:** AUD-003, AUD-008 y AUD-016.

### AUD-018 — El frontend oculta la limitación por intentos de login

- **Severidad:** BAJA
- **Categoría:** manejo de errores, seguridad UX
- **Archivos afectados:** cliente/mapeo de errores de autenticación y pantalla Login.
- **Módulo:** Frontend Auth.
- **Descripción exacta:** después de cinco logins, backend aplicó rate limit y respondió 429; la UI mostró el mensaje genérico de correo/contraseña o usuario inactivo.
- **Cómo se produce:** superar `RATE_LIMIT_LOGIN_ACCOUNT_MAX=5`.
- **Cómo reproducirlo:** seis intentos de login para la misma cuenta dentro de la ventana.
- **Evidencia encontrada:** el bloqueo de backend funcionó, pero el mensaje no identificó espera/reintento.
- **Impacto:** usuario sigue intentando, prolonga bloqueo y soporte no distingue credenciales de throttling.
- **Comportamiento actual:** 429 se aplana a error de autenticación.
- **Comportamiento esperado:** mensaje específico, respeto de `Retry-After` cuando exista y botón temporalmente deshabilitado.
- **Causa raíz:** normalización demasiado genérica de errores de login.
- **Solución propuesta:** mapear 429 a estado de throttling sin revelar existencia de cuenta.
- **Cambios necesarios:** servicio/UI frontend; opcional header estable backend.
- **Tests necesarios:** 401 vs 429, cuenta inexistente, timer y accesibilidad.
- **Riesgo de regresión:** BAJO.
- **Dependencias:** ninguna.

## 5. Ejercicio operativo de un día

### 5.1 Datos iniciales trazables

| Entidad | Identificador | Dato |
|---|---|---|
| Fecha de negocio | `2026-08-10` | Día auditado |
| CEDIS | `migration-cedis-veracruz` | Origen/retorno |
| Sucursal Veracruz | `cmsno9n1j000rydxy5my6rc6b` | Destino/venta/caja |
| Producto kg | `cmsno9pmm0013ydxyfqsxp8wb` / `DEV-WHOLE-CHICKEN-KG` | venta $58.00/kg, costo $42.00/kg |
| Producto pieza | `cmsno9po00015ydxyqf1krgej` / `DEV-WINGS-PIECE` | venta $12.00/pza, costo $8.00/pza |
| Compra | `cmsnods7g000byd5lbsyyoiyp` | entrada 10 kg + 10 piezas |
| Ciclo CEDIS | `cmsnods98000oyd5ls9vq8v02` | ciclo sucursal/CEDIS |
| Traspaso suministro | `cmsnodsaa000syd5lwa15hgob` | 10 kg + 10 piezas enviados |
| Recepción | `ffbf4feb-17b1-4f48-b64a-96cdc11ef23e` | 10 kg + 9 piezas recibidos |
| Traspaso devolución | `cmsnohhah003gyd5lsqg04zq4` | 4 kg + 7 piezas devueltos |
| Turno de caja | `cmsnof8r4001pyd5ldkt63blc` | fondo inicial $100.00 |
| Corte diario | `cmsnof8qz001nyd5l5jprkrba` | cierre sucursal |

El inventario base se estableció mediante los ajustes reales del API: CEDIS 0→20 kg y 0→20 piezas. Ese saldo posterior al ajuste es el **inventario inicial** de la conciliación; los ajustes también se conservaron como evidencia y no se editaron directamente.

### 5.2 Operaciones ejecutadas

| # | Operación real | Registros/estado | Ubicación | Antes | Movimiento | Después | Dinero esperado | Dinero registrado |
|---:|---|---|---|---:|---:|---:|---:|---:|
| 1 | Ajuste inicial kg | `InventoryMovement`, confirmado | CEDIS | 0 kg | +20 kg | 20 kg | — | — |
| 2 | Ajuste inicial piezas | `InventoryMovement`, confirmado | CEDIS | 0 pza | +20 pza | 20 pza | — | — |
| 3 | Compra kg | Purchase `cmsnods7g...`, movimiento entrada | CEDIS | 20 kg | +10 kg | 30 kg | costo 10×42 = $420.00 | subtotal de partida $420.00 |
| 4 | Compra piezas | misma compra | CEDIS | 20 pza | +10 pza | 30 pza | costo 10×8 = $80.00 | subtotal de partida $80.00 |
| 5 | Suministro kg confirmado | Transfer `cmsnodsaa...`; OUT+IN | CEDIS→Sucursal | 30/0 kg | -10/+10 kg | 20/10 kg | — | — |
| 6 | Suministro piezas con faltante | mismo transfer; OUT 10, IN 9, SHRINKAGE 1 | CEDIS→Sucursal | 30/0 pza | -10/+9; faltante 1 | 20/9 pza | — | — |
| 7 | Venta contado 2 kg | `SALE-000001` `cmsnof8tg001ryd5lzlgglw27`, CONFIRMED/PAID; Payment `cmsnof8tv0022yd5lfo5axy7l` | Sucursal | 10 kg | -2 kg | 8 kg | $116.00 | $116.00 CASH |
| 8 | Venta crédito 3 kg | `SALE-000002` `cmsnof8vc0026yd5lupxd42tc`, CONFIRMED/UNPAID; AR `cmsnof8vi002hyd5l5askr7sf` | Sucursal | 8 kg | -3 kg | 5 kg | $174.00 | venta $174.00, cobro $0.00, CxC $174.00 |
| 9 | Merma operativa 1 kg | `InventoryMovement.SHRINKAGE` | Sucursal | 5 kg | -1 kg | 4 kg | — | — |
| 10 | Intento venta 2 piezas con pago | HTTP 400, sin registros | Sucursal | 9 pza | 0 | 9 pza | $24.00 | rechazada: pago excede total backend $0.00 |
| 11 | Venta 2 piezas sin pago | `SALE-000003` `cmsnof8xj002nyd5lxbvw1l2k`, CONFIRMED/PAID | Sucursal | 9 pza | -2 pza | 7 pza | $24.00 | **$0.00**, sin Payment |
| 12 | Cobro parcial CxC | Payment `cmsnof8yz002yyd5lnsw7a4dt`, APPLIED | Sucursal/turno | CxC $174 | -$50 saldo | CxC $124 | $50.00 | $50.00 CASH |
| 13 | Salida de efectivo | CashExpense | Sucursal/turno | — | -$10 | — | -$10.00 | -$10.00 |
| 14 | Cierre de turno | Shift CLOSED | Sucursal | esperado $256 | contado $256 | diferencia $0 | $256.00 según registros | $256.00 contado |
| 15 | Devolución kg | Transfer `cmsnohhah...` CONFIRMED | Sucursal→CEDIS | 4/20 kg | -4/+4 kg | 0/24 kg | — | — |
| 16 | Devolución piezas | mismo transfer | Sucursal→CEDIS | 7/20 pza | -7/+7 pza | 0/27 pza | — | — |
| 17 | Reapertura/justificación/revisión/cierre | DailyClose CLOSED v16; Cycle CLOSED v8 | Sucursal/CEDIS | diferencia báscula -5 kg pendiente | justificar+autorizar | cerrados | — | — |
| 18 | Cobro posterior por transferencia | HTTP 400 `DAILY_CLOSE_REOPEN_REQUIRED` | CxC | $124 | $0 aplicado | $124 | $10.00 | $0.00 |

La compra persistió subtotal total $500.00 y actualizó el costo de catálogo, pero el módulo actual no creó `Payment`, cuenta por pagar ni salida de caja asociada. Por ello el valor de compra se trata como costo de inventario y no entra en la conciliación de efectivo de este día.

### 5.3 Estados alcanzados y relaciones

| Relación | Verificación |
|---|---|
| Sale contado ↔ Payment ↔ turno ↔ corte | Presente para $116.00 |
| Sale crédito ↔ AccountReceivable | Presente; original $174.00 |
| AccountReceivable ↔ Payment parcial ↔ Sale | Presente para $50.00; saldo $124.00 |
| Sale ↔ InventoryMovement | Presente para ventas kg y pieza |
| Transfer ↔ TRANSFER_OUT/TRANSFER_IN | Presente |
| Recepción ↔ variación | Presente por referencia, pero el movimiento SHRINKAGE es matemáticamente contradictorio |
| Sale pieza ↔ valor/costo | **Inconsistente:** piezas y precio presentes, cantidad facturable/total/costo cero |
| Cobro post-cierre ↔ corte actual | **No creado:** la operación fue rechazada por el corte histórico |
| DailyClose ↔ BranchSupplyCycle | Finalmente ambos CLOSED, después de reapertura extraordinaria |

No se ejecutó SQL manual, `Prisma update`, ni edición directa para cuadrar. La devolución, reapertura, justificación y autorización fueron comandos reales del sistema y quedan en su historial. Se documentan porque fueron necesarios para terminar el ciclo, no como ocultamiento de la diferencia.

### 5.4 Inventario antes del retorno y final cerrado

| Momento | CEDIS kg | Sucursal kg | Global kg | CEDIS pza | Sucursal pza | Global pza |
|---|---:|---:|---:|---:|---:|---:|
| Inventario inicial | 20 | 0 | 20 | 20 | 0 | 20 |
| Después de compra | 30 | 0 | 30 | 30 | 0 | 30 |
| Después de suministro/recepción | 20 | 10 | 30 | 20 | 9 | 29 |
| Después de ventas/merma | 20 | 4 | 24 | 20 | 7 | 27 |
| Después de devolución y cierre | **24** | **0** | **24** | **27** | **0** | **27** |

### 5.5 Conciliación matemática independiente de inventario

#### Global kg

```text
Inventario inicial                  20 kg
+ entradas por compra               10 kg
+ traspasos recibidos globales       0 kg  (movimiento interno)
- ventas                             5 kg  (2 contado + 3 crédito)
- mermas                             1 kg
- traspasos enviados globales        0 kg  (movimiento interno)
= inventario final esperado         24 kg
Inventario final observado          24 kg
Diferencia                           0 kg
```

#### Global piezas

```text
Inventario inicial                  20 pza
+ entradas por compra               10 pza
- ventas                             2 pza
- faltante en tránsito               1 pza
= inventario final esperado         27 pza
Inventario final observado          27 pza
Diferencia                           0 pza
```

#### Ecuación de movimientos en sucursal, antes del retorno

```text
Saldo inicial                         0 pza
+ TRANSFER_IN                         9 pza
- SALE                                2 pza
- SHRINKAGE registrada                1 pza
= saldo según tipos                   6 pza
Saldo observado                       7 pza
Diferencia                            1 pza
```

La diferencia NO es de balance global: nace porque el `SHRINKAGE` por faltante contiene cantidad 1 pero `previousQuantityPieces=9` y `newQuantityPieces=9`. Si se usa delta de saldos, da 7; si se usan tipos/cantidades, da 6. Esto impide afirmar trazabilidad completa.

### 5.6 Conciliación independiente de ventas, CxC y caja

#### Ventas

| Venta | Cálculo independiente | Registrado | Diferencia |
|---|---:|---:|---:|
| 2 kg contado | 2 × $58.00 = $116.00 | $116.00 | $0.00 |
| 3 kg crédito | 3 × $58.00 = $174.00 | $174.00 | $0.00 |
| 2 piezas contado | 2 × $12.00 = $24.00 | **$0.00** | **-$24.00** |
| **Total** | **$314.00** | **$290.00** | **-$24.00** |

#### Cuenta por cobrar

```text
Importe original                    $174.00
- pago aplicado                      $50.00
= saldo esperado                    $124.00
Saldo observado                     $124.00
Diferencia                            $0.00

Intento posterior esperado           $10.00
Pago persistido                        $0.00  (rechazado)
Saldo posterior observado           $124.00
```

#### Caja según registros del sistema

```text
Efectivo inicial                    $100.00
+ cobro venta contado               $116.00
+ cobro parcial CxC                  $50.00
- salida/expense                     $10.00
= efectivo esperado por sistema     $256.00
Efectivo contado                    $256.00
Diferencia del sistema                $0.00
```

#### Caja según operación física esperada

```text
Efectivo esperado por sistema       $256.00
+ venta de 2 piezas omitida          $24.00
= efectivo esperado de negocio      $280.00
Efectivo contado                    $256.00
Diferencia real                      -$24.00
```

### 5.7 Snapshot final del corte y ciclo

| Campo persistido | Valor final |
|---|---:|
| `PointOfSaleDailyClose.status` | `CLOSED` |
| `PointOfSaleDailyClose.version` | 16 |
| `grossSalesTotal` | $290.00 |
| `cashTotal` | $166.00 |
| `expenseTotal` | $10.00 |
| `netCashExpected` | $256.00 |
| `cashCountedTotal` | $256.00 |
| `cashDifferenceTotal` | $0.00 |
| `SCALE_DIFFERENCE` | -5 kg, justificada y autorizada |
| `BranchSupplyCycle.status` | `CLOSED` |
| `BranchSupplyCycle.version` | 8 |
| Inventario final sucursal | 0 kg / 0 piezas |
| Inventario final CEDIS | 24 kg / 27 piezas |
| CxC final | $124.00, `PARTIALLY_PAID` |

Los snapshots append-only del ciclo conservan también las proyecciones anteriores con 4 kg/7 piezas pendientes. El snapshot vigente después del retorno quedó en cero para la sucursal; los anteriores son historial, no balances activos.

### 5.8 Conclusión del ejercicio

El sistema **sí puede recorrer** los endpoints de inventario inicial, compra, suministro, recepción, ventas, merma, cobro, turno y cierre. No puede hacerlo con resultado confiable de punta a punta:

- el cierre interno se autoconsiste con registros incompletos;
- el control independiente detecta $24.00 de producto entregado sin venta monetaria;
- la CxC queda correctamente en $124.00 para pagos aceptados, pero no admite el siguiente cobro tras cerrar;
- los balances finales globales coinciden, pero el ledger de la variación de tránsito no tiene una ecuación única;
- finalizar CEDIS exigió reabrir un cierre que el propio sistema había dejado revisar con diferencia pendiente.

## 6. Validaciones ejecutadas

| Validación | Resultado |
|---|---|
| `pnpm run test:guard` | PASS; sin tests enfocados/deshabilitados prohibidos |
| Prisma validate con `DATABASE_URL` de auditoría | PASS; warning por configuración Prisma deprecada en package.json |
| 60 migraciones sobre DB limpia | PASS |
| `prisma migrate status` | PASS; schema al día |
| Backend lint:check | PASS |
| Backend typecheck | PASS |
| Backend test:cov | PASS: 107 suites, 856 tests; 84.36% statements, 69.82% branches, 82.74% functions, 85.35% lines |
| Backend build | PASS |
| Backend `start:prod` | PASS con variables routing explícitas |
| Backend `start` | FAIL: no encuentra `backend/dist/main` |
| Frontend lint | Exit 0 con 16 warnings; incluye warnings en cambios locales preexistentes fuera de esta auditoría |
| Frontend typecheck | PASS |
| Frontend test:cov | PASS: 58 archivos, 325 tests; 59.10% statements, 55.48% branches, 52.04% functions, 60.58% lines |
| Frontend build | PASS con warning: chunk 1,967.26 kB / 517.43 kB gzip |
| Auditoría de dependencias | PASS: 0 vulnerabilidades no exceptuadas; dos advisories permitidos y fechados por política |
| E2E PostgreSQL/PostGIS | PASS: 2 suites, 3 tests; requieren base desechable y dejan datos append-only |
| Ejercicio HTTP real | FAIL de conciliación por AUD-001, AUD-002 y AUD-005 |
| Docker build/compose runtime | PENDIENTE: `zsh: operation not permitted: docker` |
| Gitleaks local | PENDIENTE: binario no disponible; CI lo configura |

Todas las ejecuciones pnpm que requerían procesos hijos usaron `OPENSSL_CONF=/dev/null` y `--config.script-shell=/bin/sh` por restricciones del sandbox. Ese ajuste no cambia el código ni la lógica probada.

## 7. Controles positivos verificados

No todo está roto. Los siguientes controles existen y se comprobaron estática o dinámicamente:

- guards globales JWT/permisos y metadatos explícitos en controladores;
- access token corto, refresh token rotado, hash persistido, revocación y sesión inactiva;
- Helmet, CORS por allowlist, límite de body y `ValidationPipe` con whitelist;
- errores 500 sanitizados e identificador de request;
- no se encontraron usos productivos de `dangerouslySetInnerHTML` ni tokens auth en localStorage/sessionStorage;
- llamadas externas de routing con `AbortController`/timeout;
- restricciones PostgreSQL para saldos no negativos y reservas no superiores al físico;
- locks/advisory locks/versiones/idempotencia en cierres, ciclos, traspasos, ventas y cobros principales;
- migraciones reproducibles en base limpia;
- eventos y snapshots CEDIS append-only;
- `Payment` es la fuente monetaria persistida para cobros aceptados;
- la auditoría de dependencias terminó sin vulnerabilidades bloqueantes.

Estos controles reducen riesgo, pero no compensan los defectos funcionales críticos demostrados.

## 8. Plan de implementación priorizado

No se implementa nada en esta auditoría. El orden siguiente evita corregir síntomas sobre ecuaciones equivocadas.

### 8.1 Críticas

#### P0.1 — Corregir el kernel monetario por unidad

- **Hallazgo:** AUD-001.
- **Archivos/módulos:** SalesService, DTO/modelos de cálculo, SaleConsistencyValidator, documentos, POS contracts, seed operativo.
- **Trabajo:** definir `billableQuantity` por unidad; bloquear total/costo cero con cantidad positiva; inventariar filas históricas y diseñar remediación versionada/auditable.
- **Pruebas de salida:** pieza pura $24/$16; kg; mixta con equivalencia; Payment exacto; movimiento; documento; CEDIS; E2E.

#### P0.2 — Separar fecha/corte de venta y fecha/corte de cobro

- **Hallazgo:** AUD-002.
- **Archivos/módulos:** AccountsReceivableService, CashManagement, DailyClose recalc, API/spec CxC.
- **Trabajo:** asociar cada Payment al contexto actual de cobro; nunca exigir reapertura del día de venta para una cobranza nueva.
- **Pruebas de salida:** pagos D+1 CASH/TRANSFER/ruta; corte histórico cerrado permanece inmutable; saldo y corte actual cuadran; retry seguro.

#### P0.3 — Hacer ejecutable la topología productiva

- **Hallazgo:** AUD-003.
- **Archivos/módulos:** `docker-compose.production.yml`, `.env.example`, RoutingProviders config, runbook/CI.
- **Trabajo:** suministrar variables o aprobar degradación explícita; smoke de healthcheck.
- **Pruebas de salida:** compose config válido, backend healthy y frontend dependiente healthy en entorno limpio.

### 8.2 Altas

#### P1.1 — Distribuir descuentos por partida

- **Hallazgo:** AUD-004; depende de P0.1.
- **Archivos:** Sales, BillingRequest, documentos, reports/remediation.
- **Pruebas:** ecuaciones exactas con residuos de centavo y selección parcial de partidas.

#### P1.2 — Modelar variaciones de tránsito sin falsear saldos

- **Hallazgo:** AUD-005.
- **Archivos:** InventoryTransfers, BranchSupplyReceipts, Prisma/migración, reportes, ciclo CEDIS.
- **Pruebas:** faltante/sobrante kg/pieza; ledger por ubicación y global; no doble descuento.

#### P1.3 — Agregar idempotencia a ajustes

- **Hallazgo:** AUD-006.
- **Archivos:** InventoryController/Service, DTO, Prisma/migración, UI.
- **Pruebas:** mismo key/payload replay, key distinto, key igual/payload distinto, concurrencia.

#### P1.4 — Cerrar el viaje RBAC de cobranza

- **Hallazgo:** AUD-007; coordinar con P0.2.
- **Archivos:** permisos, roles, controllers, cash shift scope, frontend y specs.
- **Pruebas:** matriz de rol/método/ubicación/turno sin ampliar acceso lateral.

#### P1.5 — Integrar bootstrap productivo seguro

- **Hallazgo:** AUD-008; depende de P0.3.
- **Archivos:** compose, bootstrap, `.env.example`, runbook, CI.
- **Pruebas:** fresh DB operable, rerun idempotente, secreto ausente, rotación explícita.

#### P1.6 — Unificar rangos de fecha civil

- **Hallazgo:** AUD-009; compartir base con P2.1.
- **Archivos:** utilidad temporal y todos los servicios/filtros listados.
- **Pruebas:** mismo día incluye operaciones completas; límites/zonas.

#### P1.7 — Alinear review y close de diferencias

- **Hallazgo:** AUD-010; después de P1.2.
- **Archivos:** DailyClose, BranchSupplyCycle, API/UI.
- **Pruebas:** ninguna transición deja un estado no resoluble.

### 8.3 Medias

#### P2.1 — Derivar la jornada desde IANA timezone

- **Hallazgo:** AUD-011.
- **Archivos:** servicio temporal compartido, DailyClose, CEDIS.
- **Pruebas:** UTC offsets, Cancún y DST.

#### P2.2 — Crear la suite E2E de conciliación

- **Hallazgo:** AUD-012.
- **Archivos:** `backend/test`, fixtures y workflow database.
- **Pruebas:** reproducir §5 automáticamente con asserts independientes y DB desechable por run.

#### P2.3 — Corregir manejo de 429

- **Hallazgo:** AUD-018.
- **Archivos:** auth service/UI.
- **Pruebas:** 401/403/429 y retry.

### 8.4 Bajas

#### P3.1 — Reparar scripts de arranque

- **Hallazgo:** AUD-016.
- **Archivos:** Nest/package scripts.
- **Pruebas:** build+start+health.

#### P3.2 — Actualizar documentación y tooling canónico

- **Hallazgo:** AUD-017; después de cambios de deploy/scripts.
- **Archivos:** README, validation, CI, lockfiles/config Prisma según decisión.
- **Pruebas:** comandos del runbook ejecutados por CI.

### 8.5 Mejoras de rendimiento

#### P4.1 — Reducir queries dentro de ventas

- **Hallazgo:** AUD-014.
- **Archivos:** SalesService/repositorio.
- **Pruebas:** presupuesto de queries O(1) por lote de partidas y carga concurrente.

#### P4.2 — Amortizar `AuthSession.lastUsedAt`

- **Hallazgo:** AUD-014.
- **Archivos:** AuthService.
- **Pruebas:** TTL idle exacto, update por umbral y concurrencia.

#### P4.3 — Code splitting frontend

- **Hallazgo:** AUD-015.
- **Archivos:** router/barrels/Vite.
- **Pruebas:** presupuesto de bundle, lazy routes y RBAC.

### 8.6 Mejoras de arquitectura/calidad

#### P5.1 — Extraer políticas después de congelar comportamiento

- **Hallazgo:** AUD-013.
- **Orden:** nunca antes de P0/P1 y P2.2.
- **Archivos:** servicios grandes y POS.
- **Pruebas:** caracterización, unitarias puras y contratos de integración sin cambiar API.

#### P5.2 — Gate de invariantes en CI

- **Hallazgos:** AUD-001, AUD-004, AUD-005, AUD-012.
- **Trabajo:** agregar verificadores que fallen si venta/costo por cantidad positiva es cero, si sumas de partidas difieren, o si delta de movimiento contradice tipo/cantidad.
- **Pruebas:** fixtures positivos/negativos y migración de datos preexistentes.

## 9. Criterios para declarar corregido el sistema

No debe declararse apto hasta que, sobre base limpia y mediante API/UI reales:

1. una venta de piezas registre cantidad, ingreso, costo, pago y movimiento coherentes;
2. el mismo día E2E termine con inventario global y por ubicación reproducible tanto por balances como por ledger;
3. una CxC pueda cobrarse en días posteriores sin mutar/reabrir el corte de venta;
4. caja interna y cálculo independiente produzcan el mismo resultado;
5. descuentos y reservas de facturación cuadren por partida y cabecera;
6. reintentos de cada mutación crítica sean idempotentes;
7. diferencias obligatorias se resuelvan antes de alcanzar estados no editables;
8. compose productivo arranque desde DB vacía, migre, bootstrappee y pase healthchecks;
9. el journey completo forme parte de CI, no solo de una auditoría manual;
10. no queden datos históricos corruptos sin plan de remediación auditable.

---

**Conclusión:** el sistema posee fundamentos y controles valiosos, pero hoy puede “cuadrar” usando sus propios registros mientras entrega inventario sin reconocer dinero. Esa es precisamente la clase de coherencia aparente que una auditoría de punta a punta debe rechazar.
