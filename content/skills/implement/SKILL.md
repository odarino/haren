---
name: implement
description: Implement a module's planned features one at a time
type: sequential
agent: developer
delegates:
  - superpowers:subagent-driven-development
  - superpowers:test-driven-development
---

# Implement

Execute the implementation plan for a module, one feature at a time.

## Pre-Implementation (every session)

1. Run read-context skill to orient
2. Read tasks from the **active plan path** (see skill.md Plan Paths convention)
3. Read `progress.json` to find current feature status
4. Read `artifacts/05-implementation/{module}/task-{N}-{slug}.md` if it exists for the target feature (previous session context)
4. If iterations enabled, also read the **master plan path** for broader module context if needed
5. Pick the highest-priority feature in "pending" status

## Implementation Loop

For each feature:

1. Update feature status to "in-progress" via update-tracking skill
2. Delegate to superpowers:subagent-driven-development:
   - Pass the full task description from tasks.md
   - Pass the design context from design.md
   - Ensure TDD discipline via superpowers:test-driven-development
3. After implementation:
   - Commit code in the target repo with descriptive message
   - Update feature status to "evaluating" via update-tracking skill
   - Append to task session log (`task-{N}-{slug}.md`): what was done, decisions made, any deviations from plan
   - Emit "feature-ready" event to events/events.jsonl

## Session Log

Each task gets its own session log file under `artifacts/05-implementation/{module}/`:

- **Convention:** `task-{number}-{slug}.md` where slug matches the feature key in `progress.json`
- **Examples:** `task-1-scaffold.md`, `task-2-sync-skills-api.md`, `task-5-analytics.md`
- This allows parallel development — each developer owns their task file with no merge conflicts

If iterations are enabled (check manifest.yaml for `iterations` block), include the **Iteration:** field in session log header with the value of `currentIteration` from progress.json. If not enabled, omit it.

```markdown
## Session {date} {time}

### Working on: {feature-name}
- Key decisions made and why
- Files created/modified
- Commit hash
- Any deviations from the plan

### Next up
{next feature or "all features complete"}
```

## Rules

- One feature at a time — finish and commit before starting the next
- Always write tests before implementation (TDD)
- If blocked, set feature to "blocked" and surface to user — don't guess
- If you need to deviate from the plan, document why in the session log
- Never modify haren/ files except progress.json and session logs
