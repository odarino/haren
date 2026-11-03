---
module: visual-companion
date: 2026-11-03
status: draft
---

# Design: visual companion and UI review

Give haren an interactive browser companion for visual questions (mockups, layout options, diagrams, mockup-vs-screenshot checks), modeled on the superpowers brainstorming visual companion, plus a UX heuristic review skill. The user chooses ASCII or browser mode.

Reference implementation: superpowers (MIT, Copyright (c) 2025 Jesse Vincent), `skills/brainstorming/visual-companion.md` and `skills/brainstorming/scripts/` (`server.cjs`, `frame-template.html`, `helper.js`, `start-server.sh`, `stop-server.sh`). Local copy: `~/.claude/plugins/cache/superpowers-marketplace/superpowers/6.2.0/skills/brainstorming/`.

## Architecture Overview

```
agent ── writes HTML fragment ──▶ <haren>/.companion/<session>/content/*.html
                                          │ newest by mtime
haren companion (Bun.serve) ◀─────────────┘
   │  wraps fragment in frame template, injects helper.js
   │  WebSocket: reload on new file; receive clicks
   ▼
browser (URL with ?key=…) ── clicks ──▶ state/events (JSONL) ──▶ agent reads next turn
```

- The server lives in the CLI (`apps/cli/src/companion/`), written in TypeScript on Bun. No Node dependency.
- Skills decide per question whether to use the browser or the terminal (superpowers rule).
- ASCII stays the durable record in `design.md`; HTML screens are the interactive layer.

## Existing Code

| Table / side effect | Existing writer or caller (file:line) | Verdict | Note |
|---|---|---|---|
| ASCII mockups + static HTML option file | `content/skills/generate-mockup/SKILL.md:35` | supersede | static HTML file replaced by companion screens in browser mode |
| UI decision gate in plan | `content/skills/plan/SKILL.md` (UI decisions) | extend | read `ui.mockups`, browser path, call ui-review |
| Screens check in evaluate | `content/skills/evaluate/SKILL.md:38` | extend | compare page + ui-review |
| manifest read/write | `apps/cli/src/workspace/manifest.ts` | extend | `ui.mockups` read + targeted write |
| tracking CLI | `apps/cli/src/commands/track.ts` | extend | `track ui-mode` |
| CLI dispatch | `apps/cli/src/index.ts` | extend | `companion` command |
| haren folder .gitignore | init/upgrade root files | extend | add `.companion/` |

## Data Model

```yaml
# manifest.yaml
ui:
  mockups: ask   # ask | ascii | browser
```

- Missing `ui` block = `ask`. Init writes `ask`. Upgrade does not add it.
- Session dir: `<haren>/.companion/<pid>-<epoch>/{content/, state/}`; `state/` holds `server-info` (startup JSON), `events` (JSONL, cleared on new screen), `server-stopped` (on shutdown).

### Owned (write)

`<haren>/.companion/**`, `manifest.yaml` (`ui.mockups` only, via CLI), `events/events.jsonl` (`ui-mode` event).

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|---|---|---|---|
| D1 Server location | `haren companion` in CLI, Bun | copy superpowers Node scripts into content | testable with bun test, Bun rule, works on Cursor and Claude Code |
| D2 Mode choice | manifest `ui.mockups` default `ask`, offer just-in-time, persist with `track ui-mode` | per-session only; manifest only | no repeated asking once decided; discoverable |
| D3 Scope | plan, ideate/discover, evaluate, new `ui-review` | plan+evaluate; plan only | user choice |
| D4 Durable record | ASCII always in design.md; HTML screens are interactive layer | HTML as record | git-friendly, readable in reviews |
| D5 License | port frame template/helper with MIT notice in `apps/cli/src/companion/NOTICE` | rewrite from scratch | keep look and class names identical to superpowers |

## CLI

```
haren companion start [--open] [--host 127.0.0.1] [--url-host localhost] [--idle-timeout-minutes 240] [--foreground]
haren companion status
haren companion stop
haren track ui-mode <ask|ascii|browser>
```

- `start` prints `{"type":"server-started","port","url","screen_dir","state_dir"}` and writes it to `state/server-info`. Default: detach to background; `--foreground` blocks (Windows, process-reaping hosts). Restart in the same workspace reuses the previous port. `--open` opens the browser when the first screen is pushed.
- `status` prints running/stopped + url + dirs; exit 0 running, 1 not running.
- `stop` stops the server of this workspace; session files stay.

## Server behavior

- Serves the newest `.html` in `content/` by mtime. Fragment (not starting with `<!DOCTYPE`/`<html`) → wrapped in frame template. Full document → helper script injected only.
- Session key: random, required on every HTTP and WebSocket request (query `?key=` first, then cookie set on first load). Missing/wrong key → 403.
- Bind `127.0.0.1` by default. `/files/<name>` serves only files inside `content/` (realpath check; traversal → 404).
- WebSocket: push `reload` when a new file appears; receive `{type:"click", choice, text}` and append to `state/events` with timestamp. New screen clears `events`.
- Idle timeout (default 240 min, no HTTP/WS activity) → write `server-stopped`, exit. Browser shows a paused overlay while disconnected and reconnects on restart.

## Frame template and helper

Port from superpowers with the same classes: `options`/`option`/`letter`/`content`, `data-multiselect`, `cards`/`card`/`card-image`/`card-body`, `mockup`/`mockup-header`/`mockup-body`, `split`, `pros-cons`, `mock-nav`, `mock-sidebar`, `mock-content`, `mock-button`, `mock-input`, `placeholder`, `subtitle`, `section`, `label`; `toggleSelect(el)`. Haren additions:

- `.compare` — two panes (mockup | screenshot) with Pass/Fail buttons that emit `{type:"click", choice:"pass"|"fail"}`.
- `.findings` — list with `.blocker`, `.major`, `.minor` items.

## Skills

- New `visual-companion` (haren port of `visual-companion.md`): when browser vs terminal; offer message (own message, options: this time / always / never; always/never → `haren track ui-mode browser|ascii`); the loop (status → new semantic file → remind URL + summary → end turn → read events + terminal → iterate → `waiting.html` when back to text); CSS reference; events format; design tips; cleanup.
- New `ui-review`: inputs chosen mockup or screenshot + spec. Checklist: states (empty, loading, error, success, permission), accessibility (contrast, focus/tab order, labels/alt, touch target), navigation (exit, back, breadcrumb), consistency (other screens, design system), content clarity (errors say how to fix), responsive. Output: findings table blocker/major/minor; plan → `design.md ## UI Review`, evaluate → review; browser mode also shows `.findings`. A blocker must be fixed in the mockup or accepted by the user before the module goes to `planned`.
- `generate-mockup`: ascii mode unchanged; browser mode → ASCII in design.md + options screen on companion; static HTML file removed.
- `plan`: UI decision step reads `ui.mockups` (ask → visual-companion offer); browser path takes the choice from events + terminal confirmation; then `ui-review` on the chosen option.
- `ideate`, `discover`: visual questions use visual-companion per-question rule.
- `evaluate`: browser mode → `.compare` page per changed screen, then `ui-review` on screenshots; ascii mode unchanged.
- `read-context`: show the ui mode. `validate-artifact`: design with screens needs `## UI Review` with no open blocker.

## Testing

- Companion: start/status/stop, key required (HTTP + WS), newest-file selection, fragment wrapping, full-document injection, events append + clear on new screen, `/files` traversal blocked, idle timeout (short timeout), port reuse on restart.
- `track ui-mode`: valid values, rejects others, keeps manifest comments, event emitted; missing `ui` block reads as `ask`.
- Content tests: new skills exist with frontmatter; plan/evaluate/generate-mockup mention both modes; validate-artifact UI Review rule.
- Agent run: `verify-with-agent` — plan a module with one screen in browser mode; agent starts companion, pushes options, reads the click.

## Scope

In: companion CLI + server + template/helper + NOTICE; `track ui-mode`; `ui` manifest block; `.companion/` gitignore; skills visual-companion and ui-review; updates to generate-mockup, plan, ideate, discover, evaluate, read-context, validate-artifact; docs (README, README.vi); tests.

Out: Figma integration; design-system-aware high-fidelity rendering; multi-user remote sessions.

## External Dependencies

- None new (Bun.serve, Bun WebSocket).
