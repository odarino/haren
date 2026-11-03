---
module: visual-companion
date: 2026-11-03
design: artifacts/04-plans/visual-companion/design.md
---

# Visual Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `haren companion` (an interactive browser companion for visual questions, ported from the superpowers visual companion to Bun), a `ui.mockups` mode (ask | ascii | browser), and the `visual-companion` and `ui-review` skills wired into plan, ideate, discover and evaluate.

**Architecture:** A Bun HTTP+WebSocket server in `apps/cli/src/companion/` serves the newest HTML file of a session folder, wrapped in a ported frame template, and records browser clicks to a JSONL events file. CLI commands start/stop it in the background. Skills decide per question whether to use the browser, and always keep ASCII in `design.md`.

**Tech Stack:** Bun (`Bun.serve`, WebSocket, `Bun.spawn`), TypeScript, `bun:test`. Package `apps/cli`.

## Global Constraints

- Reference implementation (read it, port behavior and CSS class names): `~/.claude/plugins/cache/superpowers-marketplace/superpowers/6.2.0/skills/brainstorming/` — `visual-companion.md`, `scripts/server.cjs`, `scripts/frame-template.html`, `scripts/helper.js`, `scripts/start-server.sh`, `scripts/stop-server.sh`. MIT, Copyright (c) 2025 Jesse Vincent — keep the notice (Task 1).
- Session dir: `<harenDir>/.companion/<pid>-<epoch>/content/` and `.../state/` (`server-info`, `events`, `server-stopped`).
- Startup JSON (exact keys): `{"type":"server-started","port":<n>,"url":"http://<url-host>:<port>/?key=<key>","screen_dir":"<abs>","state_dir":"<abs>"}`.
- Defaults: host `127.0.0.1`, url-host `localhost`, idle timeout 240 minutes.
- Events line format: `{"type":"click","choice":"<id>","text":"<label>","timestamp":<unix seconds>}`.
- `ui.mockups` values (exact): `ask`, `ascii`, `browser`. Missing block = `ask`.
- No Node-only dependencies. No new npm packages.
- No client names anywhere. No Co-Authored-By or other trailers in commit messages.
- Edit haren content only in `content/`; then `bun apps/cli/src/index.ts upgrade --haren-dir .haren-dev --yes` and `bun apps/cli/src/index.ts track check --haren-dir .haren-dev` must PASS.
- Code outside `.haren-dev/` needs the dogfood gate override (controller turns it on).
- Tests: `bun test` from `apps/cli`; `bunx tsc --noEmit -p apps/cli` clean; Prettier 2-space; skill text in ASD-STE100 simplified English.

---

### Task 0: Migration skill notes from the step-4 retest

**Files:**
- Modify: `content/skills/extract/SKILL.md`, `content/skills/discover/migration.md`, `content/skills/resolve-next-id/SKILL.md`, `apps/cli/src/workspace/manifest.ts` (migration scaffold comment), `apps/cli/src/__tests__/content/content.test.ts`, `apps/cli/src/__tests__/workspace/manifest.test.ts`

- [ ] **Step 1: Failing tests:** content test asserts extract and discover/migration.md say repo paths in manifest.yaml are relative to the haren folder; resolve-next-id lists formats `UNITSPEC-<unit>` (unit spec) and `LSEM-NNN` (legacy semantics); discover/migration.md names the installed copy `<haren>/.plugins/<adapter>/` + `adapter.semantics` path. Manifest test asserts the migration scaffold comment says paths are relative to the haren folder.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Edit: (a) extract + migration.md: "Resolve repo paths in manifest.yaml from the haren folder, not from the workspace root." and the manifest scaffold comment "# repo paths are relative to this folder"; (b) resolve-next-id: add rows for `unit-spec` → `UNITSPEC-<unit>` (one per unit, no number) and `legacy-semantics` → `LSEM-NNN`; extract + migration.md use those IDs; (c) migration.md semantics copy step: copy from `<haren>/.plugins/<adapter>/<adapter.semantics>` (the installed plugin), not from the adapter source folder.
- [ ] **Step 4:** Run → PASS; upgrade `.haren-dev`; `track check` PASS.
- [ ] **Step 5: Commit** `fix(content): repo path base, unit-spec ids, installed semantics path`.

---

### Task 1: Companion server core

**Files:**
- Create: `apps/cli/src/companion/server.ts`, `apps/cli/src/companion/frame-template.html`, `apps/cli/src/companion/helper.js`, `apps/cli/src/companion/NOTICE`
- Test: `apps/cli/src/__tests__/companion/server.test.ts`

**Interfaces:**
- Produces:

```ts
export interface CompanionOptions {
  sessionDir: string;          // contains content/ and state/ (created if missing)
  host?: string;               // default "127.0.0.1"
  urlHost?: string;            // default "localhost"
  port?: number;               // 0 = random
  key?: string;                // default random 32 hex chars
  idleTimeoutMs?: number;      // default 240 * 60_000
}
export interface CompanionInfo {
  type: "server-started"; port: number; url: string; screen_dir: string; state_dir: string;
}
export interface CompanionHandle { info: CompanionInfo; stop(reason?: string): Promise<void> }
export async function startCompanion(opts: CompanionOptions): Promise<CompanionHandle>;
export function isFullDocument(html: string): boolean; // starts with <!DOCTYPE or <html (case-insensitive, after whitespace)
export function newestScreen(contentDir: string): string | null; // newest *.html by mtime
```

Behavior (port from `server.cjs`, adapt to Bun):
- `startCompanion` writes `state/server-info` (the info JSON) and removes a stale `state/server-stopped`.
- `GET /` (key required): newest screen; fragment → inserted into the frame template (template has a marker where content goes; keep superpowers' marker approach); full document → served with helper `<script>` injected before `</body>` (or appended). No screen yet → a waiting page from the template.
- Key check: `?key=` query or `companion_key` cookie. A request with a valid query key gets `Set-Cookie: companion_key=<key>; HttpOnly; SameSite=Strict; Path=/`. Missing/invalid → 403.
- `GET /files/<name>`: only files whose realpath is inside `content/`; else 404.
- `GET /helper.js` serves the helper (key required).
- WebSocket at `/ws` (key required): server polls `content/` (fs.watch or 500 ms poll) and sends `{"type":"reload"}` when the newest file changes; on a new newest file, truncate `state/events`. Client message `{"type":"click","choice","text"}` → append events line with `timestamp`.
- Idle: any HTTP/WS activity resets the timer; on timeout write `state/server-stopped` (`{"reason":"idle"}`) and stop.
- `stop()` writes `state/server-stopped` with the reason and closes the server.
- Template/helper: copy from superpowers, keep every class listed in the design (`options`, `option`, `letter`, `content`, `data-multiselect`, `cards`, `card`, `card-image`, `card-body`, `mockup`, `mockup-header`, `mockup-body`, `split`, `pros-cons`, `mock-nav`, `mock-sidebar`, `mock-content`, `mock-button`, `mock-input`, `placeholder`, `subtitle`, `section`, `label`) and `toggleSelect(el)`. Change the helper's WebSocket URL to `/ws?key=<key>` (server injects the key). Keep the paused overlay on disconnect + auto reconnect. Add CSS for `.compare` (two panes + `.pass`/`.fail` buttons calling `toggleSelect`-style click that sends choice `pass`/`fail`) and `.findings` (`.blocker`, `.major`, `.minor` colored items). Rebrand the header text to "haren companion".
- `NOTICE`: "Portions (frame-template.html, helper.js, server behavior) are adapted from superpowers by Jesse Vincent, MIT License, Copyright (c) 2025 Jesse Vincent." followed by the full MIT license text copied from the superpowers LICENSE file.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, afterEach } from "bun:test";
import { mkdtemp, writeFile, readFile, rm, utimes } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { startCompanion, isFullDocument, newestScreen, type CompanionHandle } from "../../companion/server";

let dir: string; let h: CompanionHandle | null = null;
const setup = async (o: Record<string, unknown> = {}) => {
  dir = await mkdtemp(join(tmpdir(), "companion-"));
  h = await startCompanion({ sessionDir: dir, port: 0, key: "k123", ...o });
  return h;
};
afterEach(async () => { await h?.stop("test"); h = null; await rm(dir, { recursive: true, force: true }); });
const base = () => `http://127.0.0.1:${h!.info.port}`;

describe("companion server", () => {
  it("writes server-info with the exact keys", async () => {
    await setup();
    const info = JSON.parse(await readFile(join(dir, "state", "server-info"), "utf-8"));
    expect(Object.keys(info).sort()).toEqual(["port", "screen_dir", "state_dir", "type", "url"]);
    expect(info.url).toBe(`http://localhost:${info.port}/?key=k123`);
  });
  it("rejects requests without the key", async () => {
    await setup();
    expect((await fetch(`${base()}/`)).status).toBe(403);
    expect((await fetch(`${base()}/?key=bad`)).status).toBe(403);
  });
  it("sets a cookie and accepts it", async () => {
    await setup();
    const r = await fetch(`${base()}/?key=k123`);
    const cookie = r.headers.get("set-cookie")!;
    expect(cookie).toContain("companion_key=k123");
    expect((await fetch(`${base()}/`, { headers: { cookie: "companion_key=k123" } })).status).toBe(200);
  });
  it("wraps a fragment in the frame and serves the newest file", async () => {
    await setup();
    await writeFile(join(dir, "content", "a.html"), "<h2>First</h2>");
    await writeFile(join(dir, "content", "b.html"), "<h2>Second</h2>");
    await utimes(join(dir, "content", "a.html"), new Date(1000), new Date(1000));
    const body = await (await fetch(`${base()}/?key=k123`)).text();
    expect(body).toContain("<h2>Second</h2>");
    expect(body).toContain("haren companion");
    expect(body).toContain("helper.js");
  });
  it("serves a full document with the helper injected", async () => {
    await setup();
    await writeFile(join(dir, "content", "full.html"), "<!DOCTYPE html><html><body><p>X</p></body></html>");
    const body = await (await fetch(`${base()}/?key=k123`)).text();
    expect(body).toContain("<p>X</p>");
    expect(body).toContain("helper.js");
    expect(body).not.toContain("haren companion</");
  });
  it("blocks path traversal under /files", async () => {
    await setup();
    await writeFile(join(dir, "secret.txt"), "s");
    expect((await fetch(`${base()}/files/..%2Fsecret.txt?key=k123`)).status).toBe(404);
    await writeFile(join(dir, "content", "img.txt"), "ok");
    expect((await fetch(`${base()}/files/img.txt?key=k123`)).status).toBe(200);
  });
  it("records clicks and clears events on a new screen", async () => {
    await setup();
    await writeFile(join(dir, "content", "a.html"), "<p>a</p>");
    const ws = new WebSocket(`ws://127.0.0.1:${h!.info.port}/ws?key=k123`);
    await new Promise((r) => (ws.onopen = r));
    ws.send(JSON.stringify({ type: "click", choice: "b", text: "Option B" }));
    await Bun.sleep(200);
    const line = JSON.parse((await readFile(join(dir, "state", "events"), "utf-8")).trim());
    expect(line).toMatchObject({ type: "click", choice: "b", text: "Option B" });
    expect(typeof line.timestamp).toBe("number");
    await writeFile(join(dir, "content", "b.html"), "<p>b</p>");
    await Bun.sleep(1200);
    expect((await readFile(join(dir, "state", "events"), "utf-8")).trim()).toBe("");
    ws.close();
  });
  it("rejects a WebSocket without the key", async () => {
    await setup();
    const ws = new WebSocket(`ws://127.0.0.1:${h!.info.port}/ws`);
    const closed = await new Promise<boolean>((r) => { ws.onerror = () => r(true); ws.onclose = () => r(true); ws.onopen = () => r(false); });
    expect(closed).toBe(true);
  });
  it("stops after the idle timeout and writes server-stopped", async () => {
    await setup({ idleTimeoutMs: 300 });
    await Bun.sleep(700);
    expect(existsSync(join(dir, "state", "server-stopped"))).toBe(true);
    h = null;
  });
  it("detects full documents and the newest screen", async () => {
    expect(isFullDocument("  <!doctype html><p>")).toBe(true);
    expect(isFullDocument("<html>")).toBe(true);
    expect(isFullDocument("<h2>x</h2>")).toBe(false);
    dir = await mkdtemp(join(tmpdir(), "companion-"));
    expect(newestScreen(dir)).toBeNull();
  });
});
```

- [ ] **Step 2:** Run `bun test src/__tests__/companion/server.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `server.ts`, copy+adapt template/helper, write NOTICE (behavior above). Load template/helper with `Bun.file(new URL("./frame-template.html", import.meta.url))` so they work from source; check `apps/cli` build/publish config (package.json `files`, any bundling script) includes `src/companion/*.html|*.js|NOTICE` — add them if needed.
- [ ] **Step 4:** Run tests → PASS; `bunx tsc --noEmit -p apps/cli` clean.
- [ ] **Step 5: Commit** `feat(cli): companion server ported from superpowers visual companion`.

---

### Task 2: `haren companion start|status|stop`

**Files:**
- Create: `apps/cli/src/commands/companion.ts`
- Modify: `apps/cli/src/index.ts` (parse + dispatch `companion`, help text), `apps/cli/src/commands/init.ts:333-334` (haren-folder `.gitignore` gets `.companion/`), upgrade path that refreshes root files (add `.companion/` to an existing haren `.gitignore` if missing — find where upgrade handles `.gitignore`/root files)
- Test: `apps/cli/src/__tests__/commands/companion.test.ts`

**Interfaces:**
- Consumes: `startCompanion`, `CompanionInfo` (Task 1); `resolveHarenDir`, `harenDirFlag` (`workspace/resolve.ts`).
- Produces: `companion(args: string[], cwd?: string): Promise<void>`; `latestSession(harenDir): { dir: string; info: CompanionInfo | null; running: boolean } | null`; hidden subcommand `companion __serve --session <dir> [--port n] [--key k] [--host h] [--url-host u] [--idle-timeout-minutes m] [--open]` used by the detached child.

Behavior:
- `start`: resolve haren dir; pick port: if a previous session's `server-info` exists, reuse its port (if free), else 0. Create `<harenDir>/.companion/<pid>-<epoch>/`. Default: spawn detached child `process.execPath <cli entry> companion __serve ...` with `Bun.spawn({ stdio: ["ignore","ignore","ignore"], detached: true })` + `unref()`, then poll `state/server-info` up to 5 s and print it (single JSON line). `--foreground`: run `__serve` in-process and block. Also store the child pid in `state/pid`.
- `--open`: the server opens the browser (`open` on macOS, `xdg-open` on Linux, `cmd /c start` on Windows) the first time a screen file appears; failures are ignored.
- `running` = `server-info` exists, `server-stopped` absent, and pid alive (`process.kill(pid, 0)`).
- `status`: prints `running <url>\nscreen_dir <path>\nstate_dir <path>` exit 0, or `stopped` exit 1 (throw an error with exit code 1 via the existing `ExitCode` error class in index.ts, or return a non-zero exit as other commands do).
- `stop`: kill the pid (SIGTERM), write `server-stopped` (`{"reason":"stop"}`) if missing, print `stopped`. Session files stay.

- [ ] **Step 1: Failing tests** (temp workspace with a haren dir: `manifest.yaml` with `haren:\n  version: "1.5.0"\n`, empty `progress.json` `{"project":"t","version":3,"modules":{},"dependencies":{}}`):

```ts
it("starts in the background, reports status, stops", async () => {
  await companion(["start"], root);                 // prints JSON
  const s = latestSession(harenDir)!;
  expect(s.running).toBe(true);
  const r = await fetch(s.info!.url);               // url has key
  expect(r.status).toBe(200);
  await companion(["status"], root);                // no throw
  await companion(["stop"], root);
  expect(latestSession(harenDir)!.running).toBe(false);
  await expect(companion(["status"], root)).rejects.toThrow();
});
it("reuses the previous port on restart", async () => {
  await companion(["start"], root);
  const p1 = latestSession(harenDir)!.info!.port;
  await companion(["stop"], root);
  await companion(["start"], root);
  expect(latestSession(harenDir)!.info!.port).toBe(p1);
  await companion(["stop"], root);
});
it("init writes .companion/ into the haren .gitignore", async () => { /* run init helper used in init tests, assert .gitignore contains ".companion/" */ });
it("is wired in the CLI", () => {
  expect(parseArgs(["companion", "start"])).toEqual({ command: "companion", args: ["start"] });
});
```

Write the init test fully using the same helpers as `__tests__/commands/init.test.ts`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run tests (ensure every test stops its server in `afterEach`) → PASS.
- [ ] **Step 5: Commit** `feat(cli): haren companion start, status and stop`.

---

### Task 3: `ui.mockups` mode and `haren track ui-mode`

**Files:**
- Modify: `apps/cli/src/workspace/manifest.ts` (add `readUiMode`, `setUiModeText`), `apps/cli/src/commands/init.ts` (manifest scaffold writes `ui:\n  mockups: ask   # ask | ascii | browser\n`), `apps/cli/src/commands/track.ts` (`ui-mode` subcommand + usage), `apps/cli/src/workspace/events.ts` (event type `ui-mode` if types are enforced), `apps/cli/src/index.ts` help
- Test: `apps/cli/src/__tests__/workspace/manifest.test.ts`, `apps/cli/src/__tests__/commands/track.test.ts`

**Interfaces:**
- Produces:

```ts
export type UiMode = "ask" | "ascii" | "browser";
export const UI_MODES: UiMode[] = ["ask", "ascii", "browser"];
export function readUiMode(m: Manifest): UiMode;            // missing/invalid → "ask"
export function setUiModeText(text: string, mode: UiMode): string; // replace or append top-level ui block, keep other text
```

- [ ] **Step 1: Failing tests**

```ts
it("reads ui mode with ask as default", () => {
  expect(readUiMode(parseManifest("haren:\n  version: 1\n"))).toBe("ask");
  expect(readUiMode(parseManifest("ui:\n  mockups: browser\n"))).toBe("browser");
  expect(readUiMode(parseManifest("ui:\n  mockups: nope\n"))).toBe("ask");
});
it("sets ui mode and keeps comments", () => {
  const src = "# top comment\nharen:\n  version: 1\nrepos: {}\n";
  const out = setUiModeText(src, "ascii");
  expect(out).toContain("# top comment");
  expect(readUiMode(parseManifest(out))).toBe("ascii");
  expect(readUiMode(parseManifest(setUiModeText(out, "browser")))).toBe("browser");
});
// track.test.ts
it("haren track ui-mode writes the manifest and an event", async () => {
  await run("ui-mode", "browser");
  expect(await readFile(join(harenDir, "manifest.yaml"), "utf-8")).toContain("mockups: browser");
  expect((await events()).at(-1)).toMatchObject({ type: "ui-mode", mode: "browser" });
  await expect(run("ui-mode", "fancy")).rejects.toThrow(/ask, ascii, browser/);
});
```

Add an init test: a fresh init manifest contains `mockups: ask`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement (`setUiModeText` uses the existing `replaceTopLevelBlock(text, "ui", "ui:\n  mockups: <mode>\n")`; append the block if missing).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(cli): ui.mockups mode and haren track ui-mode`.

---

### Task 4: Skills `visual-companion` and `ui-review`

**Files:**
- Create: `content/skills/visual-companion/SKILL.md`, `content/skills/ui-review/SKILL.md`
- Modify: skill registration lists if the CLI copies skills by an explicit list (check `apps/cli/src/workspace/root-files.ts` and `init.ts` for the skill list and the skill.md "Available Actions" table — add both), `apps/cli/src/__tests__/content/content.test.ts`

Content requirements:
- `visual-companion/SKILL.md` (frontmatter `name: visual-companion`, `description: Show mockups, layout options and diagrams in a browser tab and read the user's clicks`, `type: utility`): a haren port of superpowers `visual-companion.md`, with these sections and exact commands:
  - When to use (per-question test; browser for mockups, wireframes, layout comparisons, diagrams, side-by-side; terminal for requirements, conceptual A/B/C, tradeoffs, technical decisions, clarifying questions; "a question about a UI topic is not automatically a visual question").
  - Mode: read `ui.mockups` in manifest.yaml. `ascii` → never use the browser. `browser` → use it for visual questions without asking. `ask` → the first visual question in a session: send the offer as its own message, with nothing else: "This next part is easier to show than to describe. I can open a browser tab with mockups and options. Choose: (1) this time, (2) always, (3) no, use ASCII." On (2) run `haren track ui-mode browser`; on (3) ask "Always use ASCII?" and if yes run `haren track ui-mode ascii`.
  - Start: `haren companion start --open`; save `screen_dir`, `state_dir`; give the full URL with `?key=` (never strip it). Windows / hosts that reap background processes: `haren companion start --open --foreground` in a background shell.
  - The loop: (1) `haren companion status` before every push; restart with `haren companion start --open` if stopped (same port, the tab reconnects); (2) write a new file with a semantic name in `screen_dir` with the file tool, never reuse a name, versions `layout-v2.html`; (3) remind the URL, summarize the screen, ask the user to answer in the terminal, end the turn; (4) next turn read `state_dir/events` (JSONL; last click is usually the choice; no file = no clicks) and merge with the terminal message (terminal is primary); (5) iterate or advance; (6) push `waiting.html` (`<div style="display:flex;align-items:center;justify-content:center;min-height:60vh"><p class="subtitle">Continuing in terminal...</p></div>`) when the next step is text.
  - Content fragments vs full documents; minimal example (options A/B); CSS classes reference (all classes from Task 1 including `.compare` and `.findings` with markup examples); events format; design tips (2-4 options, fidelity matches the question, explain the question on each page, real content when it matters); file naming; cleanup `haren companion stop`.
  - Durable record rule: the chosen option is always also written as ASCII into the artifact (design.md / review).
  - Attribution line at the end: "Adapted from the superpowers visual companion (MIT)."
- `ui-review/SKILL.md` (frontmatter `name: ui-review`, `description: Review a screen mockup or screenshot against UX heuristics and report findings by severity`, `type: utility`): inputs (chosen mockup or screenshot, spec stories for the screen); checklist exactly: states (empty, loading, error, success, no permission), accessibility (text contrast, focus and tab order, labels and alt text, touch target size), navigation (exit, back, breadcrumb or location), consistency (other screens, design system if any), content (clear labels, error messages say how to fix), responsive (narrow and wide); output table `| ID | Screen | Heuristic | Severity | Finding | Fix |` with severity `blocker | major | minor`; where it goes (plan → `## UI Review` in design.md, evaluate → review file); browser mode also push a `.findings` screen; rule: a blocker must be fixed in the mockup or accepted by the user (record "accepted by user" in the Fix column) before the module goes to `planned`.
- Both in ASD-STE100. No client names.

- [ ] **Step 1: Failing content tests**

```ts
it("ships the visual-companion and ui-review skills", async () => {
  const vc = await Bun.file(join(CONTENT, "skills/visual-companion/SKILL.md")).text();
  expect(vc).toContain("name: visual-companion");
  for (const s of ["haren companion start --open", "haren companion status", "haren track ui-mode browser", "state_dir/events", "waiting.html", "?key="]) expect(vc).toContain(s);
  const ur = await Bun.file(join(CONTENT, "skills/ui-review/SKILL.md")).text();
  expect(ur).toContain("name: ui-review");
  for (const s of ["blocker", "major", "minor", "## UI Review", "empty", "loading", "contrast"]) expect(ur).toContain(s);
});
```

(Use the same `CONTENT` path constant as existing content tests.)
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Write both skills; register them where skills are listed.
- [ ] **Step 4:** Run → PASS; upgrade `.haren-dev`; `track check` PASS.
- [ ] **Step 5: Commit** `feat(content): visual-companion and ui-review skills`.

---

### Task 5: Wire modes into existing skills

**Files:**
- Modify: `content/skills/generate-mockup/SKILL.md`, `content/skills/plan/SKILL.md` (UI decision gathering + Step 6 design list + Rules), `content/skills/ideate/SKILL.md`, `content/skills/discover/SKILL.md`, `content/skills/evaluate/SKILL.md` (Screens check), `content/skills/read-context/SKILL.md`, `content/skills/validate-artifact/SKILL.md` (Design rules), `content/templates/design.md` (add `## UI Review` section after `## Screens`), `apps/cli/src/commands/init.ts` skill.md (mention ui mode in session start), `apps/cli/src/__tests__/content/content.test.ts`

Content requirements:
- generate-mockup: new "Mode" section — read `ui.mockups`; `ascii`: current behavior; `browser`: write the ASCII wireframes into design.md as before AND push one options screen (`.options` or `.cards` with a `.mockup` per option, HTML mock elements) via the visual-companion skill; `ask`: follow the visual-companion offer. Remove the old step that writes a static `artifacts/04-plans/{module}/mockups/{screen-slug}.html` file and the matching rule line.
- plan: UI decisions step — read `ui.mockups`; browser path: push options per screen, read the click from `state_dir/events`, confirm the choice with the user in the terminal, record it in `## Screens`; after the choice run the `ui-review` skill on the chosen option and write `## UI Review`; blockers fixed or accepted before `planned`. Add to the design list in Step 6: `**UI Review**` (if screens). Rules: "Never skip the UI review for a changed screen."
- ideate and discover: "For a visual question (screen flow, layout, diagram), use the visual-companion skill. Decide per question."
- evaluate: Screens check — browser mode: push one `.compare` screen per changed screen (chosen mockup | screenshot) and read pass/fail clicks, confirm in terminal; ascii mode: current behavior; both: run `ui-review` on each screenshot and add findings to the review.
- read-context: report the ui mode (`ui.mockups`, default ask).
- validate-artifact (Design): if the design has `## Screens`, it must have `## UI Review` with no open blocker (a blocker row must have a fix or "accepted by user").
- design template: `## UI Review` with the findings table header from Task 4.
- init.ts skill.md: in session start or available actions, one line: "Visual questions follow the ui mode in manifest.yaml (`ui.mockups`: ask | ascii | browser). See the visual-companion skill."

- [ ] **Step 1: Failing content tests**

```ts
it("wires ui modes into plan, generate-mockup, evaluate and validate-artifact", async () => {
  const read = (p: string) => Bun.file(join(CONTENT, p)).text();
  const gm = await read("skills/generate-mockup/SKILL.md");
  expect(gm).toContain("ui.mockups");
  expect(gm).not.toContain("mockups/{screen-slug}.html");
  const plan = await read("skills/plan/SKILL.md");
  for (const s of ["ui.mockups", "ui-review", "## UI Review"]) expect(plan).toContain(s);
  const ev = await read("skills/evaluate/SKILL.md");
  for (const s of [".compare", "ui-review"]) expect(ev).toContain(s);
  expect(await read("skills/validate-artifact/SKILL.md")).toContain("## UI Review");
  expect(await read("templates/design.md")).toContain("## UI Review");
  expect(await read("skills/ideate/SKILL.md")).toContain("visual-companion");
  expect(await read("skills/discover/SKILL.md")).toContain("visual-companion");
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Edit the files.
- [ ] **Step 4:** Run → PASS; full `bun test`; upgrade `.haren-dev`; `track check` PASS.
- [ ] **Step 5: Commit** `feat(content): ui modes in plan, mockups, evaluate and validation`.

---

### Task 6: Docs and agent verification

**Files:**
- Modify: `README.md`, `README.vi.md` (section "Visual companion": modes, commands, security notes — key in URL, localhost bind, `.companion/` gitignored; credit to superpowers), `apps/cli/package.json` version → `1.6.0`

- [ ] **Step 1:** Update docs and version (and any test that pins the version).
- [ ] **Step 2:** Agent verification with the `verify-with-agent` skill (`.claude/skills/verify-with-agent/SKILL.md`): temp workspace (`haren init`, mode inherit or blueprint), `haren track ui-mode browser`, one module at `decomposed` with a spec that has one screen. Run `claude -p --model sonnet` with "plan module <m>" (accept recommended technical options). Check: agent runs `haren companion start`, writes an options screen into `screen_dir`, ends the turn asking for a choice. Then simulate a click by appending `{"type":"click","choice":"b","text":"Option B","timestamp":1}` to `state_dir/events` and continue the session with "I picked B" — check the design gets `## Screens` with B and a `## UI Review`. Stop the companion after. Record results; if `claude` CLI is unavailable, report BLOCKED for this step only.
- [ ] **Step 3:** Full `bun test`, tsc, scrub check; commit `docs: visual companion and ui-review; release 1.6.0`. Do not tag or publish.

---

## Self-Review

- Spec coverage: server behavior (T1), CLI start/status/stop + port reuse + detach + `--open` + gitignore (T2), `ui` block + `track ui-mode` + init default + read-context (T3, T5), visual-companion + ui-review skills (T4), generate-mockup/plan/ideate/discover/evaluate/validate-artifact/template (T5), NOTICE (T1), docs + agent run (T6). Out of scope items not planned.
- Names used across tasks: `startCompanion`, `CompanionInfo`, `CompanionHandle`, `isFullDocument`, `newestScreen`, `companion`, `latestSession`, `UiMode`, `UI_MODES`, `readUiMode`, `setUiModeText`.
