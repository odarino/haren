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
   - Read the module's repos from the `repos:` front matter of `artifacts/03-modules/{module}/module.md`. If it lists no repos, follow "No repos listed" in skill.md "Repos and Git"
   - For each repo: if it has uncommitted changes, stop and ask the user what to do. Changes inside the haren folder do not count as uncommitted changes for this check
   - For each repo: if the branch `feat/{module-slug}` does not exist, create it from the repo's `default_branch`, or from the current branch if `default_branch` is not set. Then switch to it
   - If the module depends on a module that is not merged yet, follow skill.md "Dependent modules" for the base branch
   - If the module status is `planned`, set it to `implementing` with `haren track status <module> implementing`

## Implementation Loop

For each feature:

1. Update feature status: `haren track feature <module> <feature> in-progress`
2. Choose the path by task size (see "Fast path" below):
   - **Small task:** implement it directly in the main session with superpowers:test-driven-development
   - **Other tasks:** delegate to superpowers:subagent-driven-development. Pass the full task description from tasks.md and the design context from design.md. Ensure TDD discipline via superpowers:test-driven-development
3. After implementation:
   - (a) Commit the code in each repo that the feature changed: `git -C <repo> commit` with a descriptive message. In the monorepo layout, make one code commit for all repo keys; see skill.md "Repos and Git"
   - (b) Record each new commit SHA in `lastCommit.<repoKey>`: `haren track commit <module> <repoKey> <sha>`
   - Update feature status: `haren track feature <module> <feature> evaluating`
   - Append to task session log (`task-{N}-{slug}.md`): what was done, decisions made, any deviations from plan, and the commit SHA for each repo
   - Append the "feature-ready" event: `haren track event feature-ready --module <module> --phase implement --feature <feature>`
   - (c) Commit the haren files (session log, `progress.json` and `events/events.jsonl`) in the haren repo. List the code commits in the message, for example `docs(checkout): task 2 session log — backend@abc1234, frontend@def5678`. In the monorepo layout the haren folder is in the same repo, so (a) and (c) are two commits on the same branch: the code commit first, then the haren commit. In the workspace layout, commit the haren files on the haren repo's current branch. Do not create a module branch in the haren repo.
   - Never push

## Fast path

A task is **small** when it changes about 30 lines or fewer, adds no new external dependency and has no schema migration. The plan marks a small module (see the plan skill). For a small task, skip superpowers:subagent-driven-development. Write the failing test, implement, verify and commit in the main session. TDD and the commit steps stay the same. If the user asks for the full path, use superpowers:subagent-driven-development for every task.

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
- If blocked, run `haren track feature <module> <feature> blocked` and surface to user — don't guess
- If you need to deviate from the plan, document why in the session log
- Never modify files in the haren folder except session logs. Change `progress.json` and `events/events.jsonl` only with `haren track` (see update-tracking skill). Never edit them with sed or jq
- Never push. Never create pull requests unless the user asks
