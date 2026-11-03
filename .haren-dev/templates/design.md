---
module: {module name}
date: {date}
---

# Design: {module name}

## Architecture Overview
{How the module is structured internally}

## Data Model
{Database schemas, key data structures}

## Existing Code
<!-- Required. Search ALL target repos, not only the module's own package. -->
<!-- One row for each table the module writes and each side effect it triggers (notification, mail, file, external call, audit log). -->

| Table / side effect | Existing writer or caller (file:line) | Verdict | Note |
|---------------------|---------------------------------------|---------|------|
| {table or effect} | {path:line, or "none found: <search command>"} | reuse / extend / supersede / duplicate (justify) | {why} |

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|

## Screens
<!-- Only if the module adds or changes screens. -->

### Screen: {screen name}
**Chosen:** option {A|B|C}

```
{ASCII wireframe of the chosen option}
```

| Option | Trade-off | Result |
|--------|-----------|--------|
| A | {one line} | chosen / rejected: {reason} |

## UI Review
<!-- Only if the module adds or changes screens. Use the ui-review skill. Severity: blocker | major | minor. A blocker needs a fix or "accepted by user". -->

| ID | Screen | Heuristic | Severity | Finding | Fix |
|----|--------|-----------|----------|---------|-----|

## File Structure
```
{planned file layout in target repo}
```

## External Dependencies
- {library/service}: {why needed}
