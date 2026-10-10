import { mkdir, writeFile, readdir, copyFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { basename, join, resolve } from "path";
import { resolveContentDir } from "../lib/content-dir";
import { writeGateScript } from "../workspace/templates";
import {
  buildManifestText,
  normalizeRepos,
  parseManifest,
  renderReposBlock,
  type Layout,
  type RepoEntry,
} from "../workspace/manifest";
import { type Editor, detectEditor, writeRootFiles } from "../workspace/root-files";
import { detectLayout, inferLayout, type Detection } from "../workspace/detect";
import { buildPlan, isNoop, renderPlan, type Plan } from "../workspace/plan";
import { cloneRepo, gitInit, hasGitDir } from "../workspace/git";
import type { HarenLocation } from "../workspace/resolve";
import { PROGRESS_VERSION } from "../workspace/progress";
import { HAREN_VERSION } from "../lib/version";

type Mode = "blueprint" | "explore" | "inherit" | "undecided";

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
  layout?: Layout;
  repos?: Record<string, RepoEntry>;
}

const MODES = ["blueprint", "explore", "inherit", "undecided"] as const;

const EDITORS = ["claude-code", "cursor", "both"] as const;
const EDITOR_DESCRIPTIONS: Record<string, string> = {
  "claude-code": "Claude Code CLI / IDE extension",
  cursor: "Cursor AI editor",
  both: "Both Claude Code and Cursor",
};

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

async function promptMultiSelect(
  question: string,
  labels: string[],
  defaults: number[],
): Promise<number[]> {
  console.log(`  \x1b[36m?\x1b[0m ${question}`);
  labels.forEach((label, i) => {
    const mark = defaults.includes(i) ? "\x1b[36m◉\x1b[0m" : "◯";
    console.log(`    ${mark} ${i + 1}. ${label}`);
  });
  process.stdout.write(`  \x1b[2m  numbers, comma-separated (enter = keep defaults):\x1b[0m `);
  while (true) {
    const value = await readLine();
    if (!value) return defaults;
    const picked = value.split(",").map((s) => Number.parseInt(s.trim(), 10) - 1);
    if (picked.every((n) => Number.isInteger(n) && n >= 0 && n < labels.length)) {
      return [...new Set(picked)];
    }
    process.stdout.write(`  \x1b[31m!\x1b[0m Invalid. Use numbers 1-${labels.length}: `);
  }
}

async function promptConfirm(allowEdit: boolean): Promise<"yes" | "no" | "edit"> {
  const choices = allowEdit ? "(Y)es / (n)o / (e)dit selection" : "(Y)es / (n)o";
  process.stdout.write(`  \x1b[36m?\x1b[0m Apply this plan? ${choices} `);
  while (true) {
    const value = (await readLine()).toLowerCase();
    if (value === "" || value === "y" || value === "yes") return "yes";
    if (value === "n" || value === "no") return "no";
    if (allowEdit && (value === "e" || value === "edit")) return "edit";
    process.stdout.write(`  \x1b[31m!\x1b[0m Choose ${choices}: `);
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
  await writeFile(
    join(targetDir, "manifest.yaml"),
    buildManifestText({
      version: HAREN_VERSION,
      layout: options.layout ?? "monorepo",
      project: options.project,
      mode: options.mode,
      language: options.language,
      repos: options.repos ?? {},
      iterations: options.iterations,
    }),
  );

  // Write progress.json
  const progressData: Record<string, unknown> = {
    project: options.project,
    version: PROGRESS_VERSION,
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

  // Keep agent state (team code, user id) out of the haren repo
  const gitignore = join(targetDir, ".gitignore");
  if (!existsSync(gitignore)) await writeFile(gitignore, ".agent.json\n.agent.pid\n");

  // Write brainstorm-gate hook script (works with both Claude Code and Cursor)
  await writeGateScript(targetDir);

  // Write skill.md entry point
  await scaffoldSkillMd(targetDir);

  // Copy content files from the package
  const contentDir = resolveContentDir();
  await copyRecursive(join(contentDir, "agents"), join(targetDir, "agents"));
  await copyRecursive(join(contentDir, "skills"), join(targetDir, "skills"));
  await copyRecursive(join(contentDir, "templates"), join(targetDir, "templates"));

  await writeRootFiles({
    workspaceDir: resolve(targetDir, ".."),
    harenDir: targetDir,
    editor: options.editor ?? "claude-code",
  });
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
| Onboard to the project / check the workspace | onboard/ (\`/haren-onboard\`) | — |

## How to dispatch

- User says "let's build X" or describes a new feature → discover/ skill (triggers brainstorming)
- User says "what's next?" → read \`progress.json\` → suggest action
- User says "extract stories" or "break down the PRD" or "create stories from docs" → extract-stories/ skill
- User says "let's work on {module}" → check module phase → dispatch appropriate skill
- User says "I need to research X" → research/ skill
- User says "status" or "where are we?" → read-context/ skill
- User says "start" or "init" → discover/ skill
- User asks about an artifact → search-artifact/ skill
- User runs \`/haren-onboard\`, is new to the project, or asks "is my workspace set up?" → onboard/ skill

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

## Repos and Git

\`manifest.yaml\` has \`layout\` (\`monorepo\` or \`workspace\`) and a \`repos\` map. Each repo has a \`path\` relative to this haren folder (for example \`../backend\`). A repo can also have \`remote\`, \`default_branch\`, \`role\` (\`frontend\`, \`backend\`, \`e2e\` or \`other\`), \`stack\` and \`test_cmd\`.

- **Repo folder:** \`<this haren folder>/<path>\`. Run git with \`git -C <repo folder> ...\`.
- **Workspace layout:** each repo is its own git repository, and this haren folder is one more. Commit code in the code repo. Commit artifacts, session logs and \`progress.json\` in the haren repo.
- **Monorepo layout:** the repos and this haren folder share one git repository. One branch and one commit can hold code and artifacts.
- **Module repos:** the \`repos:\` keys in the module's \`module.md\` front matter. Copy them to \`progress.json\` \`modules.<module>.repos\`.
- **Branch:** a module uses the branch \`feat/<module-slug>\` in every repo it touches. Record it in \`modules.<module>.branch\`.
- **lastCommit:** \`modules.<module>.lastCommit\` maps a repo key to the last commit SHA that haren recorded, for example \`{ "backend": "abc1234" }\`. It is never a plain string. The key \`default\` comes from an old progress file: it means the repo that holds this haren folder (monorepo layout) or the module's first repo (workspace layout).
- Never push. Never create pull requests unless the user asks. Never clone repos — tell the user to run \`haren init\`.

## Rules

- Always read progress.json before taking action
- Never write outside this haren folder unless user explicitly asks
- Update progress.json after every phase transition
- Append to FEEDBACK.md when you encounter framework friction
- Validate artifacts before phase transitions (validate-artifact/ skill)
`,
  );
}

export interface InitArgs {
  project?: string;
  mode?: Mode;
  language?: string;
  iterations?: IterationConfig;
  editor?: Editor;
  force: boolean;
  dir?: string;
  layout?: Layout;
  harenDir?: string;
  yes: boolean;
  dryRun: boolean;
}

export function parseInitArgs(args: string[]): InitArgs {
  const out: InitArgs = {
    force: args.includes("--force"),
    yes: args.includes("--yes") || args.includes("-y"),
    dryRun: args.includes("--dry-run"),
  };
  for (let i = 0; i < args.length; i++) {
    const value = args[i + 1];
    switch (args[i]) {
      case "--project":
        out.project = value;
        i++;
        break;
      case "--language":
        out.language = value;
        i++;
        break;
      case "--dir":
        out.dir = value;
        i++;
        break;
      case "--haren-dir":
        out.harenDir = value;
        i++;
        break;
      case "--mode":
        if (!MODES.includes(value as Mode)) {
          throw new Error(
            `Invalid mode: ${value}. Must be blueprint, explore, inherit, or undecided.`,
          );
        }
        out.mode = value as Mode;
        i++;
        break;
      case "--editor":
        if (value !== "claude-code" && value !== "cursor" && value !== "both") {
          throw new Error(`Invalid editor: ${value}. Must be claude-code, cursor, or both.`);
        }
        out.editor = value;
        i++;
        break;
      case "--layout":
        if (value !== "monorepo" && value !== "workspace") {
          throw new Error(`Invalid layout: ${value}. Must be monorepo or workspace.`);
        }
        out.layout = value;
        i++;
        break;
      case "--iterations":
        out.iterations = {
          enabled: true,
          duration: "2 weeks",
          startDate: new Date().toISOString().split("T")[0],
          demoDay: "Friday",
        };
        break;
      case "--duration":
        if (out.iterations) out.iterations.duration = value;
        i++;
        break;
      case "--start-date":
        if (out.iterations) out.iterations.startDate = value;
        i++;
        break;
      case "--demo-day":
        if (out.iterations) out.iterations.demoDay = value;
        i++;
        break;
    }
  }
  return out;
}

export async function applyClones(plan: Plan, rootDir: string): Promise<string[]> {
  const failed: string[] = [];
  for (const item of plan.items) {
    if (item.action !== "clone" || !item.remote) continue;
    console.log(`  \x1b[36m↓\x1b[0m Cloning ${item.path} ...`);
    const result = await cloneRepo(item.remote, join(rootDir, item.path));
    if (!result.ok) {
      console.error(`  \x1b[31m✗\x1b[0m ${item.path}: ${result.stderr.split("\n").pop()}`);
      failed.push(item.path);
    }
  }
  return failed;
}

function canPrompt(opts: InitArgs): boolean {
  return !opts.yes && process.stdin.isTTY === true;
}

async function confirmOrExit(opts: InitArgs, allowEdit: boolean): Promise<"yes" | "no" | "edit"> {
  if (opts.yes) return "yes";
  if (!process.stdin.isTTY) {
    console.error("  No terminal to confirm the plan. Re-run with --yes to apply.");
    process.exit(1);
  }
  return promptConfirm(allowEdit);
}

function printNextSteps(): void {
  console.log("");
  console.log(
    "  \x1b[36mNext:\x1b[0m open the workspace root in your editor and run \x1b[1m/haren-onboard\x1b[0m.",
  );
  console.log("");
}

function printBanner(): void {
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
  console.log(`\x1b[2m     Agentic SDLC Framework v${HAREN_VERSION}\x1b[0m`);
  console.log("");
}

async function promptIterations(): Promise<IterationConfig | undefined> {
  const enable = await promptSelect(
    "Enable iteration planning?",
    ["no", "yes"] as const,
    {
      no: "flat planning, one pass per module",
      yes: "iteration-based planning with scoped deliverables",
    },
    "no",
  );
  if (enable !== "yes") return undefined;
  const duration = await prompt("Iteration duration:", "2 weeks");
  const today = new Date().toISOString().split("T")[0];
  const startDate = await prompt("Start date:", today);
  const demoDay = await prompt("Demo day:", "Friday");
  return { enabled: true, duration, startDate, demoDay };
}

async function runSetup(location: HarenLocation, opts: InitArgs): Promise<void> {
  if (location.legacy) {
    console.log(`  Found a haren folder without a version marker: ${location.harenDir}`);
    console.log("  Run 'haren upgrade' to migrate it.");
    return;
  }
  const manifest = parseManifest(await readFile(join(location.harenDir, "manifest.yaml"), "utf-8"));
  const layout: Layout = manifest.layout ?? "workspace";
  let editor = opts.editor ?? detectEditor(location.workspaceDir);
  if (!editor) {
    editor = canPrompt(opts)
      ? ((await promptSelect(
          "Which editors do you use?",
          EDITORS,
          EDITOR_DESCRIPTIONS,
          "claude-code",
        )) as Editor)
      : "claude-code";
  }

  const plan = await buildPlan({
    rootDir: location.workspaceDir,
    harenDir: location.harenDir,
    layout,
    createHaren: false,
    repos: normalizeRepos(manifest.repos),
    editor,
  });
  console.log(`  Found haren folder: ${location.harenDir}`);
  if (isNoop(plan)) {
    console.log("  Already set up. Run 'haren upgrade' to update framework files.");
    return;
  }
  console.log("");
  console.log(renderPlan(plan));
  console.log("");
  if (opts.dryRun) return;
  if ((await confirmOrExit(opts, false)) === "no") return;

  const failed = await applyClones(plan, location.workspaceDir);
  await writeRootFiles({
    workspaceDir: location.workspaceDir,
    harenDir: location.harenDir,
    editor,
  });
  printNextSteps();
  if (failed.length > 0) {
    console.error(
      `  ${failed.length} repo(s) failed to clone: ${failed.join(", ")}. Run 'haren init' again to retry.`,
    );
    process.exit(1);
  }
}

export async function init(args: string[]): Promise<void> {
  let opts: InitArgs;
  try {
    opts = parseInitArgs(args);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  const rootDir = resolve(
    opts.dir?.replace(/^~(?=$|\/)/, process.env.HOME ?? "~") ?? process.cwd(),
  );
  // rootDir is created only when the plan is applied (mkdir harenDir below).

  printBanner();

  // --haren-dir selects an existing folder only when it already has a manifest;
  // otherwise it is the name of the folder to create.
  const explicitHarenDir =
    opts.harenDir && existsSync(join(rootDir, opts.harenDir, "manifest.yaml"))
      ? opts.harenDir
      : undefined;

  let detection: Detection;
  try {
    detection = await detectLayout(rootDir, { harenDir: explicitHarenDir, env: process.env });
  } catch (err) {
    console.error(`  ${(err as Error).message}`);
    process.exit(1);
  }

  if (detection.kind === "existing" && !opts.force) {
    await runSetup(detection.location!, opts);
    return;
  }

  // --force on an existing haren folder re-scaffolds it in place: it keeps the
  // folder, the layout, and the tracked repos from its manifest.
  let existingManifest: ReturnType<typeof parseManifest> | undefined;
  let existingRepos: Record<string, RepoEntry> | undefined;
  let existingLayout: Layout | undefined;
  if (detection.kind === "existing" && detection.location) {
    const loc = detection.location;
    existingManifest = parseManifest(await readFile(join(loc.harenDir, "manifest.yaml"), "utf-8"));
    existingRepos = normalizeRepos(existingManifest.repos);
    existingLayout =
      existingManifest.layout ?? (await inferLayout(loc.workspaceDir)).layout ?? "workspace";
  }

  const interactive = canPrompt(opts);
  const layout: Layout =
    opts.layout ??
    existingLayout ??
    (detection.kind === "monorepo"
      ? "monorepo"
      : detection.kind === "workspace-new"
        ? "workspace"
        : interactive
          ? ((await promptSelect(
              "Layout:",
              ["workspace", "monorepo"] as const,
              {
                workspace: "several git repos side by side; haren is its own repo",
                monorepo: "one git repo; haren is a folder inside it",
              },
              "workspace",
            )) as Layout)
          : "workspace");
  console.log(
    `  Layout detected: ${layout === "monorepo" ? "monorepo (inside a git repo)" : "multi-repo workspace (no .git at root)"}`,
  );
  console.log("");

  const existingLoc = detection.kind === "existing" ? detection.location : null;
  const harenDirName =
    opts.harenDir ??
    (existingLoc
      ? basename(existingLoc.harenDir)
      : interactive
        ? await prompt("haren folder name:", "haren")
        : "haren");
  const harenDir =
    existingLoc && !opts.harenDir ? existingLoc.harenDir : join(rootDir, harenDirName);

  const children = (existingRepos ? [] : detection.childRepos).filter(
    (r) => r.name !== harenDirName,
  );
  const defaults = children.flatMap((r, i) => (r.remote ? [i] : []));
  let selected = defaults;

  const project =
    opts.project ??
    existingManifest?.project ??
    (interactive ? await prompt("Project name:", basename(rootDir)) : basename(rootDir));
  const existingMode = MODES.find((m) => m === existingManifest?.mode);
  const mode =
    opts.mode ??
    existingMode ??
    (interactive
      ? ((await promptSelect("Mode:", MODES, MODE_DESCRIPTIONS, "undecided")) as Mode)
      : "undecided");
  const language =
    opts.language ??
    existingManifest?.language ??
    (interactive ? await prompt("Preferred language:", "English") : "English");
  const iterations = opts.iterations ?? (interactive ? await promptIterations() : undefined);
  const editor =
    opts.editor ??
    (interactive
      ? ((await promptSelect(
          "Which editors do you use?",
          EDITORS,
          EDITOR_DESCRIPTIONS,
          "claude-code",
        )) as Editor)
      : "claude-code");

  while (true) {
    if (layout === "workspace" && children.length > 0 && interactive) {
      selected = await promptMultiSelect(
        "Select code repos to track:",
        children.map((r) => `${r.name.padEnd(12)} ${r.remote ?? "(no remote)"}`),
        selected,
      );
    }
    const repos: Record<string, RepoEntry> = { ...existingRepos };
    for (const i of selected) {
      const child = children[i];
      repos[child.name] = child.remote
        ? { path: `../${child.name}`, remote: child.remote }
        : { path: `../${child.name}` };
    }

    const plan = await buildPlan({
      rootDir,
      harenDir,
      layout,
      createHaren: true,
      repos,
      editor,
      manifestPreview: `layout: ${layout}\n${renderReposBlock(repos)}`,
    });
    console.log("");
    console.log(renderPlan(plan));
    console.log("");
    if (opts.dryRun) return;

    const answer = await confirmOrExit(opts, layout === "workspace" && children.length > 0);
    if (answer === "no") return;
    if (answer === "edit") continue;

    // --force on an existing workspace: clone tracked repos that are missing.
    const failed = layout === "workspace" ? await applyClones(plan, rootDir) : [];
    await mkdir(harenDir, { recursive: true });
    await scaffoldWorkspace(harenDir, {
      project,
      mode,
      language,
      iterations,
      editor,
      layout,
      repos,
    });
    if (layout === "workspace" && !hasGitDir(harenDir)) {
      const result = await gitInit(harenDir);
      if (!result.ok) {
        console.error(`  git init failed in ${harenDir}: ${result.stderr}`);
        process.exit(1);
      }
    }
    console.log(`  \x1b[32m✓\x1b[0m Created ${harenDirName}/ (${layout})`);
    printNextSteps();
    if (failed.length > 0) {
      console.error(
        `  ${failed.length} repo(s) failed to clone: ${failed.join(", ")}. Run 'haren init' again to retry.`,
      );
      process.exit(1);
    }
    return;
  }
}
