## Comandos de validación conocidos

Este documento es auxiliar.

Consultar solo cuando una TASK requiera ejecutar pruebas, build o TypeScript.

---

## Backend

Usar:

```bash
OPENSSL_CONF=/dev/null npm --prefix backend test -- --runInBand
OPENSSL_CONF=/dev/null npm --prefix backend run build
OPENSSL_CONF=/dev/null npm --prefix backend exec tsc -- --noEmit
```

---

## Frontend

Usar cuando la TASK toque frontend:

```bash
npm --prefix frontend run build
```

Si existe lint configurado y la TASK lo requiere:

```bash
npm --prefix frontend run lint
```

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
