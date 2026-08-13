# Pollos Distribuidor

TypeScript monorepo foundation for the chicken distributor system.

## Specs-first workflow

The project follows Spec Driven Development. Before coding, read the canonical specs and stop if a requested change contradicts them.

Canonical paths:

- `specs/.specs/`
- `specs/modules/`

Priority architecture rule file:

- `specs/.specs/01-architecture/ai-rules.md`

The repository contains a Vite frontend, a NestJS backend, Prisma schema and
migrations, business modules, API contracts, and UI workflows. Follow the
canonical specs before changing those areas.

## Root commands

Run workspace commands from the repository root:

```bash
pnpm run frontend:dev
pnpm run frontend:build
pnpm run frontend:lint
pnpm run frontend:preview

pnpm run backend:start
pnpm run backend:start:dev
pnpm run backend:build
pnpm run backend:lint
pnpm run backend:test
pnpm run backend:test:e2e
pnpm run backend:format

pnpm test
```

`pnpm test` delegates to the backend unit test runner. Run `pnpm --dir frontend test`
separately for the frontend suite.

## Direct workspace commands

Existing workspace commands remain available.

Frontend:

```bash
pnpm --dir frontend run dev
pnpm --dir frontend run build
pnpm --dir frontend run lint
pnpm --dir frontend run preview
```

Backend:

```bash
pnpm --dir backend run start
pnpm --dir backend run start:dev
pnpm --dir backend run build
pnpm --dir backend run lint
pnpm --dir backend test
pnpm --dir backend run test:e2e
pnpm --dir backend run format
```
