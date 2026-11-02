---
unit: {SCR_A001}
module: {module}
source: {legacy path of the unit}
---

# Unit Spec: {SCR_A001}

## Purpose
{What the user does on this unit. One paragraph.}

## Fields
| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|

## Bindings
| Binding | Source (table.column or query) | Read or write |
|---------|-------------------------------|---------------|

## Writes
| Table | Operation | Condition |
|-------|-----------|-----------|
| {ORDER_TBL} | insert | {when} |

Side effects (notification, mail, file, external API, audit log, numbering):
- {side effect}

## Behavior
1. {event} → {result}

## Legacy traps
- {Rule ID from `artifacts/01-research/legacy-semantics.md`}: {how it applies here}

## Parity checklist
- [ ] {observable behavior to compare on legacy and target}

## Manual gate
Use this section only when the workspace has no adapter gate.

- [ ] Every binding is covered in the spec
- [ ] Every write is covered in the spec
- Reviewer: {name}
- Date: {date}
