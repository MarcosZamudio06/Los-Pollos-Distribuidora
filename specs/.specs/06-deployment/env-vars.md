# Variables de Entorno

## Backend

```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pollo_distribucion
JWT_ACCESS_SECRET=change_me
JWT_REFRESH_SECRET=change_me
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
AUTH_SESSION_ABSOLUTE_TTL_SECONDS=604800
AUTH_SESSION_IDLE_TTL_SECONDS=86400
AUTH_SESSION_LAST_USED_AT_UPDATE_THRESHOLD_SECONDS=300
BCRYPT_SALT_ROUNDS=10
CORS_ORIGIN=http://localhost:3000
HTTP_BODY_LIMIT=1mb
SWAGGER_ENABLED=true
TRUST_PROXY_HOPS=0
RATE_LIMIT_GLOBAL_MAX=600
RATE_LIMIT_LOGIN_ACCOUNT_MAX=5
RATE_LIMIT_LOGIN_IP_MAX=30
RATE_LIMIT_REFRESH_MAX=120
```

## Frontend

```env
VITE_API_URL=http://localhost:4000/api
```

## PostgreSQL

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=pollo_distribucion
```

Estas variables son exclusivas de la instancia local de desarrollo. Producción
usa las mismas credenciales en `docker-compose.production.yml` y construye
`DATABASE_URL` con el DNS interno `postgres:5432`. No se debe proporcionar una
URL administrada externa ni publicar el puerto de PostgreSQL al host.

## Proveedores geoespaciales

El Compose productivo fija los endpoints privados dentro de `app_network`:

```env
PHOTON_URL=http://photon:2322
OSRM_URL=http://osrm:5000
VROOM_URL=http://vroom:3000
MAP_TILES_URL=http://tileserver:8080
```

Estas URLs no se copian a variables `VITE_*` ni se reemplazan por `localhost` o
proveedores públicos.

Los restore drills deben proporcionar temporalmente:

```env
RESTORE_DATABASE_URL=postgresql://user:password@postgres:5432/pollo_distribucion_restore_drill
```

## Reglas

- `.env` no debe subirse a Git.
- `.env.example` sí debe mantenerse actualizado.
- Los secretos productivos deben ser diferentes a los de desarrollo.
- La vigencia criptográfica del refresh token no debe superar la expiración absoluta de la sesión.
- `AUTH_SESSION_LAST_USED_AT_UPDATE_THRESHOLD_SECONDS` controla cada cuánto se
  actualiza `lastUsedAt` de una sesión activa para reducir escrituras; su valor
  predeterminado es `300` y debe cumplir `0 < threshold < AUTH_SESSION_IDLE_TTL_SECONDS`.
- `CORS_ORIGIN` acepta una allowlist separada por comas. No acepta `*` cuando
  las credenciales están habilitadas.
- `SWAGGER_ENABLED` solo puede habilitar Swagger fuera de producción.
- `TRUST_PROXY_HOPS` debe coincidir con la cantidad real de proxies controlados.
  El backend no debe exponerse directamente cuando el valor sea mayor a cero.
- Los límites HTTP deben ser enteros positivos y probarse con la carga real de
  terminales POS antes de liberar producción.

## CFDI 4.0 nativo — configuración segura

```env
CFDI_ENABLED=false
FISCAL_PROVIDER=FACTURAMA
FISCAL_PROVIDER_ENVIRONMENT=SANDBOX
CFDI_REQUEST_TIMEOUT_MS=30000
CFDI_MAX_RETRIES=3
FACTURAMA_API_BASE_URL=https://apisandbox.facturama.mx
FACTURAMA_API_MODE=MULTI_ISSUER
FACTURAMA_CREDENTIAL_REF=
```

- `CFDI_ENABLED` permanece `false` hasta completar migración y evidencia de
  PostgreSQL, HTTP autenticado, ObjectStorage y sandbox PAC.
- `FISCAL_PROVIDER` solo acepta `NONE` o `FACTURAMA` en esta fase. Un proveedor
  desconocido no puede habilitar CFDI; `FINKOK` queda reservado hasta contar
  con su adapter.
- `FISCAL_PROVIDER_ENVIRONMENT` solo acepta `SANDBOX` o `PRODUCTION` y debe
  declararse explícitamente cuando `CFDI_ENABLED=true`.
- `CFDI_REQUEST_TIMEOUT_MS` está limitado a 100–120000 ms y
  `CFDI_MAX_RETRIES` a 0–10 para evitar esperas o reintentos sin control.
- `FACTURAMA_API_BASE_URL` debe coincidir exactamente con la allowlist del
  ambiente: `https://apisandbox.facturama.mx` en `SANDBOX` o
  `https://api.facturama.mx` en `PRODUCTION`. Se rechazan credenciales en URL,
  puertos, paths, query y fragments antes de resolver credenciales o abrir red.
  Al habilitar CFDI, el endpoint, el modo `MULTI_ISSUER` y
  `FACTURAMA_CREDENTIAL_REF` son obligatorios.
- `FACTURAMA_CREDENTIAL_REF` es una referencia opaca a Docker Secrets o a un
  secret manager. Usuario, contraseña, CSD, claves y tokens no se guardan en
  PostgreSQL, no usan variables `VITE_*`, no se versionan y no aparecen en
  logs/respuestas.
  El resolver concreto incluido usa `docker-secret://<nombre>` y lee
  `/run/secrets/<nombre>` como un JSON acotado con `environment`, `username` y
  `password`; `environment` debe coincidir con `FISCAL_PROVIDER_ENVIRONMENT`.
  Referencias a un secret manager externo requieren registrar otro
  `FiscalCredentialResolver`; una referencia sin resolver falla cerrado antes
  de abrir red.
- No se aceptan variables `FACTURAMA_PASSWORD`, `FACTURAMA_API_KEY`, tokens ni
  `CFDI_CSD_*`; el validador las rechaza para evitar credenciales en claro.
- `docker-compose.production.yml` solo propaga referencias y valores no
  secretos. `FacturamaAdapter` recibe la referencia mediante
  `FiscalCredentialResolver`; esta configuración todavía no habilita el
  workflow de `BillingRequest` ni timbrado productivo.
- `FiscalIssuerBinding` resuelve emisor/proveedor/ambiente sin contener secretos.
- Un futuro Finkok añade su adapter/configuración sin cambiar el contrato
  público ni los snapshots.
