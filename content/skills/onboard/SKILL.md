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
   - `default_branch`: run `git -C <repo> symbolic-ref --short refs/remotes/origin/HEAD` and remove the `origin/` prefix. If the command fails, use the current branch.
   - `role`: `frontend` for a UI app (React, Vue, Angular, Svelte, Next.js, Nuxt, a Vite web app). `backend` for an API or a service. `e2e` for a repo that holds mainly end-to-end tests. `other` for all other repos. Keep an existing `role`. If it looks wrong, ask the user.
4. Show one table to the user: repo, stack, test_cmd, default_branch, role. Mark the values that change.
5. Ask: "Write these values into manifest.yaml?"
6. Write only after the user agrees. Change only these fields of the `repos` entries. Keep every other line and every comment in `manifest.yaml`.

If `repos` is empty, say so in the table output: "No repos listed in manifest.yaml." Suggest that the user adds repo entries (in the monorepo layout, folders such as `../backend`). Then continue with steps 2-4.

## 2. Health check

Check each repo in `repos`. In the workspace layout, also check the haren folder, because it is its own repo.

| Check | How | Report |
|---|---|---|
| Missing | The repo folder does not exist | "missing — run `haren init` to clone it" if the repo has a `remote`. Else "missing, no remote — clone it by hand". |
| Not a repo | The folder has no `.git` | "not a git repo" |
| Uncommitted changes | `git -C <repo> status --porcelain` prints lines | "uncommitted changes (N files)" |
| Branch | `git -C <repo> branch --show-current` is not `default_branch` | "on `<branch>`, default is `<default_branch>`". If a module in `progress.json` uses this branch (`modules.*.branch`), add "(module `<module>`)" and do not show it as a problem. |

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
