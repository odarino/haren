/**
 * Templates for files haren generates. `{{harenDir}}` is the haren folder
 * path relative to the workspace root (for example `haren` or `cmis_ai_rules`).
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

interface Repo { path: string; role?: string }

// Same rules as the CLI: repos is a map key -> {path} | key -> string, or an array.
function normalizeRepos(repos: unknown): Record<string, Repo> {
  const out: Record<string, Repo> = {};
  if (Array.isArray(repos)) {
    for (const item of repos) {
      const path = typeof item === "string" ? item : item?.path;
      if (typeof path === "string" && path) out[basename(path)] = { path, role: item?.role };
    }
  } else if (repos && typeof repos === "object") {
    for (const [key, value] of Object.entries(repos as Record<string, any>)) {
      if (typeof value === "string") out[key] = { path: value };
      else if (value && typeof value === "object" && typeof value.path === "string") {
        out[key] = { path: value.path, role: value.role };
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

async function readTarget(): Promise<string> {
  try {
    const stdin = await Bun.stdin.text();
    if (!stdin) return "";
    const input = JSON.parse(stdin);
    const filePath = input?.tool_input?.file_path
      || input?.tool_input?.path
      || input?.file_path
      || input?.path
      || "";
    return filePath ? realTarget(resolve(process.cwd(), filePath)) : "";
  } catch {
    return ""; // stdin parse failed — continue with gate check
  }
}

async function main() {
  const target = await readTarget();

  // Allow writes inside the haren folder — planning/discovery phases write artifacts there
  if (target && inside(target, harenDir)) allow();

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
