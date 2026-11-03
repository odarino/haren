---
name: validate-artifact
description: Check artifact completeness before phase transitions
type: utility
---

# Validate Artifact

Verify that an artifact has all required fields and content before allowing a phase transition.

## Validation Rules by Type

### Context Brief (01-discovery)
Required sections:
- [ ] Project overview and goals
- [ ] Key requirements (at least 3)
- [ ] Constraints and assumptions
- [ ] Identified risks

### Module Definition (02-modules)
Required fields:
- [ ] Name and description
- [ ] Responsibilities (at least 1)
- [ ] Interfaces section (can be "none" for leaf modules)
- [ ] Dependencies section
- [ ] Target repo(s)

### Module Map (02-modules/module-map.md)
Required:
- [ ] All modules listed
- [ ] Dependency graph (no cycles — validate by attempting topological sort)
- [ ] Implementation order

### Spec (04-plans)
Required sections:
- [ ] Requirements (functional)
- [ ] User stories with acceptance criteria
- [ ] Interface contracts
- [ ] Definition of done checklist

### Design (04-plans)
Required sections:
- [ ] Architecture overview
- [ ] Data model (or "N/A" with justification)
- [ ] Key technical decisions
- [ ] Existing Code section (reuse inventory). For each table that the module writes and each side effect that it triggers, the section lists the existing writers and callers in all target repos with `file:line`, or states "none found" with the search command. A design that says "new" for a behavior must name what it leaves behind. Missing or empty section → FAIL
- [ ] Cheap mechanical check: for each table under "Data Model → Owned (write)", search all target repos for writes to it (for example `INSERT INTO <table>`, `UPDATE <table>`, ORM save calls). A hit that the Existing Code section does not mention → FAIL
- [ ] If the design has `## Screens`, it must have `## UI Review` with the findings table. A blocker row must have a fix or "accepted by user" in the Fix column. A missing section or an open blocker → FAIL

### Tasks (04-plans)
Required:
- [ ] At least 1 task
- [ ] Each task has: title, description, files
- [ ] Tasks are ordered

### Iteration-Scoped Design (04-plans, iterations only)
Iteration-scoped designs are filtered subsets of the master design. Relaxed checks:
- [ ] Architecture overview (can reference master for full detail)
- [ ] Key technical decisions relevant to this iteration's tasks
- [ ] Cross-reference to spec: `Spec: artifacts/03-modules/{module}/spec.md`
- [ ] Cross-reference to master design: `Master: artifacts/04-plans/{module}/design.md`

### Unit Spec (02-discovery/units/<unit>/spec.md)
- [ ] Sections: Purpose, Fields, Bindings, Writes, Behavior, Legacy traps, Parity checklist
- [ ] With an adapter: `gate.json` in the unit folder has `pass: true`
- [ ] Without an adapter: the Manual gate is ticked, with reviewer and date

### Deviation Log (03-modules/deviation-log.md)
- [ ] Each row has all columns: ID, Unit, Legacy behavior, Target behavior, Reason, Approved by, Date, Status
- [ ] Each row has an approver
- [ ] Status is `approved` or `revoked`. No row is deleted

### Parity Evidence (06-evaluation/parity-evidence/)
- [ ] User, tenant and locale are equal on the legacy side and the target side
- [ ] `verdict` is `matches-legacy`, `target-bug` or `approved-deviation`

## Workspace Check (all phase transitions)

Before any phase transition, run `haren track check`. Its FAIL lines are FAIL lines of this validation: unregistered artifact files, index rows that point to missing files, and repo keys that manifest.yaml does not declare.

## Output

```
PASS — all required fields present
```
or
```
FAIL — missing:
  - {field 1}
  - {field 2}
Warnings:
  - {non-blocking issue}
```

## Rules

- FAIL blocks the phase transition — fix before proceeding
- Warnings are informational — note but don't block
- If a section says "TBD" or "TODO", that's a FAIL
