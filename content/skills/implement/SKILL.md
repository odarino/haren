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
5. If iterations enabled, also read the **master plan path** for broader module context if needed
6. Pick the highest-priority feature in "pending" status
7. Set up the module branch. Follow skill.md "Repos and Git":
   - Read the module's repos from the `repos:` front matter of `artifacts/03-modules/{module}/module.md`
   - For each repo: if it has uncommitted changes, stop and ask the user what to do
   - For each repo: if the branch `feat/{module-slug}` does not exist, create it from the repo's `default_branch`. Then switch to it
   - Record `branch` and `repos` for the module in `progress.json` via update-tracking skill

## Implementation Loop

For each feature:

1. Update feature status to "in-progress" via update-tracking skill
2. Delegate to superpowers:subagent-driven-development:
   - Pass the full task description from tasks.md
   - Pass the design context from design.md
   - Ensure TDD discipline via superpowers:test-driven-development
3. After implementation:
   - Commit the code in each repo that the feature changed: `git -C <repo> commit` with a descriptive message
   - Record each new commit SHA in `progress.json` `lastCommit.<repoKey>` via update-tracking skill
   - Update feature status to "evaluating" via update-tracking skill
   - Append to task session log (`task-{N}-{slug}.md`): what was done, decisions made, any deviations from plan, and the commit SHA for each repo
   - Commit the session log and `progress.json` in the haren repo. List the code commits in the message, for example `docs(checkout): task 2 session log — backend@abc1234, frontend@def5678`. In the monorepo layout, code and haren files are in one repo: make one commit that holds both
   - Emit "feature-ready" event to events/events.jsonl
   - Never push

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
- Commit SHA per repo (for example backend@abc1234)
- Any deviations from the plan

### Next up
{next feature or "all features complete"}
```

## Rules

- One feature at a time — finish and commit before starting the next
- Always write tests before implementation (TDD)
- If blocked, set feature to "blocked" and surface to user — don't guess
- If you need to deviate from the plan, document why in the session log
- Never modify files in the haren folder except `progress.json`, session logs and `events/events.jsonl`
- Never push. Never create pull requests unless the user asks
