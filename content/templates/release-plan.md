---
type: release-plan
date: {date}
status: draft
---

# Release Plan

<!-- Newest release first. Keep old releases below. -->

## Release {name or version} — {date}

**Modules:** {module-a}, {module-b}
**Status:** planned | in progress | released | rolled back

### Preconditions
- [ ] Every feature of each module is `passing`
- [ ] Each module branch is merged into the repo's default branch
- [ ] Each dependency module is released or is in this release
- [ ] Seed data and fixtures use synthetic data only

### Steps

| # | Module | Repo | Branch / tag | Preconditions | Deploy command | Verify command | Rollback | Owner | Result |
|---|--------|------|--------------|---------------|----------------|----------------|----------|-------|--------|
| 1 | {module} | {repo key} | {branch or tag} | {what must be true} | `{command}` | `{command}` | {how to undo} | {name} | pending |

### Notes
- {compatibility notes, for example: old mobile clients still call the v1 endpoint}
