## Comandos de validación conocidos

Este documento es auxiliar.

Consultar solo cuando una TASK requiera ejecutar pruebas, build o TypeScript.

---

## Puerta obligatoria de CI

El workflow `.github/workflows/quality-gate.yml` se ejecuta en cada pull request
y en cada push a `main`. La rama protegida debe exigir el check **CI Gate** antes
de integrar cambios.

`CI Gate` solo aprueba cuando terminan correctamente:

- lint y TypeScript de backend y frontend;
- pruebas unitarias con umbrales mínimos de cobertura;
- rechazo de pruebas enfocadas o deshabilitadas;
- validación Prisma, migraciones sobre PostgreSQL/PostGIS limpio y pruebas e2e;
- build de las imágenes Docker de backend y frontend;
- auditoría de dependencias productivas y escaneo de secretos.

Para CFDI, el mismo gate fija `CFDI_ENABLED=false` y
`FISCAL_PROVIDER=NONE`, ejecuta el validador de assets fiscales y conserva el
corpus completo PostgreSQL después de `prisma migrate deploy`. La validación
local del escaneo es:

```bash
OPENSSL_CONF=/dev/null node --test scripts/validate-fiscal-assets.test.mjs
OPENSSL_CONF=/dev/null node scripts/validate-fiscal-assets.mjs
```

Para repetir la evidencia focalizada de CFDI-21 sin llamar al PAC:

```bash
OPENSSL_CONF=/dev/null pnpm --dir backend exec jest src/config/env.validation.spec.ts src/modules/cfdi/rep-issuance.controller.spec.ts src/modules/cfdi/credit-adjustment.controller.spec.ts src/modules/cfdi/adapters/facturama/facturama.adapter.spec.ts src/modules/cfdi/fiscal-artifact.service.spec.ts src/modules/cfdi/stamp-reconciliation.job.spec.ts src/modules/billing/cancellation-status.job.spec.ts --runInBand
gitleaks git --redact --no-banner --config .gitleaks.toml
```

La única conexión real al PAC vive en
`.github/workflows/cfdi-sandbox.yml`. Debe lanzarse manualmente sobre el
environment protegido `cfdi-sandbox`, siempre con
`https://apisandbox.facturama.mx`. `contract=read` ejecuta el contrato
read-only sobre un CFDI existente; `contract=stamp` ejecuta el contrato
separado de escritura y requiere que la prueba confirme
`RUN_FACTURAMA_SANDBOX_STAMP="true"` antes de inicializar NestJS o abrir red.
El contrato de escritura no es seleccionado por defecto, no pertenece a
`npm test` ni al `test:e2e` normal y no acepta `https://api.facturama.mx`.

### Secrets y fixtures del contrato de escritura Facturama

Configurar en el environment protegido `cfdi-sandbox`, sin versionar valores:

- `FACTURAMA_SANDBOX_USERNAME`
- `FACTURAMA_SANDBOX_PASSWORD`
- `FACTURAMA_SANDBOX_ISSUER_RFC`
- `FACTURAMA_SANDBOX_ISSUER_NAME`
- `FACTURAMA_SANDBOX_ISSUER_FISCAL_REGIME`
- `FACTURAMA_SANDBOX_ISSUER_POSTAL_CODE`

El RFC emisor, nombre, régimen y código postal deben corresponder al emisor
cuyo CSD ya está cargado en Facturama Sandbox. La prueba no lee ni guarda CSD,
claves privadas, contraseñas de CSD o tokens. El resolver recibe la referencia
opaca `github-actions://facturama-sandbox` y entrega las credenciales en
memoria al `FacturamaAdapter` real.

Opcionalmente se pueden configurar
`FACTURAMA_SANDBOX_RECEIVER_RFC`, `FACTURAMA_SANDBOX_RECEIVER_NAME`,
`FACTURAMA_SANDBOX_RECEIVER_FISCAL_REGIME`,
`FACTURAMA_SANDBOX_RECEIVER_POSTAL_CODE` y
`FACTURAMA_SANDBOX_RECEIVER_CFDI_USE`. Si no se configuran, la prueba usa el
fixture público de receptor de la guía CFDI 4.0 Multiemisor de Facturama.
El único concepto usa también un fixture no sensible de esa guía
(`ProductCode=25173108`, `UnitCode=E48`, importe `1.00` más IVA del 16%);
no representa una venta del ERP ni un producto real.
La prueba crea un solo folio único por ejecución, deja el CFDI Sandbox como
evidencia y solo reporta IDs opacos, un UUID parcialmente redactado y estados;
no imprime credenciales, payload, XML, PDF ni headers de autorización.

La protección de rama se configura en GitHub, no dentro del YAML:

1. Abrir `Settings > Branches` o `Settings > Rules > Rulesets`.
2. Proteger `main` y requerir pull request.
3. Activar `Require status checks to pass before merging`.
4. Seleccionar exclusivamente el check agregador `CI Gate`.
5. Impedir bypass y exigir que la rama esté actualizada antes del merge.

Las excepciones temporales de `audit-ci.jsonc` cubren React Router RSC, que esta
SPA no utiliza, y la cadena de compresión de ExcelJS, que no recibe patrones
glob del usuario. Ambas expiran el 31 de agosto de 2026; cualquier advisory
nuevo de severidad alta bloquea CI.

El backend conserva deuda ESLint histórica como warnings. `lint:check` fija un
techo de 1062 warnings: una nueva infracción bloquea CI y cualquier corrección
reduce permanentemente el presupuesto. Los errores de parsing y reglas no
incluidas en esa línea base siempre fallan.

---

## Backend

Usar:

```bash
OPENSSL_CONF=/dev/null npm --prefix backend test -- --runInBand
OPENSSL_CONF=/dev/null npm --prefix backend run build
OPENSSL_CONF=/dev/null npm --prefix backend run typecheck
npm --prefix backend run lint:check
npm --prefix backend run test:cov
```

---

## Frontend

Usar cuando la TASK toque frontend:

```bash
npm --prefix frontend run build
npm --prefix frontend run typecheck
npm --prefix frontend run test
npm --prefix frontend run test:cov
```

Si existe lint configurado y la TASK lo requiere:

```bash
npm --prefix frontend run lint
```

## Validación local equivalente a CI

```bash
npm ci --ignore-scripts
npm run audit:dependencies
npm run test:guard
npm --prefix backend run lint:check
OPENSSL_CONF=/dev/null npm --prefix backend run typecheck
OPENSSL_CONF=/dev/null npm --prefix backend run test:cov
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run test:cov
docker build --file docker/backend/Dockerfile --tag pollos-backend:ci .
docker build --file docker/frontend/Dockerfile --tag pollos-frontend:ci .
```

Las migraciones y pruebas e2e requieren PostgreSQL con PostGIS. CI siempre las
ejecuta sobre una base vacía antes de aprobar `CI Gate`.

---

## Endurecimiento CEDIS

El flujo CEDIS-sucursal conserva la trazabilidad de inventario, protege costos y
utilidad por permiso, y coordina el cierre diario con el ciclo sin crear un
segundo agregado de stock o conciliacion.

Las invariantes principales son:

- Suministros y devoluciones crean transferencias `REQUESTED`; no modifican
  balances ni generan movimientos.
- Solo `CONFIRMED` genera `TRANSFER_OUT` y `TRANSFER_IN` atomicos mediante
  `InventoryTransfersService`.
- Un vendedor consulta su sucursal hija directa y no recibe costos o utilidad
  sin `cedis.view_costs`.
- `InventoryBalance.quantityKg` y `quantityPieces` no pueden quedar negativos.
- Eventos y snapshots de ciclo/producto son append-only.
- `READY_FOR_REVIEW` mas cierre diario `REVIEWED` pasa ambos agregados a
  `CLOSED` dentro de una transaccion `Serializable`; la reapertura pasa el
  cierre a `DRAFT` y el ciclo a `OPEN` sin revertir operaciones.

La migracion `20260805110000_harden_inventory_balance_integrity` ejecuta un
preflight y falla antes de crear constraints si encuentra saldos negativos. Las
diferencias deben corregirse con un ajuste auditable; no se permite ocultarlas
mediante backfill automatico.

`backend/test/cedis-branch-supply-cycle.e2e-spec.ts` ejecuta login, apertura,
suministro, confirmacion, devolucion, confirmacion y refresh contra PostgreSQL
real. Requiere `DATABASE_URL` explicita para evitar escribir por accidente en
otra base. Comprueba cuatro movimientos, saldos finales 3/7 y venta esperada
neta de 7 kg para 10 kg entregados y 3 kg devueltos. Usa producto, fecha e
idempotency keys unicos. Los snapshots de prueba no se borran porque la base
los protege con triggers append-only; ejecutar E2E sobre una base desechable o
de CI.

El backfill historico sucursal -> CEDIS requiere un mapa aprobado y reporte de
ambiguedades. La conversion automatica kilo-pieza permanece bloqueada mientras
la politica de redondeo no este aprobada.

---

## Despliegue de automatización de crédito

Aplicar en este orden para evitar incompatibilidad entre columnas y Prisma Client:

```bash
OPENSSL_CONF=/dev/null npm --prefix backend --script-shell=/bin/sh exec prisma -- migrate deploy --schema backend/prisma/schema.prisma
OPENSSL_CONF=/dev/null npm --prefix backend --script-shell=/bin/sh exec prisma -- generate --schema backend/prisma/schema.prisma
OPENSSL_CONF=/dev/null npm --prefix backend run build
```

Después de migrar, desplegar o recrear el backend. `APP_TIMEZONE` acepta una zona IANA y usa `America/Mexico_City` por defecto.

---

## Comandos que no deben usarse como validación SDD principal

No usar `npm test` raíz si es placeholder.

No ejecutar binarios directamente desde `node_modules`.

No usar:

```bash
./node_modules/.bin/jest
./node_modules/.bin/tsc
backend/node_modules/.bin/jest
backend/node_modules/.bin/tsc
frontend/node_modules/.bin/vite
```

---

## Política de node_modules

Está permitido que `npm` use `node_modules` internamente.

Está prohibido leer, abrir, listar, buscar o resumir archivos dentro de:

```text
node_modules/
backend/node_modules/
frontend/node_modules/
**/node_modules/
```

---

## Búsquedas recomendadas

Cuando se usen búsquedas de archivos, excluir:

```text
node_modules
dist
.git
coverage
build
.next
```
