---
name: update-tracking
description: Update progress.json and propagate status changes
type: utility
---

# Update Tracking

Update module and feature status in progress.json with validated transitions.

## Operations

### Update Feature Status
1. Validate the transition is allowed (see state machine in spec section 10)
2. Update the feature's status in progress.json
3. If all features in a module are "passing", suggest module completion review
4. Append event to events/events.jsonl
5. If `plugins.json` exists in the haren folder, run `haren plugin run on-task-status --payload '{"module":"<module>","feature":"<feature>","status":"<new status>"}'`. Show its output lines. A warning does not undo the status change

### Update Module Status
1. Validate the transition is allowed
2. Update the module's status and currentPhase
3. Append event to events/events.jsonl

### Add Feature to Module
1. Add feature with "pending" status to the module's features map
2. Update progress.json

### Record Commit
1. Set `lastCommit.<repoKey>` to the new commit SHA for the module. `lastCommit` is a map from repo key to SHA, never a plain string (see skill.md "Repos and Git")
2. If the module has no `branch` or `repos` yet, set them: `branch` is `feat/{module-slug}`, `repos` are the `repos:` keys in the module's `module.md`
3. Update `lastUpdated`

### Reconcile with Git
1. For each module, and for each repo key in its `repos` (or in its `lastCommit` map): resolve the repo folder as in skill.md "Repos and Git"
2. Read the tip of the module branch: `git -C <repo> rev-parse <branch>`, where `<branch>` is the module's recorded `branch` (fallback `feat/{module-slug}`, then `HEAD` if the branch does not exist)
3. Compare it with `lastCommit.<repoKey>`. Treat the key `default` as described in skill.md "Repos and Git". Check `git -C <repo> merge-base --is-ancestor <recorded sha> <tip>`
   - If it succeeds, there is no drift. Later commits are normal, including haren-only commits in the monorepo layout
4. Only if it fails, report drift. After the user agrees, update `lastCommit.<repoKey>` to the latest commit on the branch that changed files outside the haren folder
   - Monorepo layout: `git -C <repo> log -1 --format=%H <tip> -- ':(top,exclude)<haren folder path relative to the repo root>'`
   - Workspace layout: the tip
5. Flag any ambiguous state changes for human review

### Transition Iteration (only if iterations enabled)
1. Check if all tasks in the current iteration have status "passing"
2. If yes:
   - Increment `currentIteration` in progress.json
   - Update the iteration file (`07-iterations/iteration-{N}.md`) status to `complete`
   - If next iteration exists (already planned), set its status to `in-progress`
   - If no next iteration exists, suggest running the plan skill to slice the next iteration from the master plan
   - Append event to events/events.jsonl
3. Iteration transitions cannot be skipped — iteration N must complete before N+1 starts

## Valid Module Transitions

```
discovered → decomposed → planned → implementing → evaluating → completed
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

- Always validate transitions — reject invalid ones with clear error messages
- Always update lastUpdated timestamp
- Always append an event after any status change
- Never silently change status — log everything
