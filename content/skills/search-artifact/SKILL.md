---
name: search-artifact
description: Query artifacts by module, status, type, or keyword
type: utility
---

# Search Artifact

Find and query artifacts in the workspace.

## Query Types

1. **By type**: "find all SPECs" → scan `artifacts/04-plans/*/spec.md` and `artifacts/04-plans/*/iteration-*/spec.md` (if iterations enabled)
2. **By module**: "what artifacts exist for auth?" → scan all artifact folders for auth
3. **By status**: "what's blocked?" → read progress.json, filter by status
4. **By keyword**: "find mentions of authentication" → grep across artifacts/
5. **By registry**: "list all artifacts" → read `artifacts/_registry/artifact-index.md`

## Output

Present results as a table:

| ID | Type | Module | Status | Path |
|----|------|--------|--------|------|

## Rules

- Always check artifact-index.md first for fast lookups
- Fall back to file scanning if the index seems stale
- Return paths relative to the haren root
