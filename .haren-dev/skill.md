---
name: haren
description: Agentic SDLC framework — orchestrates AI agents through structured phases
---

# Haren

You are operating within the Haren agentic SDLC framework.

## On Session Start

1. Read `manifest.yaml` to understand the project
2. Read `progress.json` to understand current state
3. Read `artifacts/_registry/artifact-index.md` for artifact inventory
4. **Scan `artifacts/00-baseline/`** for documents (PDFs, docs, markdown, etc.)
   - If docs found and mode is `undecided` → auto-recommend `blueprint` mode
   - If docs found and discovery hasn't started → suggest starting discover phase
   - If new docs added since last session → flag them and ask about re-discovery
5. **If mode is "undecided" and no baseline docs found:** Help the user choose a mode. Ask them:
   - What do you want to build? (get a brief description)
   - Do you already have documentation or specs for it?
   - Do you have an existing codebase to build on?
   Based on their answers, recommend a mode and update `manifest.yaml`:
   - Has docs/specs → tell them to drop docs in `artifacts/00-baseline/` then `blueprint`
   - Starting from scratch, just an idea → `explore`
   - Has existing code → `inherit`
6. Suggest next action based on current state

## Available Actions

| Intent | Skill | Agent |
|--------|-------|-------|
| Design a feature | discover/ (brainstorming) | Researcher |
| Start a new project | discover/ | Researcher |
| Research a topic | research/ | Researcher |
| Break into modules | decompose/ | Architect |
| Extract stories from docs | extract-stories/ | Researcher |
| Plan a module | plan/ | Planner |
| Implement a module | implement/ | Developer |
| Evaluate a module | evaluate/ | Reviewer |
| Check project status | read-context/ | — |
| Search artifacts | search-artifact/ | — |
| Release completed modules | release/ | Architect |
| Draw a UI wireframe or compare screen options | generate-mockup/ | — |
| Update status, artifacts, events | update-tracking/ (`haren track`) | — |
| Onboard to the project / check the workspace | onboard/ (`/haren-onboard`) | — |

## How to dispatch

- User says "let's build X" or describes a new feature → discover/ skill (triggers brainstorming)
- User says "what's next?" → read `progress.json` → suggest action
- User says "extract stories" or "break down the PRD" or "create stories from docs" → extract-stories/ skill
- User says "let's work on {module}" → check module phase → dispatch appropriate skill
- User says "I need to research X" → research/ skill
- User says "status" or "where are we?" → read-context/ skill
- User says "start" or "init" → discover/ skill
- User asks about an artifact → search-artifact/ skill
- User says "release", "deploy" or "ship {module}" → release/ skill (plans the order; never deploys by itself)
- User runs `/haren-onboard`, is new to the project, or asks "is my workspace set up?" → onboard/ skill

## Phases

`ideate` → `discover` → `research` → `decompose` → `plan` → `implement` → `evaluate` → `release`. A module that is stuck is in `blocked`. These are also the allowed `phase` values in `events/events.jsonl`.

Module status: `discovered → decomposed → planned → implementing → evaluating → completed → released`.

## Tracking

Change `progress.json`, `events/events.jsonl` and `artifacts/_registry/artifact-index.md` only with `haren track` (see update-tracking/ skill). Never edit them by hand, with sed or with jq.

## Artifact Ownership

| Artifact | Owner | Location |
|----------|-------|----------|
| Spec (requirements, stories) | BA | `artifacts/03-modules/{module}/spec.md` |
| Module definition | Discover phase | `artifacts/03-modules/{module}/module.md` |
| Design (architecture) | Dev | `artifacts/04-plans/{module}/design.md` |
| Tasks (implementation) | Dev | `artifacts/04-plans/{module}/[iteration-{N}/]tasks.md` |

## Plan Paths

All skills that read or write plan artifacts MUST resolve paths using this convention:

**Spec path (BA-owned, always the same):**
- `artifacts/03-modules/{module}/spec.md` — requirements, user stories (STORY-IDs), acceptance criteria
- BA updates this file and adds a row to the Changelog table
- Devs read this but never write to it

**If `manifest.yaml` has `iterations.enabled: true`:**
- Read `currentIteration` from `progress.json`
- **Active plan path:** `artifacts/04-plans/{module}/iteration-{N}/` — design + tasks for current iteration
- **Master plan path:** `artifacts/04-plans/{module}/` — full module design
- The plan skill writes to BOTH master and active paths (it is the only skill that does this)

**If no `iterations` block in manifest.yaml:**
- **Active plan path:** `artifacts/04-plans/{module}/` — contains design.md, tasks.md
- **Master plan path:** (same as active)

When a skill says "read the spec", it means from `artifacts/03-modules/{module}/spec.md`.
When a skill says "read tasks" or "read design", it means from the **active plan path**.
When a skill says "read the master plan" or needs full module context, it means from the **master plan path**.

## Repos and Git

`manifest.yaml` has `layout` (`monorepo` or `workspace`) and a `repos` map. Each repo has a `path` relative to this haren folder (for example `../backend`). A repo can also have `remote`, `default_branch`, `role` (`frontend`, `backend`, `e2e` or `other`), `stack` and `test_cmd`.

- **Repo folder:** `<this haren folder>/<path>`. Run git with `git -C <repo folder> ...`.
- **Workspace layout:** each repo is its own git repository, and this haren folder is one more. Commit code in the code repo. Commit artifacts, session logs and `progress.json` in the haren repo.
- **Monorepo layout:** the repos and this haren folder share one git repository and one module branch. Commit code first, then commit the haren files (session log, `progress.json`, `events/events.jsonl`) as a second commit on the same branch. Make one code commit for all repo keys. Stage only paths outside this haren folder (for example `git -C <repo root> add -- . ':(exclude)<haren folder>'`, where `<haren folder>` is relative to the repo root). Record that one SHA under each repo key the feature changed.
- **Module repos:** the `repos:` keys in the module's `module.md` front matter. Copy them to `progress.json` `modules.<module>.repos`.
- **No repos listed:** if `repos` is empty, or the module's `module.md` lists no repos (common in the monorepo layout), use the git repository that holds this haren folder as the module's only repo, with the key `default`. In the workspace layout, this haren folder is its own repo and holds no code: ask the user which repo to use, and add it to `repos`.
- **Branch:** a module uses the branch `feat/<module-slug>` in every repo it touches. Record it in `modules.<module>.branch`.
- **lastCommit:** `modules.<module>.lastCommit` maps a repo key to the last commit SHA that haren recorded, for example `{ "backend": "abc1234" }`. It is never a plain string. The key `default` comes from an old progress file. In the monorepo layout, it means the repo that holds this haren folder. In the workspace layout, it means the module's first repo.
- Never push. Never create pull requests unless the user asks. Never clone repos — tell the user to run `haren init`.

### Dependent modules

The decompose skill records module dependencies in `progress.json` `dependencies` (for example `"web": ["api"]`). If module B depends on module A:

- **A is merged:** create `feat/<B>` from the default branch as usual.
- **A is not merged yet:** create `feat/<B>` from `feat/<A>`. Record the base in the session log, for example "baseBranch: feat/<A>". Merge A into the default branch first. Then rebase or merge B onto the default branch, and only then merge B.
- **Monorepo layout:** both modules share one repository. When possible, merge A before you start B, so that B starts from the default branch.
- Never merge B before A.

## Rules

- Always read progress.json before taking action
- Write outside this haren folder only in the module's repos (see "Repos and Git"), only from the `planned` status on (implement phase) or when qa-engineer writes tests in `$E2E`, or when the user explicitly asks. For a user request outside the module flow (for example a hotfix), first run `haren track override on --reason "<what the user asked>"`, and run `haren track override off` when the change is done
- The code gate allows code only inside the repos of modules at `planned` or later. Do not edit other repos without the override
- Update progress.json after every phase transition with `haren track status`
- Append to FEEDBACK.md when you encounter framework friction
- Validate artifacts before phase transitions (validate-artifact/ skill)
