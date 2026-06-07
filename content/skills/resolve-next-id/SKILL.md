---
name: resolve-next-id
description: Find next available sequential ID for any artifact type
type: utility
---

# Resolve Next ID

Determine the next available ID for a given artifact type to prevent conflicts.

## Process

1. Scan the target directory for existing artifacts
2. Extract numeric IDs from filenames (e.g., RESEARCH-001 → 1)
3. Return next sequential ID, zero-padded to 3 digits

## ID Formats

| Type | Format | Example |
|------|--------|---------|
| RESEARCH | RESEARCH-{NNN}-{slug} | RESEARCH-001-auth-approach |

## Rules

- Always zero-pad to 3 digits (001, 002, etc.)
- Scan actual files, not just the registry (registry might be stale)
- Return both the ID and suggested filename
