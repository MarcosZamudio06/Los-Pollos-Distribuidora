# Tasks: Initial Monorepo Structure

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 220-320 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR: structure-only scaffold plus tests/docs |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Root orchestration, starter cleanup, bootstrap tests, docs | PR 1 | Single slice; stop on spec conflict |

## Phase 1: Spec Gate and Command Inventory

- [x] 1.1 Read `specs/.specs/07-workflows/task.md`, `specs/.specs/01-architecture/ai-rules.md`, `folder-structure.md`, `architecture.md`, and `coding-standards.md`; stop before code if conflicts appear.
- [x] 1.2 Inspect `package.json`, `frontend/package.json`, and `backend/package.json`; identify existing commands to preserve in root scripts and `README.md`.

## Phase 2: Test-First Contract and Root Foundation

- [x] 2.1 TDD contract: update `backend/test/app.e2e-spec.ts` first to initialize and close `AppModule`; remove any `GET /` starter assertion.
- [x] 2.2 Modify `package.json` as a private monorepo root; remove JavaScript `main` and add `npm --prefix` scripts for frontend/backend commands.
- [x] 2.3 Create `README.md` documenting specs-first workflow, canonical spec paths, root scripts, and direct workspace commands.

## Phase 3: Frontend Bootstrap Structure

- [x] 3.1 Modify `frontend/src/main.tsx` to import `src/app/` bootstrap and `src/styles/index.css` only.
- [x] 3.2 Create `frontend/src/app/App.tsx` as a minimal typed shell with no routes, data fetching, workflows, or module behavior.
- [x] 3.3 Create `frontend/src/app/providers.tsx` as a typed children wrapper; add no external providers yet.
- [x] 3.4 Move and trim `frontend/src/index.css` to `frontend/src/styles/index.css`; delete `frontend/src/App.tsx`, `frontend/src/App.css`, and unused starter assets.

## Phase 4: Backend Bootstrap Structure

- [x] 4.1 Modify `backend/src/app.module.ts` to remove starter controller/provider imports and expose only the root Nest module.
- [x] 4.2 Modify `backend/src/main.ts` as bootstrap-only; set `/api` prefix only if no endpoint behavior is introduced.
- [x] 4.3 Delete `backend/src/app.controller.ts`, `backend/src/app.service.ts`, and `backend/src/app.controller.spec.ts`.

## Phase 5: Verification and Task Report

- [x] 5.1 Run `npm --prefix backend test` and `npm --prefix backend run test:e2e`; fix only scaffold regressions.
- [x] 5.2 Run `npm --prefix frontend run lint && npm --prefix frontend run build && npm --prefix backend run lint && npm --prefix backend run build`.
- [x] 5.3 Report using TASK-001 format: specs read, files changed, validations, commands, risks, and confirmation that no empty folders, `.gitkeep`, `shared/`, or modules were added.
