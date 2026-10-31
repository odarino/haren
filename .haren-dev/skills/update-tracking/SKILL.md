---
name: update-tracking
description: Update progress.json, the artifact index and events with the haren track CLI
type: utility
---

# Update Tracking

Record module status, feature status, commits, artifacts and events with the `haren track` CLI. The CLI validates each transition, updates `lastUpdated` and appends the matching event.

<HARD-GATE>
Never edit `progress.json`, `events/events.jsonl` or `artifacts/_registry/artifact-index.md` by hand, with sed, or with jq. Always use a `haren track` command. If a command fails, show the error to the user. Do not work around it with a hand edit.
</HARD-GATE>

Run every command from the haren folder.

## Commands

| Goal | Command |
|------|---------|
| Set module status | `haren track status <module> <status>` |
| Add a feature (status `pending`) | `haren track feature <module> <feature>` |
| Set feature status | `haren track feature <module> <feature> <status>` |
| Record a commit | `haren track commit <module> <repoKey> <sha>` |
| Register an artifact | `haren track artifact <id> --type <type> --path <path> [--module <m>] [--status <s>]` |
| Append another event | `haren track event <type> [--module m] [--phase p] [--feature f] [--data '<json>']` |
| Open the code gate for a user request | `haren track override on --reason "<text>" [--hours <n>]` |
| Close the code gate again | `haren track override off` |

The `status`, `feature`, `commit`, `artifact` and `override` commands append their own events. Do not also run `haren track event` for the same change.

## Operations

### Update Feature Status
1. Run `haren track feature <module> <feature> <status>`. The CLI rejects an invalid transition
2. If all features in a module are "passing", suggest module completion review
3. If `plugins.json` exists in the haren folder, run `haren plugin run on-task-status --payload '{"module":"<module>","feature":"<feature>","status":"<new status>"}'`. Show its output lines. A warning does not undo the status change

### Update Module Status
1. Run `haren track status <module> <status>`. The CLI rejects an invalid transition

### Add Feature to Module
1. Run `haren track feature <module> <feature>`. The feature starts as `pending`

### Record Commit
1. Run `haren track commit <module> <repoKey> <sha>`. This sets `lastCommit.<repoKey>` for the module. `lastCommit` is a map from repo key to SHA, never a plain string (see skill.md "Repos and Git")
2. The module `branch` is `feat/{module-slug}`. The module `repos` are the `repos:` keys in the module's `module.md`. If the module uses a different base branch (see skill.md "Dependent modules"), record it in the session log

### Register Artifact
1. Run `haren track artifact <id> --type <type> --path <path> --module <module>` after you write a new artifact. Add `--status <s>` when the artifact has a status

### Reconcile with Git
1. For each module, and for each repo key in its `repos` (or in its `lastCommit` map): resolve the repo folder as in skill.md "Repos and Git"
2. Read the tip of the module branch: `git -C <repo> rev-parse <branch>`, where `<branch>` is the module's recorded `branch` (fallback `feat/{module-slug}`, then `HEAD` if the branch does not exist)
3. Compare it with `lastCommit.<repoKey>`. Treat the key `default` as described in skill.md "Repos and Git". Check `git -C <repo> merge-base --is-ancestor <recorded sha> <tip>`
   - If it succeeds, there is no drift. Later commits are normal, including haren-only commits in the monorepo layout
4. Only if it fails, report drift. After the user agrees, run `haren track commit <module> <repoKey> <sha>` with the latest commit on the branch that changed files outside the haren folder
   - Monorepo layout: `git -C <repo> log -1 --format=%H <tip> -- ':(top,exclude)<haren folder path relative to the repo root>'`
   - Workspace layout: the tip
5. Flag any ambiguous state changes for human review

### Transition Iteration (only if iterations enabled)
1. Check if all tasks in the current iteration have status "passing"
2. If yes:
   - Ask the user to confirm the move to the next iteration. Increment `currentIteration` in progress.json only through the CLI if it has a command for it; otherwise ask the user to make the change
   - Update the iteration file (`07-iterations/iteration-{N}.md`) status to `complete`
   - If next iteration exists (already planned), set its status to `in-progress`
   - If no next iteration exists, suggest running the plan skill to slice the next iteration from the master plan
   - Run `haren track event iteration-complete --data '{"iteration":<N>}'`
3. Iteration transitions cannot be skipped — iteration N must complete before N+1 starts

## Event Schema (`events/events.jsonl`)

Each line is one JSON object. Common fields:

| Field | Required | Value |
|-------|----------|-------|
| `type` | yes | Event type, kebab-case (for example `feature-ready`) |
| `timestamp` | yes | ISO 8601 time. The CLI sets it |
| `module` | when the event is about a module | Module slug |
| `phase` | when known | One of the phase values below |
| `feature` | when the event is about a feature | Feature key from `progress.json` |

Per-type fields come from the command, or from `--data` for `haren track event`. The `--data` JSON is merged into the line. Common event types:

| Type | Written by | Extra fields |
|------|------------|--------------|
| `module-status` | `haren track status` | `from`, `to`, `phase` |
| `feature-status` | `haren track feature` | `from`, `to` |
| `commit` | `haren track commit` | `repo`, `sha` |
| `artifact` | `haren track artifact` | `id`, `artifactType`, `path`, `status` |
| `gate-override` | `haren track override` | `action` (`on`/`off`), `reason`, `until` |
| `feature-ready` | `haren track event feature-ready` | optional `repos` and SHAs |
| `escalate-human` | `haren track event escalate-human` | `attempt`, reason |
| `iteration-complete` | `haren track event iteration-complete` | `iteration` |
| `release-step` | `haren track event release-step` | `step`, `repo`, result |

**Phase values:** `ideate`, `discover`, `research`, `decompose`, `plan`, `implement`, `evaluate`, `release`, `blocked`.

## Valid Module Transitions

```
discovered → decomposed → planned → implementing → evaluating → completed → released
                                       ↑              |
                                       └── fix ───────┘
                                                      |
                                                 (3 failures)
                                                      ↓
                                                   blocked
```

## Valid Feature Transitions

```
pending → in-progress → evaluating → passing
                                   → fixing → evaluating (loop)
                                   → blocked (after 3 failures)
```

## Rules

- Always use `haren track`. Never edit `progress.json`, `events/events.jsonl` or `artifact-index.md` with sed, jq or a text editor
- The CLI validates transitions. Show its error to the user when it rejects one
- Every status change appends an event. Never change status silently
