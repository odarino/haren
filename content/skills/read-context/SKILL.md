---
name: read-context
description: Session orientation — read manifest, progress, artifacts, and git state
type: utility
---

# Read Context

Orient yourself at the start of every session or before taking any action.

## Process

1. **Read manifest.yaml**
   - Project name, mode, repos, sources
   - Resolve each repo folder as in skill.md "Repos and Git". Warn if a folder is missing, and suggest `haren init` (it clones missing repos)

2. **Read progress.json**
   - List all modules and their current status
   - List all features and their status within active modules

3. **Read artifact-index.md**
   - Understand what artifacts exist
   - Note any gaps (e.g., module has no plan yet)

4. **Scan `artifacts/00-baseline/`**
   - List any files found (PDFs, docs, markdown, etc.)
   - If files exist and mode is `undecided`:
     → Suggest switching to `blueprint` mode ("You have baseline docs — blueprint mode is recommended")
   - If files exist and mode is `explore`:
     → Suggest switching to `blueprint` mode ("Found docs in baseline — did you mean to use blueprint mode?")
   - If files exist and discovery hasn't started yet:
     → Suggest starting the discover phase to process them
   - If files were added since last session (compare against artifact-index.md):
     → Flag new documents and ask if the user wants to re-run or update discovery

5. **Git check** — for each repo in manifest `repos`, and for the haren folder itself in the workspace layout (see skill.md "Repos and Git")
   - Check for uncommitted changes: `git -C <repo> status --porcelain`
   - Read the current branch: `git -C <repo> branch --show-current`
   - For each module that has `lastCommit.<repoKey>` for this repo: check that the recorded SHA is in the history with `git -C <repo> merge-base --is-ancestor <sha> <branch>`, where `<branch>` is the module's recorded `branch` (use `HEAD` only if the module has no `branch`)
     - If it is an ancestor and the branch moved: report "N new commits since last recorded" (`git -C <repo> rev-list --count <sha>..<branch>`). In the monorepo layout, N can include haren-only commits
     - If it is not an ancestor: report drift
   - The key `default` in `lastCommit` means the repo that holds the haren folder (monorepo layout) or the module's first repo (workspace layout)
   - If drift is detected: warn the user. After the user agrees, update `progress.json` via update-tracking skill

6. **Produce orientation summary**

## Output Format

Present to the user:

```markdown
## Session Context
Project: {name} ({mode} mode)
Iteration: {N} of {total} ({status}) ← only if iterations enabled
Repos: {key: branch, clean | N changed files | missing} for each repo
Haren repo: {branch, clean | N changed files} ← workspace layout only

## Baseline Documents
{list of files in 00-baseline/, or "None"}
{if new docs found: "⚠ New documents detected since last session"}

## Module Status
- {module}: {STATUS} ({detail — e.g., "3/7 tasks done"})
  - If status is "planned" or "planning":
    - If iterations disabled: check which files exist in 04-plans/{module}/
      - ✓ spec.md | ✗ spec.md
      - ✓ design.md | ✗ design.md
      - ✓ tasks.md | ✗ tasks.md
    - If iterations enabled: check master and active iteration plan
      - Master: ✓ spec.md | ✗ spec.md, ✓ design.md | ✗ design.md
      - Iteration {N}: ✓ spec.md | ✗ spec.md, ✓ design.md | ✗ design.md, ✓ tasks.md | ✗ tasks.md
- ...

## Suggested Next Action
{what to do next based on current state}

## Active Blockers
{any blocked features or modules}

## Recent Events
{last 5 entries from events/events.jsonl}
```

## Rules

- Always run this before any other action
- If progress.json doesn't exist, suggest running discover phase
- If manifest.yaml is missing repos, warn but don't block
- Surface drift between progress.json and git state to the user
