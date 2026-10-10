import { existsSync } from "fs";
import { readdir, readFile, stat } from "fs/promises";
import { dirname, join, resolve } from "path";
import { hasMarker, parseManifest } from "./manifest";

export interface HarenLocation {
  harenDir: string;
  workspaceDir: string;
  legacy: boolean;
}

export interface ResolveOptions {
  harenDir?: string;
  env?: Record<string, string | undefined>;
}

export class MultipleHarenDirsError extends Error {
  constructor(public matches: string[]) {
    super(
      `Found more than one haren folder:\n  ${matches.join("\n  ")}\nPass --haren-dir <path> to choose one.`,
    );
    this.name = "MultipleHarenDirsError";
  }
}

async function hasMarkedManifest(dir: string): Promise<boolean> {
  const path = join(dir, "manifest.yaml");
  if (!existsSync(path)) return false;
  const text = await readFile(path, "utf-8").catch(() => null);
  if (text === null) return false;
  try {
    return hasMarker(parseManifest(text));
  } catch (e) {
    if (/^haren:/m.test(text)) {
      throw new Error(
        `manifest.yaml in ${dir} is not valid YAML: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return false;
  }
}

function isLegacyHarenDir(dir: string): boolean {
  return existsSync(join(dir, "manifest.yaml")) && existsSync(join(dir, "skill.md"));
}

function location(harenDir: string, legacy: boolean): HarenLocation {
  return { harenDir, workspaceDir: dirname(harenDir), legacy };
}

export async function resolveHarenDir(
  cwd: string,
  opts: ResolveOptions = {},
): Promise<HarenLocation | null> {
  const explicit = opts.harenDir || opts.env?.HAREN_DIR;
  if (explicit) {
    const dir = resolve(cwd, explicit);
    if (!existsSync(join(dir, "manifest.yaml"))) {
      throw new Error(`No manifest.yaml in ${dir}`);
    }
    return location(dir, !(await hasMarkedManifest(dir)));
  }

  if (await hasMarkedManifest(cwd)) return location(cwd, false);

  const entries = await readdir(cwd, { withFileTypes: true }).catch(() => []);
  const matches: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const dir = join(cwd, entry.name);
    const isDir = entry.isSymbolicLink()
      ? await stat(dir).then(
          (st) => st.isDirectory(),
          () => false,
        )
      : entry.isDirectory();
    if (!isDir) continue;
    if (await hasMarkedManifest(dir)) matches.push(dir);
  }
  matches.sort();
  if (matches.length > 1) throw new MultipleHarenDirsError(matches);
  if (matches.length === 1) return location(matches[0], false);

  const legacyChild = join(cwd, "haren");
  if (isLegacyHarenDir(legacyChild)) return location(legacyChild, true);
  if (isLegacyHarenDir(cwd)) return location(cwd, true);

  return null;
}
