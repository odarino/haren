import { mkdir, readdir, copyFile, readFile, stat, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { existsSync } from "fs";
import { resolveContentDir } from "../lib/content-dir";
import { HAREN_VERSION } from "../lib/version";
import { getRemoteUrl } from "../workspace/git";
import { inferLayout } from "../workspace/detect";
import {
  hasMarker,
  type Layout,
  migrateManifestText,
  normalizeRepos,
  parseManifest,
  type RepoEntry,
} from "../workspace/manifest";
import { migrateProgress } from "../workspace/progress";
import {
  harenDirFlag,
  MultipleHarenDirsError,
  type HarenLocation,
  resolveHarenDir,
} from "../workspace/resolve";
import {
  computeRootFiles,
  summarizeRootFiles,
  detectEditor,
  type Editor,
  writeRootFiles,
} from "../workspace/root-files";
import { refreshPlugins } from "../plugins/install";
import { GATE_SCRIPT_PATH, writeGateScript } from "../workspace/templates";

export interface MigrationPlan {
  manifest: { before: string; after: string };
  progress: { before: string; after: string } | null;
  gitignore: string | null;
  layout: Layout;
  editor: Editor;
  steps: string[];
}

async function moduleRepoKey(harenDir: string, moduleName: string): Promise<string | undefined> {
  const path = join(harenDir, "artifacts", "03-modules", moduleName, "module.md");
  if (!existsSync(path)) return undefined;
  const match = (await readFile(path, "utf-8")).match(/^repos:\s*\[([^\]]*)\]/m);
  return (
    match?.[1]
      .split(",")[0]
      ?.trim()
      .replace(/^["']|["']$/g, "") || undefined
  );
}

export async function planMigration(location: HarenLocation): Promise<MigrationPlan> {
  const { harenDir, workspaceDir } = location;
  const steps: string[] = [];

  const manifestBefore = await readFile(join(harenDir, "manifest.yaml"), "utf-8");
  const manifest = parseManifest(manifestBefore);
  const layout: Layout = manifest.layout ?? (await inferLayout(workspaceDir)).layout ?? "workspace";

  if (!hasMarker(manifest)) steps.push("manifest.yaml: add version marker");
  else if (String(manifest.haren?.version) !== HAREN_VERSION)
    steps.push("manifest.yaml: update version marker");
  if (!manifest.layout) steps.push(`manifest.yaml: add layout: ${layout}`);

  let repos: Record<string, RepoEntry> | undefined;
  const current = normalizeRepos(manifest.repos);
  const needsRemote = layout === "workspace" && Object.values(current).some((r) => !r.remote);
  if (Array.isArray(manifest.repos) || needsRemote) {
    const map: Record<string, RepoEntry> = {};
    let foundRemote = false;
    for (const [key, entry] of Object.entries(current)) {
      const remote =
        entry.remote ??
        (layout === "workspace" ? await getRemoteUrl(resolve(harenDir, entry.path)) : null);
      if (remote && !entry.remote) foundRemote = true;
      map[key] = remote ? { ...entry, remote } : entry;
    }
    // Rewrite the block only when it changes: a list, or a new remote.
    if (Array.isArray(manifest.repos) || foundRemote) {
      repos = map;
      steps.push("manifest.yaml: convert repos to a map with remotes");
    }
  }

  const manifestAfter = migrateManifestText(manifestBefore, {
    version: HAREN_VERSION,
    layout,
    repos,
  });

  let progress: MigrationPlan["progress"] = null;
  const progressPath = join(harenDir, "progress.json");
  if (existsSync(progressPath)) {
    const before = await readFile(progressPath, "utf-8");
    let raw: any;
    try {
      raw = JSON.parse(before);
    } catch (err) {
      throw new Error(
        `Invalid JSON in ${progressPath}: ${(err as Error).message}. Fix the file and run again.`,
      );
    }
    const firstRepo = Object.keys(repos ?? current)[0];
    const keys: Record<string, string | undefined> = {};
    for (const name of Object.keys(raw.modules ?? {})) {
      keys[name] = (await moduleRepoKey(harenDir, name)) ?? firstRepo;
    }
    const result = migrateProgress(raw, (name) => keys[name]);
    if (result.changed) {
      progress = { before, after: `${JSON.stringify(result.progress, null, 2)}\n` };
      steps.push("progress.json: migrate to version 2 (lastCommit per repo)");
    }
  }

  const gitignore = await planGitignore(harenDir);
  if (gitignore !== null) steps.push(`.gitignore: add ${AGENT_FILES.join(", ")}`);

  const editor = detectEditor(workspaceDir) ?? "claude-code";
  const rootFiles = await computeRootFiles({ workspaceDir, harenDir, editor });
  for (const file of summarizeRootFiles(rootFiles).filter((f) => f.changed)) {
    const count = file.count ? ` (${file.count} files)` : "";
    steps.push(`${file.path}: ${file.existed ? "update" : "create"}${count}`);
  }

  return {
    manifest: { before: manifestBefore, after: manifestAfter },
    progress,
    gitignore,
    layout,
    editor,
    steps,
  };
}

// Agent state (team code, user id, pid) must stay out of the haren repo.
const AGENT_FILES = [".agent.json", ".agent.pid"];

/** Returns the new .gitignore text, or null when it already lists the agent files. */
async function planGitignore(harenDir: string): Promise<string | null> {
  const path = join(harenDir, ".gitignore");
  const before = existsSync(path) ? await readFile(path, "utf-8") : "";
  const lines = new Set(before.split(/\r?\n/).map((l) => l.trim()));
  const missing = AGENT_FILES.filter((f) => !lines.has(f));
  if (missing.length === 0) return null;
  const eol = before.includes("\r\n") ? "\r\n" : "\n";
  const base = before === "" || before.endsWith("\n") ? before : `${before}${eol}`;
  return `${base}${missing.join(eol)}${eol}`;
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

async function countFiles(dir: string): Promise<number> {
  let count = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += await countFiles(join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}

const FRAMEWORK_DIRS = ["agents", "skills", "templates"] as const;

// Files upgrade never writes. manifest.yaml and progress.json show under
// "Migration" when they change; skill.md shows under "Upgrading".
const USER_FILES = ["FEEDBACK.md", "artifacts/", "events/"];

export async function upgrade(args: string[]): Promise<void> {
  let location: HarenLocation | null;
  try {
    location = await resolveHarenDir(process.cwd(), {
      harenDir: harenDirFlag(args),
      env: process.env,
    });
  } catch (err) {
    console.error(err instanceof MultipleHarenDirsError ? err.message : String(err));
    process.exit(1);
  }
  if (!location) {
    console.error("No haren folder found. Run 'haren init' first.");
    process.exit(1);
  }
  const targetDir = location.harenDir;
  const migration = await planMigration(location);

  const contentDir = resolveContentDir();

  // Check content dir exists
  try {
    await stat(contentDir);
  } catch {
    console.error("Could not find Haren package content directory.");
    process.exit(1);
  }

  const dry = args.includes("--dry-run");

  console.log("");
  console.log("\x1b[36m  Haren Upgrade\x1b[0m");
  console.log(`\x1b[2m  Workspace: ${targetDir}\x1b[0m`);
  console.log("");

  // Show what will NOT be touched
  console.log("\x1b[2m  Protected (not modified):\x1b[0m");
  for (const f of USER_FILES) {
    console.log(`    \x1b[32m✓\x1b[0m ${f}`);
  }
  console.log("");

  // Show what will be upgraded
  console.log("\x1b[2m  Upgrading framework files:\x1b[0m");

  let totalFiles = 0;
  for (const dir of FRAMEWORK_DIRS) {
    const srcDir = join(contentDir, dir);
    const destDir = join(targetDir, dir);
    const fileCount = await countFiles(srcDir);
    totalFiles += fileCount;
    console.log(`    \x1b[36m↑\x1b[0m ${dir}/  \x1b[2m(${fileCount} files)\x1b[0m`);
  }

  // Also upgrade skill.md (the dispatch table) and the brainstorm gate hook
  console.log(`    \x1b[36m↑\x1b[0m skill.md  \x1b[2m(entry point)\x1b[0m`);
  console.log(`    \x1b[36m↑\x1b[0m ${GATE_SCRIPT_PATH}  \x1b[2m(brainstorm gate)\x1b[0m`);

  console.log("");

  if (migration.steps.length > 0) {
    console.log("\x1b[2m  Migration:\x1b[0m");
    for (const step of migration.steps) console.log(`    \x1b[33m~\x1b[0m ${step}`);
    console.log("");
  }

  if (dry) {
    console.log(
      `\x1b[33m  Dry run — ${totalFiles + 2} files would be updated. No changes made.\x1b[0m`,
    );
    console.log("");
    return;
  }

  // Perform the upgrade
  for (const dir of FRAMEWORK_DIRS) {
    await copyRecursive(join(contentDir, dir), join(targetDir, dir));
  }

  // Read the current skill.md from the package's init to get the latest version
  // We regenerate it from the init module to keep the dispatch table in sync
  const { scaffoldSkillMd } = await import("./init");
  await scaffoldSkillMd(targetDir);
  await writeGateScript(targetDir);

  if (migration.manifest.after !== migration.manifest.before) {
    await writeFile(join(targetDir, "manifest.yaml"), migration.manifest.after);
  }
  if (migration.progress) {
    await writeFile(join(targetDir, "progress.json"), migration.progress.after);
  }
  if (migration.gitignore !== null) {
    await writeFile(join(targetDir, ".gitignore"), migration.gitignore);
  }
  const pluginWarnings = await refreshPlugins({
    workspaceDir: location.workspaceDir,
    harenDir: targetDir,
    project: "",
    io: { confirm: async () => false, log: (l) => console.log(`  ${l}`) },
  });
  for (const w of pluginWarnings) console.warn(`  \x1b[33m!\x1b[0m ${w}`);
  await writeRootFiles({
    workspaceDir: location.workspaceDir,
    harenDir: targetDir,
    editor: migration.editor,
  });

  console.log(`  \x1b[32m✓\x1b[0m Upgraded ${totalFiles + 2} framework files.`);
  console.log(
    `  \x1b[2mYour artifacts are untouched. Manifest and progress were migrated if needed.\x1b[0m`,
  );
  console.log("");
}
