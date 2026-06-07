---
name: decompose
description: Break project into bounded modules with interfaces and dependency graph
type: sequential
agent: architect
---

# Decompose

Break the project into bounded modules that can be planned and implemented independently.

## Process

### Step 1: Architecture Overview (project-level decisions)

<HARD-GATE>
Before defining any modules, establish the system-level architecture.
These decisions affect ALL modules and must be resolved first.
</HARD-GATE>

1. Read `artifacts/02-discovery/context-brief.md`
2. Read `manifest.yaml` for repo mapping
3. Present the following cross-cutting decisions to the user (one at a time, with 2-3 options each):
   - **Deployment model** — monolith, microservices, modular monolith, serverless?
   - **Communication patterns** — REST, gRPC, event bus, message queue, in-process?
   - **Shared infrastructure** — shared DB or DB-per-module? Shared auth/identity?
   - **Repo structure** — monorepo or multi-repo? (may already be in manifest)
   - **Deployment topology** — containers, serverless, PaaS? Cloud provider?
   - Any other project-specific cross-cutting concerns
4. Write `artifacts/03-modules/architecture.md` (use create-artifact skill)

### Step 2: Module Decomposition

5. With the architecture established, identify natural module boundaries:
   - Group related requirements together
   - Look for data ownership boundaries
   - Identify independent deployment units
   - Consider team/repo boundaries
6. For each module, define:
   - Name and one-line description
   - Responsibilities (what it owns)
   - Interfaces (what it exposes — APIs, events, shared types)
   - Dependencies (what it needs from other modules)
   - Target repo(s) from manifest
7. Build dependency graph — must be a DAG (no cycles)
8. Write outputs:
   - `artifacts/03-modules/module-map.md` (use create-artifact skill)
   - `artifacts/03-modules/{module}/module.md` for each module (use create-artifact skill) — each module gets its own folder so that `spec.md` (BA-owned) can sit alongside it later
9. Validate with validate-artifact skill (checks for cycles, missing interfaces)
10. Update progress.json — each module gets "decomposed" status

## Module Map Format

The module-map.md should contain:
- Overview of all modules
- Dependency graph (mermaid diagram)
- Suggested implementation order (topological sort of dependencies)
- Cross-module interface contracts summary

## Module Definition Format

Each module .md file should follow `templates/module.md`:
- Frontmatter: name, repos, dependencies
- Description and responsibilities
- Interfaces (exposed)
- Dependencies (consumed)
- Estimated complexity (small/medium/large)

## Rules

- Prefer more, smaller modules over fewer, larger ones
- Every module must have at least one interface (even if it's "none — leaf module")
- Cyclic dependencies are forbidden — if A needs B and B needs A, extract the shared concern into C
- A module can span multiple repos, but document which parts go where
