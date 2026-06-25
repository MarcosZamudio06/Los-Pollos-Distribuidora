### TASK-022 — Implementar Users backend

Estado inicial: `PENDING`

Depende de:

- TASK-021

Specs requeridos:

```text
specs/modules/usuarios/spec.md
```

Endpoints:

- GET /api/users
- GET /api/users/:id
- POST /api/users
- PATCH /api/users/:id
- PATCH /api/users/:id/password
- DELETE /api/users/:id

Reglas:

- Solo ADMIN.
- Email único.
- No devolver passwordHash.
- No eliminar físicamente.

---