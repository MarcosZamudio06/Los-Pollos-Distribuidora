# Design: Initial Monorepo Structure

## Technical Approach

Implement a structure-only TypeScript monorepo foundation that keeps the current Vite and Nest workspaces runnable while removing starter drift that creates undocumented routes or root-level app files. The design follows `specs/.specs/01-architecture/ai-rules.md` first: read specs before coding, use TypeScript, create no folders outside `folder-structure.md`, avoid placeholders, and stop if a requested file contradicts canonical specs. No business modules, DTOs, guards, repositories, Prisma models, or workflows are introduced.

Current gaps before apply: root `package.json` is a placeholder named `backend` with a JavaScript `main`; root `README.md` is missing; frontend app code is at `frontend/src/App.tsx`; backend exposes an undocumented `GET /` starter endpoint and tests assert it.

## Architecture Decisions

| Option | Tradeoff | Decision |
|---|---|---|
| Root orchestration via `npm --prefix` scripts | No new dependency and works with existing package-lock files; less “workspace-native” than npm workspaces | Use root scripts that delegate to `frontend/` and `backend/`, and mark root private. |
| Create the full documented folder tree | Looks complete but violates the no-placeholder rule because Git would require `.gitkeep` or empty folders | Create only directories needed by real files in this change. |
| Keep starter endpoints/demo UI | Preserves generated defaults but contradicts specs by keeping undocumented API/UI behavior | Replace with neutral bootstrap-only files and update tests accordingly. |
| Add shared package now | Gives a future import target but would invent contracts/constants before module specs are implemented | Defer `shared/` until real shared types/constants are explicitly needed. |

## Data Flow

```text
Root npm script ──→ npm --prefix frontend/backend ──→ existing workspace command

frontend/src/main.tsx ──→ frontend/src/app/providers.tsx ──→ frontend/src/app/App.tsx

backend/src/main.ts ──→ AppModule ──→ no feature modules yet
```

## File Changes

| File | Action | Description |
|---|---|---|
| `package.json` | Modify | Rename root package, remove JavaScript `main`, add private monorepo orchestration scripts delegating to existing frontend/backend commands. |
| `README.md` | Create | Document specs-first workflow, root commands, and direct workspace commands. |
| `frontend/src/main.tsx` | Modify | Import app bootstrap from `src/app/` and global styles from `src/styles/`. |
| `frontend/src/app/App.tsx` | Create | Minimal React shell with no workflows, routing, data fetching, or module behavior. |
| `frontend/src/app/providers.tsx` | Create | Minimal typed provider composition wrapper; no external providers until dependencies exist. |
| `frontend/src/index.css` | Move/Modify | Move to `frontend/src/styles/index.css` and reduce to global bootstrap styles only. |
| `frontend/src/App.tsx` | Delete | Remove root starter component that conflicts with documented `src/app/`. |
| `frontend/src/App.css` | Delete | Remove starter-only styles. |
| `frontend/src/assets/react.svg`, `frontend/src/assets/vite.svg`, `frontend/src/assets/hero.png` | Delete | Remove unused starter assets; do not keep placeholder-only assets. |
| `backend/src/app.module.ts` | Modify | Keep only the root Nest module with no controllers/providers/imported feature modules. |
| `backend/src/main.ts` | Modify | Keep bootstrap-only Nest entrypoint; may set `/api` global prefix without defining endpoints. |
| `backend/src/app.controller.ts` | Delete | Remove undocumented starter route. |
| `backend/src/app.service.ts` | Delete | Remove starter service used only by undocumented route. |
| `backend/src/app.controller.spec.ts` | Delete | Remove unit test for deleted starter behavior. |
| `backend/test/app.e2e-spec.ts` | Modify | Assert application bootstrap only, not `GET /` behavior. |

Counts: 3 created, 6 modified/moved, 6 deleted.

## Interfaces / Contracts

No business interfaces, DTOs, API contracts, Prisma schema, permissions, or shared constants are added. The only contract introduced is operational: root scripts delegate to existing workspace scripts and README documents both root and direct commands.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Backend no longer exposes starter controller behavior | Remove obsolete controller unit test; keep `npm --prefix backend test` passing with no false business assertions. |
| Integration | Nest app bootstraps with an empty root module | Update e2e test to initialize/close `AppModule`; no endpoint assertions. |
| E2E | Full workflow behavior | Not applicable; no UI/API workflows are implemented. |
| Quality | TypeScript, lint, build | Run `npm --prefix frontend run lint && npm --prefix frontend run build && npm --prefix backend run lint && npm --prefix backend run build`. |

## Migration / Rollout

No data migration required. Roll out as one scaffold slice; rollback by restoring starter files and root package metadata/scripts.

## Open Questions

- [ ] None.
