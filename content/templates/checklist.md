---
module: {module name}
date: {date}
tasks: {path of tasks.md}
owner: Dev
---

# Implementation Checklist: {module name}

The developer ticks each item before the code commit of the task. The reviewer checks each ticked item against the code. An item that is not ticked and has no reason is a finding.

Tick an item only after you verify it in the code or a test run. If the code differs from the item, keep it unticked and add `— changed: {what and why}`. To skip an item, keep it unticked and add `— skipped: {reason}`.

## Task 1: {title}

- [ ] Tests: {test file and the cases to cover, from the acceptance criteria of STORY-NNN}
- [ ] Reuse: {catalog entries or `## Existing Code` items to use, for example `Button`, `NotificationService.send`}. No new copy of them
- [ ] Files: {files to create or modify, from tasks.md}
- [ ] Contract: {interface, API shape or schema that must match the spec}
- [ ] Edge cases: {error, empty and permission cases from the spec}
- [ ] UI states (screens only): {loading, empty, error, matches the chosen mockup}
- [ ] Quality: lint, type check and the full test suite pass
- [ ] {project-specific item, for example i18n keys, audit log, migration rollback}

## Task 2: {title}
...
