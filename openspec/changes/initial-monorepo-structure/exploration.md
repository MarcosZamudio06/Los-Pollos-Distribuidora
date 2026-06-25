## Exploration: Create the initial monorepo structure without implementing complete business logic

### Current State
The repository is already split into `frontend/` and `backend/`, but both workspaces still use starter scaffolds (`frontend/src/App.tsx`, `backend/src/app.controller.ts`, `backend/src/app.service.ts`). The source-of-truth specs require a stricter monorepo layout with `shared/`, feature-based frontend folders, Nest feature modules, Prisma/database infrastructure, and no business modules implemented outside the documented structure. There is also a documentation conflict: architecture docs describe root `.specs/` and `modules/`, while the real repository and `openspec/config.yaml` use `specs/.specs/` and `specs/modules/`.

### Affected Areas
- `specs/.specs/01-architecture/ai-rules.md` — highest-priority constraint: no invented modules, no folders outside the documented structure, TypeScript only.
- `specs/.specs/01-architecture/folder-structure.md` — defines the allowed target folder/file shape for root, frontend, backend, and shared.
- `specs/.specs/01-architecture/architecture.md` — defines monorepo separation, feature-based frontend, and modular Nest backend.
- `specs/.specs/01-architecture/coding-standards.md` — requires TypeScript-only application code and separation of responsibilities.
- `specs/.specs/00-business/PRD.md` — defines MVP scope and the module families the structure must support.
- `specs/.specs/00-business/business-rules.md` — defines cross-cutting permissions and business rules that the future structure must accommodate.
- `specs/.specs/02-database/database.md` — defines the main entities the backend/shared structure must be ready to host.
- `specs/modules/auth/spec.md` — defines auth contracts and permissions the structure must reserve space for.
- `specs/modules/usuarios/spec.md` — defines user/role management scope.
- `specs/modules/inventory/spec.md` — defines product/category/inventory movement scope.
- `specs/modules/sales/spec.md` — defines sales/POS scope and critical inventory transaction rules.
- `frontend/src/App.tsx` — current Vite starter file that conflicts with the target `src/app/` structure.
- `backend/src/app.module.ts` — current Nest entry point that will need structural reorganization only, not feature logic yet.
- `package.json` — current root package is a placeholder and does not yet reflect monorepo orchestration.

### Approaches
1. **Structure-only scaffold** — Create only the documented directory tree and the minimum cross-cutting entry files needed to relocate the starters into the target layout, leaving feature module folders unimplemented.
   - Pros: Best match for AI rules; avoids inventing endpoints/entities/logic; reduces review size; safe first SDD slice.
   - Cons: Some folders may remain empty until later changes; proposal must define exactly which minimal files are allowed.
   - Effort: Medium

2. **Bootstrap folders plus placeholder feature internals** — Create the target tree and add placeholder controllers/services/DTOs/providers for each future module.
   - Pros: Faster visual progress toward the final architecture.
   - Cons: High risk of inventing contracts, violating module specs, and creating incomplete code the specs do not define yet.
   - Effort: High

### Recommendation
Use **Structure-only scaffold**. It is the only approach clearly aligned with `ai-rules.md`: create the monorepo shape, move/replace starter entrypoints into the documented layout, prepare `shared/`, `frontend/src/app`, `backend/src/common|config|database|modules`, and stop before module behavior, endpoints, DTOs, Prisma models, guards, or business workflows are implemented.

### Risks
- Spec conflict: architecture docs describe root `.specs/` and `modules/`, but the repo and `openspec/config.yaml` use `specs/.specs/` and `specs/modules/`.
- Over-scaffolding risk: adding placeholder module code would invent behavior not yet defined for this change.
- Empty-folder persistence may require a documented strategy during apply because Git does not track empty directories by itself.

### Ready for Proposal
Yes — but the orchestrator should first surface the spec-path conflict and ask whether the canonical documentation layout is root `.specs/` + `modules/` or the current `specs/.specs/` + `specs/modules/`. The proposal should also explicitly limit scope to structure, entrypoints, and shared scaffolding only.
