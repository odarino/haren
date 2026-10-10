import { existsSync } from "fs";
import { mkdir, readdir } from "fs/promises";
import { dirname, join, resolve } from "path";

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/**
 * Without a terminal (CI, `--yes`, piped input), git must fail on a private
 * HTTPS remote instead of waiting for a password that nobody can type.
 */
export function gitEnv(
  interactive: boolean = process.stdin.isTTY === true,
  base: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  return interactive ? { ...base } : { ...base, GIT_TERMINAL_PROMPT: "0" };
}

export async function runGit(args: string[], cwd: string): Promise<GitResult> {
  try {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      env: gitEnv(),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    return { ok: false, stdout: "", stderr: String(err) };
  }
}

export function hasGitDir(dir: string): boolean {
  return existsSync(join(dir, ".git"));
}

export async function isInsideWorkTree(dir: string): Promise<boolean> {
  const result = await runGit(["rev-parse", "--is-inside-work-tree"], dir);
  return result.ok && result.stdout === "true";
}

export async function getRemoteUrl(dir: string): Promise<string | null> {
  const result = await runGit(["remote", "get-url", "origin"], dir);
  return result.ok && result.stdout ? result.stdout : null;
}

export async function cloneRepo(remote: string, dest: string): Promise<GitResult> {
  const abs = resolve(dest);
  try {
    await mkdir(dirname(abs), { recursive: true });
  } catch (err) {
    return { ok: false, stdout: "", stderr: String(err) };
  }
  return runGit(["clone", remote, abs], dirname(abs));
}

export async function gitInit(dir: string): Promise<GitResult> {
  return runGit(["init"], dir);
}

export interface ChildRepo {
  name: string;
  path: string;
  remote: string | null;
}

export async function listChildRepos(dir: string): Promise<ChildRepo[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const repos: ChildRepo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules")
      continue;
    const path = join(dir, entry.name);
    if (!hasGitDir(path)) continue;
    repos.push({ name: entry.name, path, remote: await getRemoteUrl(path) });
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}
