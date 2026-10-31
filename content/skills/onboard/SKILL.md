---
name: haren-onboard
description: Onboard a developer to this haren workspace. Analyze each repo, check repo health, and brief the developer on the project state. Use when someone runs /haren-onboard, is new to the project, or asks "is my workspace set up?" or "what is this project?".
type: utility
---

# Haren Onboard

Run this skill after `haren init` sets up the workspace. This skill reads and reports. It writes only the manifest fields that the user approves. It never clones, pulls, stashes, switches branches or writes code.

## 0. Find the haren folder

1. The haren folder is the folder whose `manifest.yaml` has a top-level `haren:` key. Look in the current folder first, then in its direct child folders.
2. If no folder has this key, stop. Tell the user to run `haren init`.
3. Read `manifest.yaml`, `progress.json` and the "Repos and Git" section of `skill.md` in the haren folder. Follow that section for all repo paths and git commands.

## 1. Analyze repos

Do these steps for each entry in `repos`:

1. Find the repo folder: `<haren folder>/<path>`. If the folder does not exist, skip this repo. Step 2 reports it.
2. Read the build files that exist in the repo folder: `package.json` and its lock file, `go.mod`, `pom.xml`, `build.gradle` or `build.gradle.kts`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `composer.json`, `Gemfile`, `*.csproj`.
3. Decide these values:
   - `stack`: a short kebab-case name, for example `node-express`, `react-vite`, `nextjs`, `go`, `java-spring`, `python-fastapi`.
   - `test_cmd`: the command that runs the tests, from the package scripts or the build tool, for example `bun test`, `pnpm test`, `go test ./...`, `mvn test`, `pytest`. If you are not sure, leave it empty.
   - `default_branch`: keep an existing value. Else try these steps in order and stop at the first result:
     1. `git -C <repo> symbolic-ref --short refs/remotes/origin/HEAD`. Remove the `origin/` prefix.
     2. The first of `origin/main`, `origin/master`, `origin/develop` that exists. Test each with `git -C <repo> rev-parse --verify --quiet <ref>`. Remove the `origin/` prefix.
     3. The first local branch of `main`, `master` that exists (`git -C <repo> rev-parse --verify --quiet <branch>`).
     4. Ask the user.
     Never use the current branch when it looks like a work branch (`feat/`, `feature/`, `fix/`, `bugfix/`, `hotfix/`, `chore/`, `release/`). Say in the table which step gave the value.
   - `role`: `frontend` for a UI app (React, Vue, Angular, Svelte, Next.js, Nuxt, a Vite web app). `backend` for an API or a service. `e2e` for a repo that holds mainly end-to-end tests. `other` for all other repos. Keep an existing `role`. If it looks wrong, ask the user.
   - Current branch: run `git -C <repo> branch --show-current`. If it prints nothing, the repo is on a detached HEAD. Report "detached HEAD at <short sha>" and get the sha with `git -C <repo> rev-parse --short HEAD`.
4. Show one table to the user: repo, stack, test_cmd, default_branch, role. Mark the values that change.
5. Ask: "Write these values into manifest.yaml?"
6. Write only after the user agrees. Change only these fields of the `repos` entries. Write them in this order: `path`, `remote`, `default_branch`, `role`, `stack`, `test_cmd`. Keep every other line and every comment in `manifest.yaml`.

If `repos` is empty, say so in the table output: "No repos listed in manifest.yaml." `skill.md` "Repos and Git" has a "No repos listed" fallback: in the monorepo layout, the repo that holds the haren folder is the only repo, with the key `default`. Mention it.

In the monorepo layout, propose `repos` entries:

1. Find the package folders in the repo root. Read the `workspaces` field of `package.json`, `pnpm-workspace.yaml`, `go.work`, and the `<modules>` of a root `pom.xml`. Also check `apps/*`, `packages/*` and `services/*`.
2. For each package folder, propose one entry. The key is the folder name. The `path` is relative to the haren folder (for example `../apps/backend`). Do steps 1.2 and 1.3 for each entry.
3. Show the proposed entries as a table. Ask: "Add these repos to manifest.yaml?" Write only after the user agrees.

In the workspace layout, suggest that the user adds repo entries. Then continue with steps 2-4.

## 2. Health check

Check each repo in `repos`. In the workspace layout, also check the haren folder, because it is its own repo.

| Check | How | Report |
|---|---|---|
| Missing | The repo folder does not exist | "missing — run `haren init` to clone it" if the repo has a `remote`. Else "missing, no remote — clone it by hand". |
| Not a repo | The folder has no `.git` | "not a git repo" |
| Uncommitted changes | `git -C <repo> status --porcelain` prints lines | "uncommitted changes (N files)" |
| Branch | Only when `default_branch` is known. `git -C <repo> branch --show-current` is not `default_branch`. On a detached HEAD, report "detached HEAD at <short sha>". | "on `<branch>`, default is `<default_branch>`". If a module in `progress.json` uses this branch (`modules.*.branch`), add "(module `<module>`)" and do not show it as a problem. |

**Key drift.** For each repo key, check that the `path` is a real folder. For each module in `progress.json`, check its `repos` keys. Each key must exist in `manifest.yaml`. The module's code must be under that key's `path`: compare the files of its recorded commits (`git -C <repo> show --name-only --format= <sha>` for each `lastCommit` SHA) with the `path`. Report each mismatch, for example "module `share` uses key `types`, but its code is in `packages/shared`". Do not fix it. Suggest the change and ask.

The haren folder has no `default_branch`. For the haren folder, report only its current branch. Do not compare it with a default branch.

Do not fetch. Do not fix anything. Report only.

## 3. Briefing

Read these files if they exist:

- `artifacts/00-baseline/concept-brief.md`
- `artifacts/02-discovery/context-brief.md`
- `artifacts/03-modules/architecture.md`
- `artifacts/_registry/artifact-index.md`
- `progress.json`

Write a summary of 15 lines or less:

- What the project is, in one or two sentences.
- The current phase and the status of each module.
- For each active module: its branch and its repos.
- The next step. Use the "How to dispatch" section of `skill.md`.

## 4. Empty project

If `artifacts/` has no artifacts other than the registry, and `progress.json` has no modules, write only this line in the briefing:

"No artifacts yet. Start with `ideate` (you have a raw idea) or `discover` (you know what to build)."

## Output

```markdown
## Workspace
Layout: {monorepo | workspace} · Haren folder: {folder name}

| Repo | Stack | Role | Branch | Status |
|------|-------|------|--------|--------|

## Project
{briefing}

## Next step
{one line}
```

## Rules

- Ask before you write. Ask one question at a time.
- Never clone, pull, push, stash or switch branches.
- Never write code.
