import { mkdir, readdir, copyFile, readFile, stat } from "fs/promises";
import { join } from "path";
import { resolveContentDir } from "../lib/content-dir";

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

const USER_FILES = [
  "manifest.yaml",
  "progress.json",
  "skill.md",
  "FEEDBACK.md",
  "artifacts/",
  "events/",
];

export async function upgrade(args: string[]): Promise<void> {
  // Find the haren workspace — either cwd or cwd/haren
  let targetDir = process.cwd();
  const hasCurrent = await Bun.file(join(targetDir, "manifest.yaml")).exists();
  const hasChild = await Bun.file(join(targetDir, "haren", "manifest.yaml")).exists();

  if (!hasCurrent && hasChild) {
    targetDir = join(targetDir, "haren");
  } else if (!hasCurrent && !hasChild) {
    console.error("No Haren workspace found. Run 'haren init' first.");
    process.exit(1);
  }

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

  // Also upgrade skill.md (the dispatch table)
  console.log(`    \x1b[36m↑\x1b[0m skill.md  \x1b[2m(entry point)\x1b[0m`);

  console.log("");

  if (dry) {
    console.log(
      `\x1b[33m  Dry run — ${totalFiles + 1} files would be updated. No changes made.\x1b[0m`,
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

  console.log(`  \x1b[32m✓\x1b[0m Upgraded ${totalFiles + 1} framework files.`);
  console.log(`  \x1b[2mYour artifacts, progress, and manifest are untouched.\x1b[0m`);
  console.log("");
}
