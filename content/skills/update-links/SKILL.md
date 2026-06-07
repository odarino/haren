---
name: update-links
description: Maintain bidirectional cross-references between artifacts
type: utility
---

# Update Links

Keep cross-references between artifacts consistent when new artifacts are created.

## Link Rules

When creating: | Update:
---|---
RESEARCH | If spawned from another artifact, add backlink
Module definition | Link to context-brief
Spec (in 03-modules) | Link to module definition, link to any referenced RESEARCH
Design | Link to spec (`Spec: 03-modules/{module}/spec.md`)
Review | Link to spec (`Spec: 03-modules/{module}/spec.md`)
Iteration-scoped Design | Link to master design (`Master: 04-plans/{module}/design.md`)
Iteration file (07-iterations) | Link to iteration-scoped designs in 04-plans

## Process

1. Identify the artifact just created and its references
2. For each referenced artifact:
   - Open it
   - Add a link back to the new artifact in its "Related Artifacts" section
3. Update artifact-index.md if link relationships changed

## Rules

- Links are bidirectional — if A references B, B should reference A
- Use relative paths from haren root
- Don't create circular link chains — just direct references
