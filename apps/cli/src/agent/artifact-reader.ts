import { join } from "path";
import { readdir } from "fs/promises";
import { runGit } from "../workspace/git";

export interface ArtifactNode {
  name: string;
  type: "file" | "directory";
  path: string;
  children?: ArtifactNode[];
}

export async function readProgress(harenDir: string): Promise<any | null> {
  const file = Bun.file(join(harenDir, "progress.json"));
  if (!(await file.exists())) return null;
  return file.json();
}

export async function readArtifactTree(harenDir: string): Promise<ArtifactNode[]> {
  const artifactsDir = join(harenDir, "artifacts");
  try {
    return await buildTree(artifactsDir, "artifacts");
  } catch {
    return [];
  }
}

async function buildTree(dirPath: string, relativePath: string): Promise<ArtifactNode[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const nodes: ArtifactNode[] = [];

  for (const entry of entries) {
    const entryPath = join(relativePath, entry.name);
    if (entry.isDirectory()) {
      const children = await buildTree(join(dirPath, entry.name), entryPath);
      nodes.push({
        name: entry.name,
        type: "directory",
        path: entryPath,
        children,
      });
    } else {
      nodes.push({ name: entry.name, type: "file", path: entryPath });
    }
  }

  return nodes.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readArtifact(harenDir: string, relativePath: string): Promise<string | null> {
  const file = Bun.file(join(harenDir, relativePath));
  if (!(await file.exists())) return null;
  return file.text();
}

export async function readGitLog(
  harenDir: string,
  maxCount = 50,
): Promise<{ hash: string; message: string; date: string; author: string }[]> {
  const result = await runGit(
    ["-C", harenDir, "log", `--max-count=${maxCount}`, "--format=%H|%s|%aI|%aN", "--", "."],
    harenDir,
  );
  if (!result.ok || !result.stdout) return [];
  return result.stdout.split("\n").map((line) => {
    const [hash, message, date, author] = line.split("|");
    return { hash, message, date, author };
  });
}
