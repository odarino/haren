import { mkdir, writeFile, readFile, readdir, copyFile } from "fs/promises";
import { join, resolve } from "path";
import { resolveContentDir } from "../lib/content-dir";

type Mode = "blueprint" | "explore" | "inherit" | "undecided";
type Editor = "claude-code" | "cursor" | "both";

interface IterationConfig {
  enabled: true;
  duration: string;
  startDate: string;
  demoDay: string;
}

interface InitOptions {
  project: string;
  mode: Mode;
  language: string;
  iterations?: IterationConfig;
  editor?: Editor;
}

const MODES = ["blueprint", "explore", "inherit", "undecided"] as const;

const MODE_DESCRIPTIONS: Record<string, string> = {
  blueprint: "Greenfield project with existing docs",
  explore: "Greenfield project from scratch",
  inherit: "Brownfield project with existing code",
  undecided: "Decide later — LLM will help you choose",
};

function readLine(): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.resume();
    stdin.setEncoding("utf-8");

    const onData = (data: string) => {
      stdin.removeListener("data", onData);
      stdin.pause();
      resolve(data.toString().trim());
    };

    stdin.on("data", onData);
  });
}

async function prompt(question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` \x1b[2m(${defaultValue})\x1b[0m` : "";
  process.stdout.write(`  \x1b[36m?\x1b[0m ${question}${suffix} `);

  const value = await readLine();
  return value || defaultValue || "";
}

async function promptSelect(
  question: string,
  options: readonly string[],
  descriptions: Record<string, string>,
  defaultValue: string,
): Promise<string> {
  console.log(`  \x1b[36m?\x1b[0m ${question}`);
  for (const opt of options) {
    const marker = opt === defaultValue ? "\x1b[36m>\x1b[0m" : " ";
    const label = opt === defaultValue ? `\x1b[1m${opt}\x1b[0m` : opt;
    console.log(`    ${marker} ${label}  \x1b[2m— ${descriptions[opt]}\x1b[0m`);
  }
  process.stdout.write(`  \x1b[2m  enter choice:\x1b[0m `);

  while (true) {
    const value = (await readLine()).toLowerCase();
    if (!value) return defaultValue;
    if ((options as readonly string[]).includes(value)) return value;
    process.stdout.write(`  \x1b[31m!\x1b[0m Invalid. Choose: ${options.join(", ")} `);
  }
}

function getDirectories(iterations: boolean): string[] {
  const dirs = [
    "agents",
    "skills/research",
    "skills/discover",
    "skills/decompose",
    "skills/plan",
    "skills/implement",
    "skills/evaluate",
    "skills/read-context",
    "skills/create-artifact",
    "skills/validate-artifact",
    "skills/search-artifact",
    "skills/resolve-next-id",
    "skills/update-links",
    "skills/update-tracking",
    "skills/generate-mockup",
    "artifacts/_registry",
    "artifacts/00-baseline",
    "artifacts/01-research",
    "artifacts/02-discovery",
    "artifacts/03-modules",
    "artifacts/04-plans",
    "artifacts/05-implementation",
    "artifacts/06-evaluation",
    "events",
    "templates",
    "hooks",
  ];

  if (iterations) {
    dirs.push("artifacts/07-iterations");
  }

  return dirs;
}

async function copyRecursive(src: string, dest: string): Promise<void> {
  const entries = await readdir(src, { withFileTypes: true });
  await mkdir(dest, { recursive: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyRecursive(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

const harenEditorConfig = `## Haren Framework

This workspace uses the Haren agentic SDLC framework.

**On every session start, you MUST:**
1. Read \`haren/skill.md\` — this is your operating manual
2. Follow its instructions for session orientation
3. Read \`haren/manifest.yaml\` and \`haren/progress.json\` before taking any action

All project documentation, specs, plans, and artifacts are managed inside \`haren/\`.
Never write outside \`haren/\` unless explicitly asked.

## Brainstorming Gate

Before writing ANY code outside \`haren/\`:
1. Read \`haren/progress.json\`
2. At least one module MUST have status \`planned\`, \`implementing\`, \`evaluating\`, or \`completed\`
3. If NO module is at \`planned\` or later → STOP. Do not write code.
   - \`discovered\`, \`specified\`, \`decomposed\` do NOT allow implementation
   - Discovery docs and specs are NOT sufficient — planning must be completed first
4. If blocked, tell the user to run the plan phase before implementation

Design specs are written to Haren artifact folders, NOT to docs/superpowers/specs/.
`;

const cursorHarenRule = `---
description: Haren agentic SDLC framework - project workflow and artifact management
globs:
  - haren/**
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

## RULE #2: Code Gate — No code outside \`haren/\` without \`planned\` status

**BEFORE writing ANY file outside \`haren/\`, check \`haren/progress.json\`:**

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

1. Read \`haren/skill.md\` — this is your operating manual
2. Follow its instructions for session orientation
3. Read \`haren/manifest.yaml\` and \`haren/progress.json\` before taking any action

All project documentation, specs, plans, and artifacts are managed inside \`haren/\`.
Never write outside \`haren/\` unless explicitly asked.

## Phase Progression (MANDATORY)

Modules MUST progress through phases in order. You CANNOT skip phases.

\`\`\`
discovered → specified → planned → implementing → evaluating → completed
\`\`\`

**Before taking ANY action on a module, read \`haren/progress.json\` and check the module's current status. Then follow the dispatch rules in \`haren/skill.md\`.**

Key dispatch rules:
- Module at \`specified\` → user says "plan" → you MUST run the \`plan/\` skill first (read \`haren/skills/plan/SKILL.md\`)
- Module at \`discovered\` or no module → user says "plan" or "build" → you MUST run \`discover/\` skill first (brainstorming)
- Module at \`planned\` → user says "implement" or "build" → proceed with implementation
- **You CANNOT jump from \`specified\` directly to \`implementing\`**
- **You CANNOT skip brainstorming/discovery for new features**

## Rules

- Always read progress.json before taking action
- Never write outside the haren/ directory unless user explicitly asks
- Update progress.json after every phase transition
- Append to FEEDBACK.md when you encounter framework friction
`;

export async function scaffoldWorkspace(targetDir: string, options: InitOptions): Promise<void> {
  // Create all directories
  for (const dir of getDirectories(!!options.iterations)) {
    await mkdir(join(targetDir, dir), { recursive: true });
  }

  // Write manifest.yaml
  let manifestContent = `project: ${options.project}
mode: ${options.mode}
language: ${options.language}

repos:
  # Add your repos here (relative paths from this directory)
  # example: ../my-repo

sources:
  # Mode-specific inputs
  # docs: ./artifacts/00-baseline/requirements.pdf

hooks:
  # on-phase-complete:
  #   - echo "Module \${MODULE} completed \${PHASE}"
`;

  if (options.iterations) {
    manifestContent += `
iterations:
  enabled: true
  duration: ${options.iterations.duration}
  start_date: ${options.iterations.startDate}
  demo_day: ${options.iterations.demoDay}
`;
  }

  await writeFile(join(targetDir, "manifest.yaml"), manifestContent);

  // Write progress.json
  const progressData: Record<string, unknown> = {
    project: options.project,
    version: 1,
    phase: "init",
    status: "active",
    modules: {},
    dependencies: {},
  };

  if (options.iterations) {
    progressData.currentIteration = 1;
  }

  await writeFile(join(targetDir, "progress.json"), JSON.stringify(progressData, null, 2));

  // Write FEEDBACK.md
  await writeFile(
    join(targetDir, "FEEDBACK.md"),
    `# Haren Framework Feedback

Append-only log of framework improvement suggestions captured during usage.

---
`,
  );

  // Write artifact-index.md
  await writeFile(
    join(targetDir, "artifacts", "_registry", "artifact-index.md"),
    `# Artifact Index

Master registry of all artifacts in this Haren workspace.

| ID | Type | Module | Status | Path |
|----|------|--------|--------|------|
`,
  );

  // Write events placeholder
  await writeFile(join(targetDir, "events", "events.jsonl"), "");

  // Write brainstorm-gate hook script (works with both Claude Code and Cursor)
  await writeFile(
    join(targetDir, "hooks", "brainstorm-gate.ts"),
    `/**
 * Brainstorm Gate Hook
 * Blocks Edit/Write tool use if no module has reached 'planned' status.
 *
 * Works with both Claude Code and Cursor:
 * - Exit 0 = allow
 * - Exit 2 = block
 * - Other exit codes = hook failure, action proceeds (fail-open)
 */

const harenDir = import.meta.dir.replace(/\\/hooks$/, "");

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
  // Allow writes inside haren/ — planning/discovery phases need to write artifacts
  try {
    const stdin = await Bun.stdin.text();
    if (stdin) {
      const input = JSON.parse(stdin);
      const filePath = input?.tool_input?.file_path
        || input?.tool_input?.path
        || input?.file_path
        || input?.path
        || "";
      if (filePath.includes("/haren/") || filePath.startsWith("haren/")) {
        allow();
      }
    }
  } catch {
    // stdin parse failed — continue with gate check
  }

  const progressPath = \`\${harenDir}/progress.json\`;
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
`,
  );

  // Write skill.md entry point
  await scaffoldSkillMd(targetDir);

  // Copy content files from the package
  const contentDir = resolveContentDir();
  await copyRecursive(join(contentDir, "agents"), join(targetDir, "agents"));
  await copyRecursive(join(contentDir, "skills"), join(targetDir, "skills"));
  await copyRecursive(join(contentDir, "templates"), join(targetDir, "templates"));

  const workspaceDir = resolve(targetDir, "..");
  const editor = options.editor || "claude-code";

  // Write CLAUDE.md only for claude-code or both
  if (editor === "claude-code" || editor === "both") {
    const claudeMdPath = join(workspaceDir, "CLAUDE.md");
    const claudeMdExists = await Bun.file(claudeMdPath).exists();

    if (!claudeMdExists) {
      await writeFile(claudeMdPath, `# Project Instructions\n\n${harenEditorConfig}`);
    } else {
      const existing = await readFile(claudeMdPath, "utf-8");
      if (!existing.includes("haren/skill.md")) {
        await writeFile(claudeMdPath, existing + `\n\n${harenEditorConfig}`);
      }
    }
  }

  // Generate .cursorrules when editor is cursor or both
  if (editor === "cursor" || editor === "both") {
    const cursorrulesPath = join(workspaceDir, ".cursorrules");
    const cursorrulesExists = await Bun.file(cursorrulesPath).exists();

    if (!cursorrulesExists) {
      await writeFile(cursorrulesPath, `# Project Instructions\n\n${harenEditorConfig}`);
    } else {
      const existing = await readFile(cursorrulesPath, "utf-8");
      if (!existing.includes("haren/skill.md")) {
        await writeFile(cursorrulesPath, existing + `\n\n${harenEditorConfig}`);
      }
    }
  }

  // Generate hook config files
  if (editor === "claude-code" || editor === "both") {
    const claudeDir = join(workspaceDir, ".claude");
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, "settings.json"),
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: "Edit|Write",
                hooks: [
                  {
                    type: "command",
                    command: "bun haren/hooks/brainstorm-gate.ts",
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
    );
  }

  if (editor === "cursor" || editor === "both") {
    const cursorDir = join(workspaceDir, ".cursor");
    const cursorRulesDir = join(cursorDir, "rules");
    await mkdir(cursorRulesDir, { recursive: true });

    const harenMdcPath = join(cursorRulesDir, "haren.mdc");
    const harenMdcExists = await Bun.file(harenMdcPath).exists();
    if (!harenMdcExists) {
      await writeFile(harenMdcPath, cursorHarenRule);
    }

    // Generate Cursor hooks.json — hard gate via beforeFileEdit and preToolUse
    await writeFile(
      join(cursorDir, "hooks.json"),
      JSON.stringify(
        {
          version: 1,
          hooks: {
            beforeFileEdit: [
              {
                command: "bun haren/hooks/brainstorm-gate.ts",
                type: "command",
                timeout: 10,
              },
            ],
            preToolUse: [
              {
                command: "bun haren/hooks/brainstorm-gate.ts",
                matcher: "write",
                type: "command",
                timeout: 10,
              },
            ],
          },
        },
        null,
        2,
      ),
    );
  }
}

export async function scaffoldSkillMd(targetDir: string): Promise<void> {
  await writeFile(
    join(targetDir, "skill.md"),
    `---
name: haren
description: Agentic SDLC framework — orchestrates AI agents through structured phases
---

# Haren

You are operating within the Haren agentic SDLC framework.

## On Session Start

1. Read \`manifest.yaml\` to understand the project
2. Read \`progress.json\` to understand current state
3. Read \`artifacts/_registry/artifact-index.md\` for artifact inventory
4. **Scan \`artifacts/00-baseline/\`** for documents (PDFs, docs, markdown, etc.)
   - If docs found and mode is \`undecided\` → auto-recommend \`blueprint\` mode
   - If docs found and discovery hasn't started → suggest starting discover phase
   - If new docs added since last session → flag them and ask about re-discovery
5. **If mode is "undecided" and no baseline docs found:** Help the user choose a mode. Ask them:
   - What do you want to build? (get a brief description)
   - Do you already have documentation or specs for it?
   - Do you have an existing codebase to build on?
   Based on their answers, recommend a mode and update \`manifest.yaml\`:
   - Has docs/specs → tell them to drop docs in \`artifacts/00-baseline/\` then \`blueprint\`
   - Starting from scratch, just an idea → \`explore\`
   - Has existing code → \`inherit\`
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
| Draw a UI wireframe | generate-mockup/ | — |

## How to dispatch

- User says "let's build X" or describes a new feature → discover/ skill (triggers brainstorming)
- User says "what's next?" → read \`progress.json\` → suggest action
- User says "extract stories" or "break down the PRD" or "create stories from docs" → extract-stories/ skill
- User says "let's work on {module}" → check module phase → dispatch appropriate skill
- User says "I need to research X" → research/ skill
- User says "status" or "where are we?" → read-context/ skill
- User says "start" or "init" → discover/ skill
- User asks about an artifact → search-artifact/ skill

## Artifact Ownership

| Artifact | Owner | Location |
|----------|-------|----------|
| Spec (requirements, stories) | BA | \`artifacts/03-modules/{module}/spec.md\` |
| Module definition | Discover phase | \`artifacts/03-modules/{module}/module.md\` |
| Design (architecture) | Dev | \`artifacts/04-plans/{module}/design.md\` |
| Tasks (implementation) | Dev | \`artifacts/04-plans/{module}/[iteration-{N}/]tasks.md\` |

## Plan Paths

All skills that read or write plan artifacts MUST resolve paths using this convention:

**Spec path (BA-owned, always the same):**
- \`artifacts/03-modules/{module}/spec.md\` — requirements, user stories (STORY-IDs), acceptance criteria
- BA updates this file and adds a row to the Changelog table
- Devs read this but never write to it

**If \`manifest.yaml\` has \`iterations.enabled: true\`:**
- Read \`currentIteration\` from \`progress.json\`
- **Active plan path:** \`artifacts/04-plans/{module}/iteration-{N}/\` — design + tasks for current iteration
- **Master plan path:** \`artifacts/04-plans/{module}/\` — full module design
- The plan skill writes to BOTH master and active paths (it is the only skill that does this)

**If no \`iterations\` block in manifest.yaml:**
- **Active plan path:** \`artifacts/04-plans/{module}/\` — contains design.md, tasks.md
- **Master plan path:** (same as active)

When a skill says "read the spec", it means from \`artifacts/03-modules/{module}/spec.md\`.
When a skill says "read tasks" or "read design", it means from the **active plan path**.
When a skill says "read the master plan" or needs full module context, it means from the **master plan path**.

## Rules

- Always read progress.json before taking action
- Never write outside the haren/ directory unless user explicitly asks
- Update progress.json after every phase transition
- Append to FEEDBACK.md when you encounter framework friction
- Validate artifacts before phase transitions (validate-artifact/ skill)
`,
  );
}

export async function init(args: string[]): Promise<void> {
  let project: string | undefined;
  let mode: Mode | undefined;
  let language: string | undefined;
  let iterations: IterationConfig | undefined;
  let editor: Editor | undefined;
  const force = args.includes("--force");

  // Parse flags
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--project" && args[i + 1]) {
      project = args[i + 1];
      i++;
    }
    if (args[i] === "--mode" && args[i + 1]) {
      const m = args[i + 1];
      if (m === "blueprint" || m === "explore" || m === "inherit" || m === "undecided") {
        mode = m;
      } else {
        console.error(`Invalid mode: ${m}. Must be blueprint, explore, inherit, or undecided.`);
        process.exit(1);
      }
      i++;
    }
    if (args[i] === "--language" && args[i + 1]) {
      language = args[i + 1];
      i++;
    }
    if (args[i] === "--iterations") {
      iterations = {
        enabled: true,
        duration: "2 weeks",
        startDate: new Date().toISOString().split("T")[0],
        demoDay: "Friday",
      };
    }
    if (args[i] === "--duration" && args[i + 1]) {
      if (iterations) iterations.duration = args[i + 1];
      i++;
    }
    if (args[i] === "--start-date" && args[i + 1]) {
      if (iterations) iterations.startDate = args[i + 1];
      i++;
    }
    if (args[i] === "--demo-day" && args[i + 1]) {
      if (iterations) iterations.demoDay = args[i + 1];
      i++;
    }
    if (args[i] === "--editor" && args[i + 1]) {
      const e = args[i + 1];
      if (e === "claude-code" || e === "cursor" || e === "both") {
        editor = e;
      } else {
        console.error(`Invalid editor: ${e}. Must be claude-code, cursor, or both.`);
        process.exit(1);
      }
      i++;
    }
  }

  const targetDir = join(process.cwd(), "haren");

  // Guard against overwriting existing workspace
  const manifestExists = await Bun.file(join(targetDir, "manifest.yaml")).exists();
  if (manifestExists && !force) {
    console.error("Haren workspace already exists here (haren/manifest.yaml found).");
    console.error("Use --force to overwrite.");
    process.exit(1);
  }

  // Show banner
  console.log("");
  console.log(
    "\x1b[36m" +
      `
            ╱\\
           ╱  \\
          ╱ ◆  \\
         ╱ ╱  ╲ \\
        ╱ ╱    ╲ \\
       ╱══╧════╧══\\
          ║    ║
          ║    ║
     ██╗  ║██╗ ║█████╗ ██████╗ ███████╗███╗   ██╗
     ██║  ║██║ ║██╔══██╗██╔══██╗██╔════╝████╗  ██║
     █████║██║ ║███████║██████╔╝█████╗  ██╔██╗ ██║
     ██╔══║██║ ║██╔══██║██╔══██╗██╔══╝  ██║╚██╗██║
     ██║  ║██║ ║██║  ██║██║  ██║███████╗██║ ╚████║
     ╚═╝  ╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝
  ` +
      "\x1b[0m",
  );
  console.log("\x1b[2m     Agentic SDLC Framework v1.1.0\x1b[0m");
  console.log("");

  // Interactive prompts for missing values
  const cwdName = process.cwd().split("/").pop() || "my-project";

  if (!project) {
    project = await prompt("Project name:", cwdName);
  }

  if (!mode) {
    const selected = await promptSelect("Mode:", MODES, MODE_DESCRIPTIONS, "undecided");
    mode = selected as typeof mode;
  }

  if (!language) {
    language = await prompt("Preferred language:", "English");
  }

  if (iterations === undefined) {
    const enableIterations = await promptSelect(
      "Enable iteration planning?",
      ["no", "yes"] as const,
      {
        no: "flat planning, one pass per module",
        yes: "iteration-based planning with scoped deliverables",
      },
      "no",
    );

    if (enableIterations === "yes") {
      const duration = await prompt("Iteration duration:", "2 weeks");
      const today = new Date().toISOString().split("T")[0];
      const startDate = await prompt("Start date:", today);
      const demoDay = await prompt("Demo day:", "Friday");
      iterations = { enabled: true, duration, startDate, demoDay };
    }
  }

  if (editor === undefined) {
    const selected = await promptSelect(
      "Which editors do you use?",
      ["claude-code", "cursor", "both"] as const,
      {
        "claude-code": "Claude Code CLI / IDE extension",
        cursor: "Cursor AI editor",
        both: "Both Claude Code and Cursor",
      },
      "claude-code",
    );
    editor = selected as Editor;
  }

  console.log("");

  // Create the haren/ directory
  await mkdir(targetDir, { recursive: true });

  await scaffoldWorkspace(targetDir, {
    project,
    mode: mode!,
    language,
    iterations,
    editor,
  });

  console.log(`  \x1b[32m+\x1b[0m Project:  \x1b[1m${project}\x1b[0m`);
  console.log(`  \x1b[32m+\x1b[0m Mode:     \x1b[1m${mode}\x1b[0m`);
  console.log(`  \x1b[32m+\x1b[0m Language: \x1b[1m${language}\x1b[0m`);
  console.log(`  \x1b[32m+\x1b[0m Path:     \x1b[1mharen/\x1b[0m`);
  if (iterations) {
    console.log(
      `  \x1b[32m+\x1b[0m Iterations: \x1b[1menabled\x1b[0m (${iterations.duration}, demo: ${iterations.demoDay})`,
    );
  }
  console.log(`  \x1b[32m+\x1b[0m Editor:  \x1b[1m${editor}\x1b[0m`);
  console.log("");
  console.log("\x1b[2m  Files created in haren/:\x1b[0m");
  console.log("");
  console.log("  manifest.yaml    \x1b[2m—\x1b[0m project config");
  console.log("  progress.json    \x1b[2m—\x1b[0m auto-managed state");
  console.log("  skill.md         \x1b[2m—\x1b[0m LLM entry point");
  console.log("  agents/          \x1b[2m—\x1b[0m 6 agent definitions");
  console.log("  skills/          \x1b[2m—\x1b[0m 13 skill definitions");
  console.log("  templates/       \x1b[2m—\x1b[0m 9 artifact templates");
  console.log("  artifacts/       \x1b[2m—\x1b[0m phase outputs (empty)");
  console.log("");
  if (editor === "claude-code" || editor === "both") {
    console.log(`  \x1b[32m+\x1b[0m CLAUDE.md + .claude/settings.json created`);
  }
  if (editor === "cursor" || editor === "both") {
    console.log(`  \x1b[32m+\x1b[0m .cursorrules + .cursor/rules/haren.mdc created`);
  }
  console.log("");
  console.log("\x1b[2m  ─────────────────────────────────────────\x1b[0m");
  console.log("");
  const editorName =
    editor === "cursor" ? "Cursor" : editor === "both" ? "your editor" : "Claude Code";
  console.log(`  \x1b[36mNext:\x1b[0m Open this workspace in ${editorName}`);
  console.log('  and say \x1b[1m"what\'s next?"\x1b[0m to begin.');
  console.log("");
}
