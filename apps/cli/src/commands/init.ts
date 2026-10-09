import { mkdir, writeFile, readFile, readdir, copyFile } from "fs/promises";
import { join, resolve } from "path";
import { resolveContentDir } from "../lib/content-dir";
import {
  brainstormGateScript,
  cursorRuleTemplate,
  editorConfigTemplate,
  gateCommand,
  renderTemplate,
} from "../workspace/templates";

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
  await writeFile(join(targetDir, "hooks", "brainstorm-gate.ts"), brainstormGateScript);

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
      await writeFile(
        claudeMdPath,
        `# Project Instructions\n\n${renderTemplate(editorConfigTemplate, "haren")}`,
      );
    } else {
      const existing = await readFile(claudeMdPath, "utf-8");
      if (!existing.includes("haren/skill.md")) {
        await writeFile(
          claudeMdPath,
          existing + `\n\n${renderTemplate(editorConfigTemplate, "haren")}`,
        );
      }
    }
  }

  // Generate .cursorrules when editor is cursor or both
  if (editor === "cursor" || editor === "both") {
    const cursorrulesPath = join(workspaceDir, ".cursorrules");
    const cursorrulesExists = await Bun.file(cursorrulesPath).exists();

    if (!cursorrulesExists) {
      await writeFile(
        cursorrulesPath,
        `# Project Instructions\n\n${renderTemplate(editorConfigTemplate, "haren")}`,
      );
    } else {
      const existing = await readFile(cursorrulesPath, "utf-8");
      if (!existing.includes("haren/skill.md")) {
        await writeFile(
          cursorrulesPath,
          existing + `\n\n${renderTemplate(editorConfigTemplate, "haren")}`,
        );
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
                    command: gateCommand("haren"),
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
      await writeFile(harenMdcPath, renderTemplate(cursorRuleTemplate, "haren"));
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
                command: gateCommand("haren"),
                type: "command",
                timeout: 10,
              },
            ],
            preToolUse: [
              {
                command: gateCommand("haren"),
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
    mode = selected as Mode;
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
