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
