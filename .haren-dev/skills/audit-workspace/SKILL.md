---
name: audit-workspace
description: Validate entire Haren workspace structure, file naming, frontmatter, and cross-references
type: utility
---

# Audit Workspace

Validate the entire Haren workspace for structural correctness, naming conventions, content format, and cross-reference consistency.

## When to Trigger

- **Phase transitions** — before moving a module to the next phase
- **Session start** — quick mode (structure only, skip content checks)
- **Before demo / iteration end** — full mode
- **On demand** — user says "audit", "validate workspace", "check structure"

## Audit Modes

| Mode | Checks | When |
|------|--------|------|
| **quick** | Directory structure, progress.json validity | Session start |
| **full** | Everything below | Phase transitions, before demo, on demand |

---

## Checks

### 1. Directory Structure

Verify all required directories exist under `artifacts/`:

```
00-baseline/
01-research/
02-discovery/
03-modules/
04-plans/
05-implementation/
06-evaluation/
07-iterations/          ← only if iterations enabled
_registry/
```

**Report:** missing directories as FAIL.

### 2. Core Files

Verify these files exist and are valid:

| File | Validation |
|------|-----------|
| `manifest.yaml` | Valid YAML, has `project`, `mode`, `language` fields |
| `progress.json` | Valid JSON, has `project`, `version`, `phase`, `status`, `modules`, `dependencies` |
| `_registry/artifact-index.md` | Exists, has table header |
| `FEEDBACK.md` | Exists |

**If iterations enabled**, also check:
- `manifest.yaml` has `iterations` block with `duration`, `start_date`, `demo_day`
- `progress.json` has `currentIteration` field
- At least one iteration file exists in `07-iterations/`

### 3. Module Consistency

For each module in `progress.json`:

| Module phase | Required artifacts |
|-------------|-------------------|
| `decomposed` | `03-modules/{module}/module.md` exists |
| `planned` (no iterations) | `03-modules/{module}/spec.md` (BA-owned), `04-plans/{module}/design.md`, `tasks.md` exist |
| `planned` (iterations on) | `03-modules/{module}/spec.md` (BA-owned), `04-plans/{module}/design.md` (master) exist AND at least one `04-plans/{module}/iteration-{N}/` subdir with `design.md`, `tasks.md` |
| `implementing` (no iterations) | `04-plans/{module}/tasks.md` has tasks, features listed in progress.json |
| `implementing` (iterations on) | Active iteration `04-plans/{module}/iteration-{N}/tasks.md` has tasks, features listed in progress.json |
| `evaluating` | At least one `06-evaluation/{module}/task-*-review.md` exists |

**Cross-check:** Every feature key in `progress.json` → `features` should have a matching `task-{N}-{slug}` pattern.

### 4. File Naming Conventions

Scan all files and verify:

| Directory | Naming rule |
|-----------|------------|
| `05-implementation/{module}/` | `task-{N}-{slug}.md` |
| `06-evaluation/{module}/` | `task-{N}-{slug}-review.md`, `task-{N}-{slug}-test-report.md` |
| `07-iterations/` | `iteration-{N}.md` |

**Report:** files that don't match the convention as WARN.

### 5. Frontmatter Validation

#### Session logs (`05-implementation/`)

Required header fields:
- `# Task {N}: {title}`
- `**Module:**`
- `**Assignee:**`
- `**Status:**`
- `**Iteration:**` (only if iterations enabled)

#### Review files (`06-evaluation/`)

Required YAML frontmatter:
- `module`
- `feature`
- `task`
- `verdict` (pass | fail)
- `attempt`
- `date`
- `reviewer`
- `iteration` (only if iterations enabled)

#### Iteration files (`07-iterations/`)

Required YAML frontmatter:
- `iteration` (number)
- `start` (date)
- `end` (date)
- `demo` (date)
- `status` (planned | in-progress | complete)

Required sections:
- `## Goal`
- `## Planned Deliverables` (with module sub-headers `###`)
- `## Demo Script` (with module sub-headers `###`)

### 6. Artifact Registry Consistency

Cross-check `_registry/artifact-index.md` against actual files:

- Every file in `02-discovery/` through `07-iterations/` should have a registry entry
- Every registry entry should point to an existing file
- **Report:** unregistered files as WARN, broken registry entries as FAIL

### 7. Progress.json ↔ Tasks.md Consistency

For each module in `implementing` or later phase:

- Every feature in `progress.json` → `features` should correspond to a task in `tasks.md`
- Feature status in `progress.json` should be consistent with:
  - `passing` → review file exists with `verdict: pass`
  - `evaluating` → no passing review yet
  - `in-progress` → session log file should exist
- **If iterations enabled:** every task in `tasks.md` should have an `Iteration` column value

### 8. Iteration Consistency (only if iterations enabled)

- `currentIteration` in `progress.json` matches the highest non-complete iteration
- Every iteration file's task list is consistent with `tasks.md` Iteration column
- No task is assigned to a non-existent iteration
- Iteration dates don't overlap

---

## Output Format

```
=== Haren Workspace Audit ({mode}) ===
Project: {name}
Date: {date}

✓ Directory structure ............... PASS
✓ Core files ....................... PASS
✗ Module consistency ............... FAIL
  - skill-marketplace: implementing but missing session log for task-2-sync-skills-api
✓ File naming ...................... PASS
⚠ Frontmatter ...................... WARN
  - 05-implementation/skill-marketplace/task-1-scaffold.md: missing Iteration field
✓ Registry consistency ............. PASS
✓ Progress ↔ Tasks ................. PASS
✓ Iteration consistency ............ PASS (or SKIP if not enabled)

Result: FAIL (1 error, 1 warning)
```

## Rules

- FAIL blocks phase transitions — must be fixed first
- WARN is informational — note but don't block
- In quick mode, only run checks 1-2
- In full mode, run all checks
- Always report the full list of findings, don't stop at first error
- If iterations are not enabled (no `iterations` block in manifest.yaml), skip checks 5-8 iteration-related fields and check 8 entirely
