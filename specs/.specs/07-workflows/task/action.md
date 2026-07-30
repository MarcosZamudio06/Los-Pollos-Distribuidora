TASK-ID: TASK-102-H1
Parent: TASK-102
Title: HTTP bootstrap hardening
Status: COMPLETED

Objective:
- Harden the NestJS HTTP bootstrap without changing ERP/POS business behavior.

Required specs:
- specs/.specs/01-architecture/architecture.md
- specs/.specs/03-api/api-conventions.md
- specs/.specs/03-api/auth-api.md
- specs/.specs/06-deployment/deployment.md
- specs/.specs/06-deployment/env-vars.md
- specs/modules/auth/spec.md

Scope:
- Security headers, CORS allowlist, payload limits and compression.
- Request IDs and sanitized global HTTP errors.
- Global and authentication-specific rate limiting.
- Explicit reverse proxy trust and production Swagger shutdown.
- Automated tests and deployment configuration.

Out of scope:
- Changing the documented 401/403 authentication semantics.
- Shared throttling storage for multiple backend replicas.
- New infrastructure services.

Validation:
- OPENSSL_CONF=/dev/null npm --prefix backend test -- --runInBand
- OPENSSL_CONF=/dev/null npm --prefix backend run test:e2e -- --runInBand
- OPENSSL_CONF=/dev/null npm --prefix backend exec tsc -- --noEmit
- OPENSSL_CONF=/dev/null npm --prefix backend run build
