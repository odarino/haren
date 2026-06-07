---
name: create-artifact
description: Write new artifact files with correct templates and registry updates
type: utility
---

# Create Artifact

Write a new artifact file using the correct template and update the artifact registry.

## Process

1. **Determine artifact type** from the caller's context:
   - RESEARCH → `artifacts/01-research/`
   - Context brief → `artifacts/02-discovery/`
   - Module definition → `artifacts/03-modules/`
   - Master Spec/Design → `artifacts/04-plans/{module}/` (always at root)
   - Iteration-scoped Spec/Design/Tasks → `artifacts/04-plans/{module}/iteration-{N}/` (only when iterations enabled, use active plan path from skill.md)
   - Iteration file → `artifacts/07-iterations/iteration-{N}.md` (only when iterations enabled)
   - Session log → `artifacts/05-implementation/{module}/`
   - Review/Test report → `artifacts/06-evaluation/{module}/`

2. **Load template** from `templates/{type}.md`

3. **Fill template** with provided content

4. **Write file** to the correct path

5. **Update registry**: Append entry to `artifacts/_registry/artifact-index.md`:
   ```
   | {ID} | {type} | {module} | {status} | {path} |
   ```

6. **Update links**: Call update-links skill if this artifact references others

## Rules

- Always use the template — don't write freeform artifacts
- Always update the registry — it's the master index
- Create parent directories if they don't exist
- Use resolve-next-id skill for sequential IDs (RESEARCH artifacts)
