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
Write outside \`{{harenDir}}/\` only in the module's repos (see "Repos and Git" in \`{{harenDir}}/skill.md\`), only from the \`planned\` status on (implement phase) or when qa-engineer writes tests in \`$E2E\`, or when the user explicitly asks.

## Brainstorming Gate

Before writing ANY code outside \`{{harenDir}}/\`:
1. Read \`{{harenDir}}/progress.json\`
2. At least one module MUST have status \`planned\`, \`implementing\`, \`evaluating\`, or \`completed\`
3. If NO module is at \`planned\` or later → STOP. Do not write code.
   - \`discovered\`, \`specified\`, \`decomposed\` do NOT allow implementation
   - Discovery docs and specs are NOT sufficient — planning must be completed first
4. If blocked, tell the user to run the plan phase before implementation

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

## RULE #2: Code Gate — No code outside \`{{harenDir}}/\` without \`planned\` status

**BEFORE writing ANY file outside \`{{harenDir}}/\`, check \`{{harenDir}}/progress.json\`:**

1. The relevant module MUST have status \`planned\`, \`implementing\`, \`evaluating\`, or \`completed\`
2. **If NO → STOP. DO NOT WRITE CODE.**
3. \`discovered\`, \`specified\`, \`decomposed\` do NOT allow code changes
4. Discovery docs and specs are NOT sufficient

**When blocked, respond ONLY with:**
- No modules: "No modules found. Run the discover phase first."
- No planned modules: "No module has reached 'planned' status yet. Run the plan phase first."

No exceptions. No rationalizing. STOP means STOP.

---

## On Every Session Start

1. Read \`{{harenDir}}/skill.md\` — this is your operating manual
2. Follow its instructions for session orientation
3. Read \`{{harenDir}}/manifest.yaml\` and \`{{harenDir}}/progress.json\` before taking any action

All project documentation, specs, plans, and artifacts are managed inside \`{{harenDir}}/\`.
Write outside \`{{harenDir}}/\` only in the module's repos (see "Repos and Git" in \`{{harenDir}}/skill.md\`), only from the \`planned\` status on (implement phase) or when qa-engineer writes tests in \`$E2E\`, or when the user explicitly asks.

## Phase Progression (MANDATORY)

Modules MUST progress through phases in order. You CANNOT skip phases.

\`\`\`
discovered → specified → planned → implementing → evaluating → completed
\`\`\`

**Before taking ANY action on a module, read \`{{harenDir}}/progress.json\` and check the module's current status. Then follow the dispatch rules in \`{{harenDir}}/skill.md\`.**

Key dispatch rules:
- Module at \`specified\` → user says "plan" → you MUST run the \`plan/\` skill first (read \`{{harenDir}}/skills/plan/SKILL.md\`)
- Module at \`discovered\` or no module → user says "plan" or "build" → you MUST run \`discover/\` skill first (brainstorming)
- Module at \`planned\` → user says "implement" or "build" → proceed with implementation
- **You CANNOT jump from \`specified\` directly to \`implementing\`**
- **You CANNOT skip brainstorming/discovery for new features**

## Rules

- Always read progress.json before taking action
- Write outside \`{{harenDir}}/\` only in the module's repos (see "Repos and Git" in \`{{harenDir}}/skill.md\`), only from the \`planned\` status on (implement phase) or when qa-engineer writes tests in \`$E2E\`, or when the user explicitly asks.
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
 * Blocks Edit/Write tool use if no module has reached 'planned' status.
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

function allow() {
  console.log(JSON.stringify({
    allow: true,           // Claude Code
    permission: "allow",   // Cursor
  }));
  process.exit(0);
}

function deny(message: string) {
  console.log(JSON.stringify({
    error: message,            // Claude Code
    permission: "deny",        // Cursor
    user_message: message,     // Cursor — shown in UI
    agent_message: message,    // Cursor — sent to model
  }));
  process.exit(2);
}

async function main() {
  // Allow writes inside the haren folder — planning/discovery phases write artifacts there
  try {
    const stdin = await Bun.stdin.text();
    if (stdin) {
      const input = JSON.parse(stdin);
      const filePath = input?.tool_input?.file_path
        || input?.tool_input?.path
        || input?.file_path
        || input?.path
        || "";
      if (filePath) {
        const real = realTarget(resolve(process.cwd(), filePath));
        if (real === harenDir || real.startsWith(harenDir + sep)) {
          allow();
        }
      }
    }
  } catch {
    // stdin parse failed — continue with gate check
  }

  const progressPath = resolve(harenDir, "progress.json");
  const progressFile = Bun.file(progressPath);

  if (!(await progressFile.exists())) {
    allow();
  }

  const progress = await progressFile.json();
  const modules = progress.modules || {};
  const hasModules = Object.keys(modules).length > 0;

  const implementablePhases = ["planned", "implementing", "evaluating", "completed"];
  const hasImplementableModule = Object.values(modules).some(
    (m: any) => implementablePhases.includes(m.status || m.currentPhase)
  );

  if (hasImplementableModule) {
    allow();
  }

  // No module is ready for implementation — block unconditionally
  const message = !hasModules
    ? "No modules or discovery found. Run the discover phase first. Say \\"let's build X\\" or \\"start discovery\\" to begin."
    : "No module has reached 'planned' status yet. Run the plan phase on a module before writing code.";

  deny(message);
}

main().catch((err) => {
  console.error("brainstorm-gate hook error:", err);
  process.exit(1);
});
`;
