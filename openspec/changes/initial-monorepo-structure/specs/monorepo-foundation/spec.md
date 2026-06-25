# Monorepo Foundation Specification

## Purpose

Define the initial repository foundation for a TypeScript-only monorepo that coexists with the current Vite and Nest starters, follows the canonical `specs/.specs/` and `specs/modules/` sources, and introduces no business module behavior.

## Requirements

### Requirement: Canonical Specification Compliance

The system MUST treat `specs/.specs/` and `specs/modules/` as the canonical project specifications. Before implementation, contributors MUST read relevant specs, identify applicable contracts, entities, permissions, and rules, and stop if the requested structure conflicts with those specs.

#### Scenario: Implementation starts from specs

- GIVEN a contributor prepares monorepo scaffold changes
- WHEN they plan files or scripts
- THEN they MUST use `specs/.specs/01-architecture/ai-rules.md` and related specs as source of truth
- AND they MUST NOT invent routes, entities, permissions, or folders outside the documented structure

#### Scenario: Spec conflict is detected

- GIVEN a requested scaffold item conflicts with canonical specs
- WHEN the conflict is identified
- THEN implementation MUST stop
- AND the conflict MUST be reported before files are changed

### Requirement: TypeScript-Only Foundation

The foundation MUST use TypeScript for application scaffold and entry/config files. JavaScript application files MUST NOT be introduced.

#### Scenario: Valid foundation file is added

- GIVEN a minimal entrypoint or config file is required
- WHEN the file is created
- THEN it MUST use a TypeScript extension appropriate to its workspace
- AND it MUST contain no business logic

#### Scenario: JavaScript application file is proposed

- GIVEN a scaffold change proposes a JavaScript application file
- WHEN the change is reviewed
- THEN the file MUST be rejected

### Requirement: Approved Structure Without Placeholder Noise

The foundation MUST create files only inside the approved root, frontend, backend, shared, docker, docs, or scripts structure. It MUST NOT create empty placeholder folders or `.gitkeep` files solely to preserve a tree.

#### Scenario: Real scaffold content is needed

- GIVEN a root, frontend, backend, or shared path has an immediate documented purpose
- WHEN the foundation adds content there
- THEN the content MUST be limited to orchestration, bootstrap, configuration, documentation, or shared type/constants foundations allowed by specs

#### Scenario: Folder has no real content yet

- GIVEN a future module folder has no implementation content for this change
- WHEN the scaffold is prepared
- THEN the folder MUST NOT be created only as an empty placeholder

### Requirement: Starter Coexistence and No Module Implementation

The foundation MUST preserve the existing frontend and backend starter workspaces while reshaping only minimal bootstrap locations permitted by the documented structure. It MUST NOT implement feature modules, endpoints, DTOs, services, Prisma models, guards, UI workflows, or business rules.

#### Scenario: Starter workspaces remain usable

- GIVEN the repository currently contains Vite and Nest starter workspaces
- WHEN monorepo foundation changes are applied
- THEN the workspaces MUST continue to have minimal runnable/buildable entrypoints
- AND any relocation MUST remain structure-only

#### Scenario: Business module code is attempted

- GIVEN the change includes auth, users, inventory, sales, or other module behavior
- WHEN the foundation scope is reviewed
- THEN that code MUST be excluded from this change

### Requirement: Root Orchestration and Command Documentation

The foundation MUST provide root-level monorepo orchestration scripts and documentation that preserves existing frontend and backend workspace commands alongside new root commands.

#### Scenario: Root commands are documented

- GIVEN root orchestration scripts are added
- WHEN a contributor reads project documentation
- THEN they MUST find the root commands and the existing workspace commands

#### Scenario: Existing commands are still discoverable

- GIVEN a contributor needs to run a frontend or backend workspace command directly
- WHEN they consult the repository documentation
- THEN the command MUST remain documented without requiring knowledge of prior starter defaults
