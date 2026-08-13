# Pollos Distribuidor

TypeScript monorepo foundation for the chicken distributor system.

## Specs-first workflow

The project follows Spec Driven Development. Before coding, read the canonical specs and stop if a requested change contradicts them.

Canonical paths:

- `specs/.specs/`
- `specs/modules/`

Priority architecture rule file:

- `specs/.specs/01-architecture/ai-rules.md`

Current foundation scope only preserves the Vite frontend and NestJS backend bootstrap. It does not add business modules, endpoints, DTOs, guards, repositories, Prisma models, or UI workflows.

## Root commands

Run workspace commands from the repository root:

```bash
npm run frontend:dev
npm run frontend:build
npm run frontend:lint
npm run frontend:preview

npm run backend:start
npm run backend:start:dev
npm run backend:build
npm run backend:lint
npm run backend:test
npm run backend:test:e2e
npm run backend:format

npm test
```

`npm test` delegates to the backend unit test runner because the frontend starter does not yet define a test command.

## Direct workspace commands

Existing workspace commands remain available.

Frontend:

```bash
npm --prefix frontend run dev
npm --prefix frontend run build
npm --prefix frontend run lint
npm --prefix frontend run preview
```

Backend:

```bash
npm --prefix backend run start
npm --prefix backend run start:dev
npm --prefix backend run build
npm --prefix backend run lint
npm --prefix backend test
npm --prefix backend run test:e2e
npm --prefix backend run format
```
