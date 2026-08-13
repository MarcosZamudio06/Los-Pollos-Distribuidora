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
