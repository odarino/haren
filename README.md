```
 ██╗  ██╗  █████╗  ██████╗  ███████╗ ███╗   ██╗
 ██║  ██║ ██╔══██╗ ██╔══██╗ ██╔════╝ ████╗  ██║
 ███████║ ███████║ ██████╔╝ █████╗   ██╔██╗ ██║
 ██╔══██║ ██╔══██║ ██╔══██╗ ██╔══╝   ██║╚██╗██║
 ██║  ██║ ██║  ██║ ██║  ██║ ███████╗ ██║ ╚████║
 ╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚══════╝ ╚═╝  ╚═══╝
        agentic SDLC framework · brainstorm → plan → build
```

# haren

> Minimal, skill-based agentic SDLC framework.

`haren` scaffolds a structured workspace — agents, skills, templates, and an
auto-managed state file — that drives an AI coding agent (Claude Code or Cursor)
through a disciplined software-development lifecycle:

```
research → discover → decompose → plan → implement → evaluate
```

Instead of letting an LLM jump straight to code, haren enforces a phased
workflow: brainstorm and research first, decompose into modules, write a plan,
*then* implement. The result is fewer wasted tokens, fewer half-built features,
and a paper trail of decisions you can actually review.

---

## Why

LLM coding agents are eager. Ask for a feature and they'll start writing files
before anyone has agreed on *what* is being built. haren adds the missing
front-half of the SDLC and **gates implementation behind planning** — a module
cannot be coded until it has reached `planned` status. The gate is enforced by a
hook, not just a prompt, so the discipline holds even when the model forgets.

Everything lives in a single haren folder (`haren/` by default) you can read, diff, and commit.

---

## Requirements

- **[Bun](https://bun.com) ≥ 1.2.21** — installed and on your `PATH`.
  haren runs on the Bun runtime; Node.js alone is not sufficient.
  The one-line installer below installs Bun for you if it is missing.
- An AI coding agent: **[Claude Code](https://claude.com/claude-code)** or
  **[Cursor](https://cursor.com)** (or both).

## Install

**macOS / Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/odarino/haren/main/install.sh | bash
```

**Windows (PowerShell)**

```powershell
irm https://raw.githubusercontent.com/odarino/haren/main/install.ps1 | iex
```

The script does these steps:

1. It installs Bun with the official Bun installer if Bun is missing. The Bun
   installer can add Bun to your shell profile or your user `PATH`.
2. It installs `@odarino/haren` with `bun add -g`.
3. If `haren` on your `PATH` is missing or is a different copy, it prints the
   line to add. It always runs the `haren` that Bun installed.
4. It asks for your workspace folder and runs `haren init --dir <folder>`.
   It does not use your home folder as the workspace.

Step 4 runs only when the script can ask you a question: it needs a terminal,
and `CI` must be empty, `false` or `0`. In other cases the script only installs
and prints the next step. These cases include CI and a script with redirected
input (for example `ssh host "..."` without `-t`).

Pin a version with `HAREN_VERSION`. The default is `latest`. The `1.2.0`
example works only after version 1.2.0 is published to npm.

```bash
curl -fsSL https://raw.githubusercontent.com/odarino/haren/main/install.sh | HAREN_VERSION=1.2.0 bash
```

```powershell
try { $env:HAREN_VERSION = '1.2.0'; irm https://raw.githubusercontent.com/odarino/haren/main/install.ps1 | iex } finally { Remove-Item Env:HAREN_VERSION }
```

The `finally` part clears the variable, also when the install fails. A later
install in the same PowerShell window then gets `latest` again.

After the release is tagged, you can also download the script from a release
tag, for example `.../haren/v1.2.0/install.sh`.

**With a package manager** (Bun must be installed):

```bash
npm install -g @odarino/haren
# or run without installing:
npx @odarino/haren init
```

---

## Quick start

```bash
cd your-project
haren init          # scaffold a haren folder (interactive)
```

`init` detects your layout (see [Layouts](#layouts)), asks a few questions
(project name, mode, language, editor), and shows a plan. After you confirm, it
creates the haren folder plus the editor config your agent reads on every
session. Then open the project (the workspace root) in your editor and run
`/haren-onboard`, or say:

> **"what's next?"**

The agent reads `skill.md` in the haren folder, orients itself from `manifest.yaml` and
`progress.json`, and guides you into the right phase.

---

## Plugins

Plugins connect other tools to the haren workflow. A plugin installs a tool, sets it up in the project, and reacts to haren hooks.

```bash
haren init --plugin backlog      # install during init
haren plugin add backlog         # install later
haren plugin list | remove <name> | doctor
```

Example: the `backlog` plugin syncs haren tasks with a Backlog.md board in `<haren folder>/backlog/`.

**In a team:** commit `plugins.json` and `.plugin-data/`. haren adds `.plugins/` (the fetched code) to `.gitignore`. A teammate clones the haren folder and runs `haren init` or `haren upgrade`. haren then installs each missing plugin again.

See [PLUGINS.md](PLUGINS.md) for the details, the backlog plugin, and how to write a plugin.

---

## Layouts

haren supports two project layouts. `haren init` detects which one you have.

**Monorepo** — one git repo. The haren folder lives inside it.

```
my-app/              (.git)
├── backend/
├── frontend/
├── haren/
├── CLAUDE.md        # generated, committed with the repo
└── .claude/
```

**Multi-repo workspace** — a plain folder (no `.git`) with several git repos.
haren is its own repo next to the code repos.

```
workspace/           (no .git)
├── backend/         (.git)
├── frontend/        (.git)
├── cmis_ai_rules/   (.git — the haren repo, any folder name)
├── CLAUDE.md        # generated per machine, not versioned
└── .claude/         # generated per machine, not versioned
```

The haren folder can have any name. haren finds it by the top-level `haren:`
marker in its `manifest.yaml`, not by its name. Open your editor at the
**workspace root** (the folder that holds all the repos), so one session sees
every repo.

---

## Commands

| Command | What it does |
|---------|--------------|
| `haren init` | Set up haren in the current directory: scaffold a new haren folder, or set up a cloned one. Interactive, or pass flags (below). |
| `haren upgrade` | Update framework files in an existing haren folder to the installed version, and migrate old `manifest.yaml` / `progress.json`. It also restores missing plugins from `plugins.json`. Use `--yes` to accept plugins from unofficial sources. |
| `haren plugin` | Manage plugins: `add <name\|source>`, `remove <name>`, `list`, `doctor`, `run <hook>`. See [PLUGINS.md](PLUGINS.md). |
| `haren agent` | Manage the local agent bridge *(experimental — for the in-progress Haren Portal)*. |

`haren agent` works in both layouts. It uses the git remote of the haren repo as
the Portal project key.

Run `haren` with no arguments for help.

### `init` flags (skip the prompts)

```bash
haren init \
  --project "my-app" \
  --mode blueprint \          # blueprint | explore | inherit | undecided
  --language English \
  --editor both \             # claude-code | cursor | both
  --iterations \              # enable iteration-based planning
  --duration "2 weeks" --start-date 2026-06-08 --demo-day Friday
```

Layout and folder flags:

| Flag | Effect |
|------|--------|
| `--dir <path>` | Run in this directory instead of the current one. |
| `--layout monorepo\|workspace` | Skip layout detection. |
| `--haren-dir <name>` | Name of the new haren folder (default `haren`). |
| `--yes` | Accept the defaults and skip the confirm prompt. Required when there is no terminal. |
| `--dry-run` | Print the plan and exit. Nothing is written. |
| `--plugin <name\|source>` | Install a plugin. Repeat the flag for more plugins. |
| `--force` | Re-scaffold an existing haren folder. It keeps the folder name, the layout, and the repos in `manifest.yaml`. |

### The plan preview

`init` writes nothing until you confirm. It prints a plan first:

```
Plan:
  /path/to/workspace/
  ├── cmis_ai_rules/         + create   (git init, own repo)
  │   ├── manifest.yaml      + create   layout: workspace
  │   ├── artifacts/         + create
  │   └── hooks/             + create
  ├── CLAUDE.md              + create   (generated, not versioned)
  ├── backend/               = keep
  └── frontend/              = keep

? Apply this plan? (Y)es / (n)o / (e)dit selection
```

Markers: `+` create, `~` modify, `=` keep, `↓` clone, `!` warning (for example a
folder that is not a git repo, or a repo with no remote to clone).

In a workspace, `init` runs `git init` in the new haren folder. It makes no
commit. The root files (`CLAUDE.md`, `.cursorrules`, `.claude/`, `.cursor/`) are
generated per machine and are not versioned. If you already have content in
`CLAUDE.md` or `.cursorrules`, haren keeps it. haren writes only between
`<!-- haren:begin -->` and `<!-- haren:end -->`.

### Set up a teammate

The haren repo is the source of truth. A teammate does not run a full init.

```bash
git clone <haren-repo-url> workspace/cmis_ai_rules
cd workspace/cmis_ai_rules
haren init
```

`init` finds the manifest, clones each missing repo from its `remote`, and
generates the root files in the parent folder. Then open the workspace root in
the editor and run `/haren-onboard`. If a clone fails, `init` continues with the
other repos, then exits with code 1. Run `haren init` again to retry only the
missing repos. If all is in place, `init` prints "Already set up".

### `/haren-onboard`

A skill for a new developer or a new workspace. It does three things:

1. **Analyze repos.** It reads the build files of each repo and proposes `stack`,
   `test_cmd`, `default_branch`, and `role`. It writes them to `manifest.yaml`
   only after you approve.
2. **Health check.** It reports repos that are missing, not git repos, dirty, or
   on a branch other than `default_branch`.
3. **Briefing.** It summarizes the current phase, the active modules, and the
   next step.

It never clones and never changes git state. To clone a missing repo, run
`haren init`.

---

## How it works

### Modes

You pick a mode at init that matches where your project stands:

| Mode | When |
|------|------|
| `blueprint` | Greenfield project that already has docs/specs to work from. |
| `explore` | Greenfield project starting from just an idea. |
| `inherit` | Brownfield project with an existing codebase. |
| `undecided` | Let the agent help you choose on first session. |

### Phases & the code gate

Each module progresses through phases **in order** — you can't skip ahead:

```
discovered → specified → planned → implementing → evaluating → completed
```

A `brainstorm-gate` hook blocks `Edit`/`Write` on any file **outside the haren folder**
until at least one module reaches `planned`. Discovery docs and specs are not
enough — planning must be done first. (Writes *inside* the haren folder are always
allowed so the planning phases can produce their artifacts.)

### Agents

haren ships role-specific agent definitions that your LLM adopts per phase —
including a **researcher**, **ideator**, **architect**, **planner**,
**developer**, **reviewer**, and **qa-engineer**. Each has a focused scope so the
model behaves like the right specialist at the right time.

### Skills

Skills are the procedures the agent follows — `discover` (brainstorming),
`research`, `decompose`, `plan`, `implement`, `evaluate`, `extract-stories`,
`generate-mockup`, and a set of artifact-management helpers
(`create-artifact`, `validate-artifact`, `search-artifact`, `update-tracking`,
and more).

### The haren folder

```
haren/                 # any folder name works
├── manifest.yaml      # project config (layout, repos, mode, language, sources)
├── progress.json      # auto-managed state — phases & module status
├── skill.md           # the LLM's operating manual (read every session)
├── FEEDBACK.md        # append-only log of framework friction
├── agents/            # agent role definitions
├── skills/            # phase + helper procedures
├── templates/         # artifact templates (spec, design, tasks, research, …)
├── hooks/             # brainstorm-gate.ts (the code gate)
└── artifacts/         # phase outputs, organised by stage
    ├── 00-baseline/   # input docs
    ├── 01-research/   ├── 02-discovery/   ├── 03-modules/
    ├── 04-plans/      ├── 05-implementation/   └── 06-evaluation/
```

### manifest.yaml

```yaml
haren:
  version: 1.2.0          # the marker; haren finds the folder by this key
layout: workspace         # monorepo | workspace
project: shop
mode: blueprint
language: English

repos:
  backend:
    path: ../backend      # relative to the haren folder
    remote: git@github.com:acme/shop-backend.git
    default_branch: main
    role: backend         # frontend | backend | e2e | other
    stack: node-express   # role, stack, test_cmd, default_branch: set by /haren-onboard
    test_cmd: bun test
  frontend:
    path: ../frontend
    remote: git@github.com:acme/shop-frontend.git
    default_branch: main
    role: frontend
```

In a monorepo, `remote` is empty and each `path` points inside the same repo.

### Git conventions

When a module touches code, haren follows these rules:

- A module uses the branch `feat/<module-slug>` in **every repo it touches**.
- Code is committed in each code repo. haren files (artifacts, session log,
  `progress.json`) are committed in the haren repo. In a monorepo, that is a
  second commit on the same branch.
- `progress.json` records `branch`, `repos`, and a `lastCommit` per repo key.
- haren never pushes and never opens a pull request unless you ask.

### E2E tests

The `qa-engineer` agent writes Playwright tests in the UI repo, which is the
`repos` entry with `role: frontend`. In a workspace, the tests live in
`<frontend repo>/e2e/<module>/`. In a monorepo, they live in `e2e/` at the repo
root.

### Editor integration

`init` wires up whichever editor(s) you choose:

- **Claude Code** → `CLAUDE.md` + `.claude/settings.json` (registers the gate as
  a `PreToolUse` hook).
- **Cursor** → `.cursorrules` + `.cursor/rules/haren.mdc` + `.cursor/hooks.json`
  (registers the gate via `beforeFileEdit`/`preToolUse`).

Both editors also get every haren skill and agent in their native folders:
`.claude/skills/haren-<skill>/`, `.claude/agents/haren-<agent>.md`, and the same
under `.cursor/`. The `haren-` prefix keeps them apart from your own skills and
agents (for example `/haren-plan`, agent `haren-developer`). `haren upgrade`
refreshes these copies from the haren folder.

These files go in the workspace root (the parent of the haren folder). Existing
config files are kept: haren writes only inside its marked block.

---

## Upgrading

```bash
cd your-workspace      # or the project root, or the haren folder itself
haren upgrade
```

This refreshes the agents, skills, templates, and the gate hook in the haren
folder to match the installed CLI version, leaving your artifacts untouched. It
also migrates an older project:

- `manifest.yaml` gets the `haren:` marker and `layout`. A `repos` list becomes
  a map with `remote` values.
- `progress.json` moves to version 2: `lastCommit` becomes one commit per repo.
- The root files (`CLAUDE.md`, `.claude/`, `.cursor/`, and so on) are
  regenerated.

Run `haren upgrade --dry-run` to see every step without writing anything. The
upgrade needs Bun ≥ 1.2.21.

---

## Credits

haren's workflow philosophy is heavily inspired by
**[Superpowers](https://github.com/obra/superpowers)** by Jesse Vincent — the
discipline of *brainstorm → write a plan → execute with fresh subagents → review*,
the test-driven and YAGNI-minded approach, and the idea of gating implementation
behind an approved design all trace back to that work. haren packages a similar
philosophy into a phased, artifact-driven SDLC for product teams. Many thanks.

---

## License

MIT — see [LICENSE](./LICENSE).
