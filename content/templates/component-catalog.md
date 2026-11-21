---
title: Component Catalog
updated: {date}
last_scan: {full | incremental <repoKey>@<sha>, ...}
owner: Dev
---

# Component Catalog

Common UI components, shared services and shared functions of the target repos. The collect-components skill updates this file. The plan skill reads it before the reuse inventory.

## UI Components

### {Name}
- **Kind:** UI component
- **Path:** `{repoKey}:{file}:{line}`
- **API:** {props, variants, states}
- **Use for:** {when to pick this}
- **Used by:** {modules}
- **Sketch:**
  ```
  {ASCII sketch, 8 lines or fewer}
  ```

## Shared Services

### {Name}
- **Kind:** Shared service
- **Path:** `{repoKey}:{file}:{line}`
- **API:** {public methods, side effects, tables it writes}
- **Use for:** {when to pick this}
- **Used by:** {modules}

## Shared Functions

### {Name}
- **Kind:** Shared function
- **Path:** `{repoKey}:{file}:{line}`
- **API:** {signature → return}
- **Use for:** {when to pick this}
- **Used by:** {modules}
