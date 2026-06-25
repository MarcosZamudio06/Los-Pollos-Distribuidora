# Proposal: Initial Monorepo Structure

## Intent

Establish the documented monorepo scaffold so future modules can be implemented without starter-template drift. This first slice must preserve the current Vite/Nest workspaces, follow `specs/.specs/01-architecture/ai-rules.md`, and avoid adding business logic, endpoints, entities, or folders outside the approved structure.

## Scope

### In Scope
- Add root monorepo orchestration and document current workspace commands alongside new root scripts.
- Reshape `frontend/` and `backend/` toward the documented TypeScript layout with only minimal bootstrap files allowed by spec (`main.ts[x]`, `app.module.ts`, `index.ts`, config entrypoints).
- Prepare `shared/` and architecture-owned frontend/backend locations only when real files are required; no empty placeholder folders or `.gitkeep`.

### Out of Scope
- Feature module implementation, DTOs, controllers, services, Prisma schema, routes, guards, or UI workflows.
- Any requirement changes to auth, users, inventory, sales, or other business modules.

## Capabilities

### New Capabilities
- `monorepo-foundation`: Defines root workspace orchestration, approved scaffold paths, minimal bootstrap files, and coexistence rules for existing frontend/backend starters.

### Modified Capabilities
- None

## Approach

Use a structure-only scaffold. Keep current starters coexisting until their entrypoints are relocated into the approved layout. Use canonical specs from `specs/.specs/` and `specs/modules/`; do not follow older root `.specs/` examples. Create only files with a defined purpose and stop before module behavior.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `package.json` | Modified | Add monorepo-level scripts and workspace orchestration. |
| `frontend/src/` | Modified | Move from Vite starter toward `app/`, `lib/`, and typed entrypoints. |
| `backend/src/` | Modified | Reduce Nest starter to architecture bootstrap only. |
| `shared/` | New | Add shared typed foundations only when backed by real files. |
| `README.md` | Modified | Document root and existing workspace commands. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Over-scaffolding invents undefined module behavior | Med | Limit files to bootstrap/structure items named in specs. |
| Spec path ambiguity causes wrong references | Low | Treat `specs/.specs/` and `specs/modules/` as canonical per user confirmation. |

## Rollback Plan

Revert root scripts, moved entrypoints, and newly added scaffold files; restore original Vite/Nest starter entry files if bootstrap relocation blocks builds.

## Dependencies

- `specs/.specs/00-business/*`
- `specs/.specs/01-architecture/*` with `ai-rules.md` as priority
- `specs/modules/{auth,usuarios,inventory,sales}/spec.md`

## Success Criteria

- [ ] Root scripts orchestrate the repo while existing workspace commands remain documented.
- [ ] Only TypeScript scaffold/entry files inside the approved structure are introduced.
- [ ] No module business logic, endpoints, Prisma models, or placeholder-only folders are added.
