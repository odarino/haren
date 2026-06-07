import { join } from "path";
import { readdir } from "fs/promises";

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
  maxCount = 50,
): Promise<{ hash: string; message: string; date: string; author: string }[]> {
  try {
    const proc = Bun.spawn(
      ["git", "log", `--max-count=${maxCount}`, "--format=%H|%s|%aI|%aN", "--", "haren/"],
      { stdout: "pipe", stderr: "pipe" },
    );
    const text = await new Response(proc.stdout).text();
    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, message, date, author] = line.split("|");
        return { hash, message, date, author };
      });
  } catch {
    return [];
  }
}
