/**
 * Templates for files haren generates. `{{harenDir}}` is the haren folder
 * path relative to the workspace root (for example `haren` or `haren-rules`).
 */
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

export const HAREN_DIR_TOKEN = "{{harenDir}}";

export function renderTemplate(template: string, harenDirName: string): string {
  return template.replaceAll(HAREN_DIR_TOKEN, harenDirName);
}

export function gateCommand(harenDirName: string): string {
  return `bun ${harenDirName}/hooks/brainstorm-gate.ts`;
}

export const editorConfigTemplate = `## Haren Framework

This workspace uses the Haren agentic SDLC framework.

**On every session start, you MUST:**
1. Read \`{{harenDir}}/skill.md\` — this is your operating manual
2. Follow its instructions for session orientation
3. Read \`{{harenDir}}/manifest.yaml\` and \`{{harenDir}}/progress.json\` before taking any action

All project documentation, specs, plans, and artifacts are managed inside \`{{harenDir}}/\`.
Write outside \`{{harenDir}}/\` only in the module's repos (see "Repos and Git" in \`{{harenDir}}/skill.md\`), only from the \`planned\` status on (implement phase) or when qa-engineer writes tests in \`$E2E\`. For a change the user explicitly asks for, use the gate override (see below).

## Brainstorming Gate

Before writing ANY code outside \`{{harenDir}}/\`:
1. Read \`{{harenDir}}/progress.json\` and \`{{harenDir}}/manifest.yaml\`
2. Write code only inside the repos of a module with status \`planned\`, \`implementing\`, \`evaluating\`, \`completed\`, or \`released\` (the module's \`repos\` keys in progress.json)
3. \`discovered\` and \`decomposed\` do NOT allow code. If no module is at \`planned\` or later, STOP and tell the user to run the plan phase.
4. Exception: the user explicitly asks for a change (for example a hotfix). Run \`haren track override on --reason "<what the user asked>"\`, make the change, then run \`haren track override off\`.

Design specs are written to Haren artifact folders, NOT to docs/superpowers/specs/.
`;

export const cursorRuleTemplate = `---
description: Haren agentic SDLC framework - project workflow and artifact management
globs:
  - {{harenDir}}/**
  - .cursorrules
alwaysApply: true
---

# Haren Framework — MANDATORY RULES

## RULE #1: NEVER WRITE WITHOUT ASKING (highest priority)

**You MUST ask the user questions and get answers BEFORE writing ANY artifact or code.**

This applies to ALL phases — planning, designing, implementing, everything.

**The process is ALWAYS:**
1. Read existing artifacts (spec.md, module.md, context-brief.md, architecture.md)
2. Identify unresolved decisions
3. **ASK the user one question at a time — present 2-3 options with trade-offs**
4. **WAIT for the user's answer**
5. Repeat until ALL decisions are resolved
6. **ONLY THEN write files**

**NEVER do this:**
- Write artifacts first, then say "let me know if you want changes" — WRONG
- Make assumptions about technical decisions — WRONG
- Dump all questions at once — WRONG, ask ONE at a time
- Skip asking because you think the answer is obvious — WRONG

**If you are about to call the write/edit tool and you have not asked the user any questions yet in this conversation, STOP. You are violating this rule.**

---

## RULE #2: Code Gate — code only in the repos of a \`planned\` module

**BEFORE writing ANY file outside \`{{harenDir}}/\`, read \`{{harenDir}}/progress.json\` and \`{{harenDir}}/manifest.yaml\`:**

1. Write code only inside the repos of a module with status \`planned\`, \`implementing\`, \`evaluating\`, \`completed\`, or \`released\`
2. \`discovered\` and \`decomposed\` do NOT allow code. Discovery docs and specs are NOT sufficient.
3. **If no such module owns the file → STOP. DO NOT WRITE CODE.**

**When blocked, respond ONLY with:**
- No modules: "No modules found. Run the discover phase first."
- No planned modules: "No module has reached 'planned' status yet. Run the plan phase first."

**Only exception:** the user explicitly asks for the change (for example a hotfix). Run \`haren track override on --reason "<what the user asked>"\`, make the change, then run \`haren track override off\`.

---

## On Every Session Start

1. Read \`{{harenDir}}/skill.md\` — this is your operating manual
2. Follow its instructions for session orientation
3. Read \`{{harenDir}}/manifest.yaml\` and \`{{harenDir}}/progress.json\` before taking any action

All project documentation, specs, plans, and artifacts are managed inside \`{{harenDir}}/\`.
Write outside \`{{harenDir}}/\` only in the module's repos (see "Repos and Git" in \`{{harenDir}}/skill.md\`), only from the \`planned\` status on (implement phase) or when qa-engineer writes tests in \`$E2E\`. For a change the user explicitly asks for, use the gate override (see below).

## Phase Progression (MANDATORY)

Modules MUST progress through phases in order. You CANNOT skip phases.

\`\`\`
discovered → decomposed → planned → implementing → evaluating → completed → released
\`\`\`

**Before taking ANY action on a module, read \`{{harenDir}}/progress.json\` and check the module's current status. Then follow the dispatch rules in \`{{harenDir}}/skill.md\`.**

Key dispatch rules:
- Module at \`decomposed\` → user says "plan" → you MUST run the \`plan/\` skill first (read \`{{harenDir}}/skills/plan/SKILL.md\`)
- Module at \`discovered\` or no module → user says "plan" or "build" → you MUST run \`discover/\` skill first (brainstorming)
- Module at \`planned\` → user says "implement" or "build" → proceed with implementation
- **You CANNOT jump from \`decomposed\` directly to \`implementing\`**
- **You CANNOT skip brainstorming/discovery for new features**

## Rules

- Always read progress.json before taking action
- Write outside \`{{harenDir}}/\` only in the module's repos (see "Repos and Git" in \`{{harenDir}}/skill.md\`), only from the \`planned\` status on (implement phase) or when qa-engineer writes tests in \`$E2E\`. For a change the user explicitly asks for, use the gate override (see below).
- Update progress.json after every phase transition
- Append to FEEDBACK.md when you encounter framework friction
`;

export const GATE_SCRIPT_PATH = "hooks/brainstorm-gate.ts";

/** Writes (or refreshes) the brainstorm gate hook in <harenDir>/hooks/. */
export async function writeGateScript(harenDir: string): Promise<void> {
  await mkdir(join(harenDir, "hooks"), { recursive: true });
  await writeFile(join(harenDir, GATE_SCRIPT_PATH), brainstormGateScript);
}

export const brainstormGateScript = `/**
 * Brainstorm Gate Hook
 * Blocks Edit/Write tool use outside the haren folder unless a module that
 * owns the target repo has reached 'planned' status (or later).
 * For shell commands (Bash) it only blocks writes into readOnly repos (best effort).
 *
 * Override (for a fix the user asked for): HAREN_GATE=off, or
 * progress.json "gateOverride": { "reason": "...", "until": "<ISO>" }
 * (set it with: haren track override on --reason "...").
 *
 * Works with both Claude Code and Cursor:
 * - Exit 0 = allow
 * - Exit 2 = block
 * - Other exit codes = hook failure, action proceeds (fail-open)
 */

import { existsSync, realpathSync } from "fs";
import { basename, dirname, join, resolve, sep } from "path";

// The hook lives in <harenDir>/hooks/, so the haren folder is one level up.
// This works for any folder name. Use the real path so symlinks compare equal.
const harenDir = realpathSync(resolve(import.meta.dir, ".."));
const workspaceDir = dirname(harenDir);

const IMPLEMENTABLE = ["planned", "implementing", "evaluating", "completed", "released"];
const OVERRIDE_HINT =
  "If the user explicitly asked for this change, run \`haren track override on --reason \\"...\\"\` (or set HAREN_GATE=off) and try again.";

// Editors send logical paths that can go through symlinks. Resolve the nearest
// existing ancestor to its real path, then add back the missing segments.
function realTarget(abs: string): string {
  const rest: string[] = [];
  let dir = abs;
  while (!existsSync(dir) && dirname(dir) !== dir) {
    rest.unshift(basename(dir));
    dir = dirname(dir);
  }
  try {
    return join(realpathSync(dir), ...rest);
  } catch {
    return abs;
  }
}

function inside(path: string, root: string): boolean {
  return path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);
}

function allow(): never {
  console.log(JSON.stringify({
    allow: true,           // Claude Code
    permission: "allow",   // Cursor
  }));
  process.exit(0);
}

function deny(message: string): never {
  console.log(JSON.stringify({
    error: message,            // Claude Code
    permission: "deny",        // Cursor
    user_message: message,     // Cursor — shown in UI
    agent_message: message,    // Cursor — sent to model
  }));
  process.exit(2);
}

interface Repo { path: string; role?: string; readOnly?: boolean }

// Same rules as the CLI: repos is a map key -> {path} | key -> string, or an array.
function normalizeRepos(repos: unknown): Record<string, Repo> {
  const out: Record<string, Repo> = {};
  if (Array.isArray(repos)) {
    for (const item of repos) {
      const path = typeof item === "string" ? item : item?.path;
      if (typeof path === "string" && path) out[basename(path)] = { path, role: item?.role, readOnly: item?.readOnly === true };
    }
  } else if (repos && typeof repos === "object") {
    for (const [key, value] of Object.entries(repos as Record<string, any>)) {
      if (typeof value === "string") out[key] = { path: value };
      else if (value && typeof value === "object" && typeof value.path === "string") {
        out[key] = { path: value.path, role: value.role, readOnly: value.readOnly === true };
      }
    }
  }
  return out;
}

async function readRepos(): Promise<Record<string, Repo>> {
  try {
    const file = Bun.file(join(harenDir, "manifest.yaml"));
    if (!(await file.exists())) return {};
    const data: any = Bun.YAML.parse(await file.text());
    return normalizeRepos(data?.repos);
  } catch {
    return {}; // fail-open: malformed manifest means no repo info
  }
}

function realRoot(path: string): string {
  return realTarget(resolve(harenDir, path));
}

function overrideActive(progress: any): boolean {
  if (process.env.HAREN_GATE === "off") return true;
  const o = progress?.gateOverride;
  if (!o || typeof o !== "object" || typeof o.reason !== "string") return false;
  if (o.until === undefined || o.until === null || o.until === "") return true;
  const until = Date.parse(o.until);
  return !Number.isNaN(until) && until > Date.now();
}

// --- Shell commands (Bash tool, Cursor beforeShellExecution) ---
// Best effort: only the readOnly repo check applies to shell commands. It looks
// for a write signal that touches a readOnly repo. A shell can always hide a write,
// so keep the legacy repo read-only at the filesystem or git level too.

const SHELL_SPLIT = /\\s*(?:&&|\\|\\||[;|\\n&])\\s*/;
const GIT_WRITES = ["commit", "add", "rm", "mv", "checkout", "reset", "apply", "am", "stash", "clean", "restore"];
const PKG_MANAGERS = ["npm", "bun", "pnpm", "yarn"];
const PLAIN_WRITERS = ["rm", "rmdir", "mv", "touch", "mkdir", "chmod", "chown", "ln", "truncate", "tee"];

function unquote(token: string): string {
  return token.replace(/^['"]|['"]$/g, "");
}

function tokens(segment: string): string[] {
  return (segment.match(/"[^"]*"|'[^']*'|\\S+/g) || []).map(unquote);
}

function makeRefersTo(roots: string[]) {
  const names = new Set(roots.map((root) => basename(root)));
  return (token: string, cwd: string): boolean => {
    if (!token || token.startsWith("-")) return false;
    const abs = realTarget(resolve(cwd, token));
    if (roots.some((root) => inside(abs, root))) return true;
    return token.split("/").some((part) => names.has(part));
  };
}

/** True when the command looks like it writes into one of the roots. */
function shellWritesTo(command: string, startCwd: string, roots: string[]): boolean {
  const refersTo = makeRefersTo(roots);
  let cwd = startCwd;
  let cwdInRoot = roots.some((root) => inside(realTarget(cwd), root));
  for (const segment of command.split(SHELL_SPLIT)) {
    // Redirections: > file, >> file, 2> file (not >&2).
    for (const m of segment.matchAll(/\\d*>>?\\s*("[^"]*"|'[^']*'|[^\\s;&|<>]+)/g)) {
      const target = unquote(m[1]);
      if (!target.startsWith("&") && refersTo(target, cwd)) return true;
    }
    let words = tokens(segment.replace(/\\d*>>?\\s*("[^"]*"|'[^']*'|[^\\s;&|<>]+)/g, " "));
    while (words.length && (/^\\w+=/.test(words[0]) || words[0] === "sudo" || words[0] === "env")) words = words.slice(1);
    if (!words.length) continue;
    const [cmd, ...args] = words;
    const name = basename(cmd);
    const anyArg = () => args.some((a) => refersTo(a, cwd));
    if (name === "cd") {
      if (args[0]) {
        cwdInRoot = refersTo(args[0], cwd);
        cwd = resolve(cwd, args[0]);
      }
      continue;
    }
    if (PLAIN_WRITERS.includes(name) && anyArg()) return true;
    if (name === "cp") {
      const operands = args.filter((a) => !a.startsWith("-"));
      const t = args.indexOf("-t");
      const target = t >= 0 ? args[t + 1] : operands[operands.length - 1];
      if (target && refersTo(target, cwd)) return true;
    }
    if (name === "sed" && args.some((a) => a === "--in-place" || /^-[a-zA-Z]*i/.test(a)) && anyArg()) return true;
    if (name === "perl" && args.some((a) => /^-[a-zA-Z]*i/.test(a)) && anyArg()) return true;
    if (name === "dd" && args.some((a) => a.startsWith("of=") && refersTo(a.slice(3), cwd))) return true;
    if (name === "git") {
      let dir = cwd;
      let inLegacy = cwdInRoot;
      let i = 0;
      while (i < args.length && args[i].startsWith("-")) {
        if (args[i] === "-C" && args[i + 1]) {
          inLegacy = refersTo(args[i + 1], dir);
          dir = resolve(dir, args[i + 1]);
          i += 2;
        } else i += 1;
      }
      if (GIT_WRITES.includes(args[i] || "") && (inLegacy || args.slice(i + 1).some((a) => refersTo(a, dir)))) return true;
    }
    if (PKG_MANAGERS.includes(name) && (args.includes("install") || args.includes("i"))) {
      if (cwdInRoot || anyArg()) return true;
    }
  }
  return false;
}

interface HookInput { target: string; command: string | null; cwd: string }

async function readInput(): Promise<HookInput> {
  try {
    const stdin = await Bun.stdin.text();
    if (!stdin) return { target: "", command: null, cwd: process.cwd() };
    const input = JSON.parse(stdin);
    const cwd = typeof input?.cwd === "string" && input.cwd ? input.cwd : process.cwd();
    // Claude Code Bash: tool_input.command. Cursor beforeShellExecution: command.
    const command = typeof input?.tool_input?.command === "string"
      ? input.tool_input.command
      : typeof input?.command === "string" ? input.command : null;
    const filePath = input?.tool_input?.file_path
      || input?.tool_input?.path
      || input?.file_path
      || input?.path
      || "";
    return { target: filePath ? realTarget(resolve(cwd, filePath)) : "", command: filePath ? null : command, cwd };
  } catch {
    return { target: "", command: null, cwd: process.cwd() }; // stdin parse failed — continue with gate check
  }
}

const READ_ONLY_MESSAGE =
  "This repo is read-only (manifest readOnly: true). It is the legacy source of truth. The gate override does not lift this block.";

async function main() {
  const { target, command, cwd } = await readInput();

  // Shell commands: only the readOnly repo check applies. Everything else is allowed.
  if (command !== null) {
    const roots = Object.values(await readRepos())
      .filter((repo) => repo.readOnly)
      .map((repo) => realRoot(repo.path));
    if (roots.length && shellWritesTo(command, cwd, roots)) {
      deny(READ_ONLY_MESSAGE + " Shell commands that write into it are blocked too.");
    }
    allow();
  }

  // Allow writes inside the haren folder — planning/discovery phases write artifacts there
  if (target && inside(target, harenDir)) allow();

  // Read-only repos (legacy source of truth) are blocked before any override check.
  if (target) {
    for (const repo of Object.values(await readRepos())) {
      if (repo.readOnly && inside(target, realRoot(repo.path))) {
        deny(READ_ONLY_MESSAGE);
      }
    }
  }

  if (process.env.HAREN_GATE === "off") allow();

  const progressFile = Bun.file(resolve(harenDir, "progress.json"));
  if (!(await progressFile.exists())) allow();

  const progress = await progressFile.json();
  if (overrideActive(progress)) allow();

  const modules: Record<string, any> = progress.modules || {};
  const hasModules = Object.keys(modules).length > 0;
  const active = Object.entries(modules).filter(([, m]) =>
    IMPLEMENTABLE.includes(m?.status || m?.currentPhase),
  );

  if (active.length === 0) {
    const message = !hasModules
      ? "No modules or discovery found. Run the discover phase first. Say \\"let's build X\\" or \\"start discovery\\" to begin. " + OVERRIDE_HINT
      : "No module has reached 'planned' status yet. Run the plan phase on a module before writing code. " + OVERRIDE_HINT;
    deny(message);
  }

  // No file path, or a file outside the workspace (temp files): legacy rule.
  if (!target || !inside(target, workspaceDir)) allow();

  const repos = await readRepos();
  const roots: string[] = [];
  const described: string[] = [];
  for (const [name, m] of active) {
    const keys: unknown = m?.repos;
    if (!Array.isArray(keys) || keys.length === 0) allow(); // no repo info: allow all
    const paths: string[] = [];
    for (const key of keys) {
      if (key === "default" || typeof key !== "string" || !repos[key]) allow();
      paths.push(repos[key].path);
      roots.push(realRoot(repos[key].path));
    }
    described.push(name + " (" + paths.join(", ") + ")");
  }
  for (const repo of Object.values(repos)) {
    if (repo.role === "e2e") roots.push(realRoot(repo.path));
  }

  if (roots.some((root) => inside(target, root))) allow();

  deny(
    "This file is outside the repos of the modules at 'planned' or later. Active modules: " +
      described.join("; ") + ". " + OVERRIDE_HINT,
  );
}

// Top-level await: on Windows, Bun exits early (code 0, no output) if main() is
// not awaited while it waits on stdin, which would allow every write.
await main().catch((err) => {
  console.error("brainstorm-gate hook error:", err);
  process.exit(1);
});
`;
