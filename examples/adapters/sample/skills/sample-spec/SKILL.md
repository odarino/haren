---
name: sample-spec
description: Write the spec of one extracted screen unit for the sample adapter
---

# Sample spec

Write `artifacts/02-discovery/units/<unit>/spec.md` for one extracted unit.

## Inputs

1. `artifacts/02-discovery/units/<unit>/ir.xml`
2. `artifacts/02-discovery/units/<unit>/view.txt`
3. `artifacts/01-research/legacy-semantics.md`

## Steps

1. Read the three inputs.
2. Start from the `unit-spec.md` template if the workspace has one.
3. Write these sections: Fields, Bindings, Writes, Behavior, Parity checklist.
4. In Bindings, list every `bind` value from `ir.xml` exactly as written.
5. In Writes, list every `<writes table>` under the `## Writes` heading.
6. Run `haren track unit <module> <unit> spec-draft`.
7. Run `haren migrate gate <unit>`. Fix the findings. Run it again.
8. Ask the user to review. Run `haren migrate gate <unit> --approve`.
