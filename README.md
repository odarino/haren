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

Everything lives in a single `haren/` directory you can read, diff, and commit.

---

## Requirements

- **[Bun](https://bun.com) ≥ 1.2** — installed and on your `PATH`.
  haren runs on the Bun runtime; Node.js alone is not sufficient.
- An AI coding agent: **[Claude Code](https://claude.com/claude-code)** or
  **[Cursor](https://cursor.com)** (or both).

## Install

```bash
npm install -g @odarino/haren
# or run without installing:
npx @odarino/haren init
```

---

## Quick start

```bash
cd your-project
haren init          # scaffold a haren/ workspace (interactive)
```

`init` asks a few questions (project name, mode, language, editor) and creates a
`haren/` workspace plus the editor config your agent reads on every session.
Then open the project in your editor and say:

> **"what's next?"**

The agent reads `haren/skill.md`, orients itself from `manifest.yaml` and
`progress.json`, and guides you into the right phase.

---

## Commands

| Command | What it does |
|---------|--------------|
| `haren init` | Scaffold a new `haren/` workspace in the current directory. Interactive, or pass flags (below). |
| `haren upgrade` | Update framework files (agents, skills, templates) in an existing workspace to the installed version. |
| `haren agent` | Manage the local agent bridge *(experimental — for the in-progress Haren Portal)*. |

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

Re-running in an existing workspace requires `--force`.

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

A `brainstorm-gate` hook blocks `Edit`/`Write` on any file **outside `haren/`**
until at least one module reaches `planned`. Discovery docs and specs are not
enough — planning must be done first. (Writes *inside* `haren/` are always
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

### The workspace

```
haren/
├── manifest.yaml      # project config (mode, language, repos, sources)
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

### Editor integration

`init` wires up whichever editor(s) you choose:

- **Claude Code** → `CLAUDE.md` + `.claude/settings.json` (registers the gate as
  a `PreToolUse` hook).
- **Cursor** → `.cursorrules` + `.cursor/rules/haren.mdc` + `.cursor/hooks.json`
  (registers the gate via `beforeFileEdit`/`preToolUse`).

Existing config files are appended to, not overwritten.

---

## Upgrading

```bash
cd your-project
haren upgrade
```

This refreshes the agents, skills, and templates in `haren/` to match the
installed CLI version, leaving your artifacts and state untouched.

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
