import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  runGit,
  hasGitDir,
  isInsideWorkTree,
  getRemoteUrl,
  gitInit,
  cloneRepo,
  listChildRepos,
  gitEnv,
} from "../../workspace/git";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "haren-git-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function makeRepo(name: string, remote?: string): Promise<string> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await gitInit(dir);
  if (remote) await runGit(["remote", "add", "origin", remote], dir);
  return dir;
}

describe("git helpers", () => {
  it("detects a git dir and a work tree", async () => {
    const repo = await makeRepo("backend");
    expect(hasGitDir(repo)).toBe(true);
    expect(hasGitDir(root)).toBe(false);
    expect(await isInsideWorkTree(repo)).toBe(true);
    expect(await isInsideWorkTree(root)).toBe(false);
  });

  it("reads the origin remote or returns null", async () => {
    const a = await makeRepo("a", "git@github.com:acme/a.git");
    const b = await makeRepo("b");
    expect(await getRemoteUrl(a)).toBe("git@github.com:acme/a.git");
    expect(await getRemoteUrl(b)).toBeNull();
    expect(await getRemoteUrl(root)).toBeNull();
  });

  it("lists child repos at depth 1, sorted, skipping hidden and non-repo folders", async () => {
    await makeRepo("frontend", "git@github.com:acme/f.git");
    await makeRepo("backend");
    await mkdir(join(root, "notes"));
    await mkdir(join(root, ".cache"));
    const repos = await listChildRepos(root);
    expect(repos).toEqual([
      { name: "backend", path: join(root, "backend"), remote: null },
      { name: "frontend", path: join(root, "frontend"), remote: "git@github.com:acme/f.git" },
    ]);
  });

  it("clones a local repo and reports failure for a bad remote", async () => {
    const src = await makeRepo("src");
    await runGit(
      ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-m", "init"],
      src,
    );
    const ok = await cloneRepo(src, join(root, "copy"));
    expect(ok.ok).toBe(true);
    expect(hasGitDir(join(root, "copy"))).toBe(true);
    const bad = await cloneRepo(join(root, "missing"), join(root, "copy2"));
    expect(bad.ok).toBe(false);
    expect(bad.stderr.length).toBeGreaterThan(0);
  });

  it("skips hidden and node_modules folders even when they are git repos", async () => {
    await makeRepo(".hidden");
    await makeRepo("node_modules");
    await makeRepo("api");
    expect((await listChildRepos(root)).map((r) => r.name)).toEqual(["api"]);
  });

  it("turns off git prompts only when stdin is not a terminal", () => {
    expect(gitEnv(false, { PATH: "/bin" })).toEqual({
      PATH: "/bin",
      GIT_TERMINAL_PROMPT: "0",
      GIT_SSH_COMMAND: "ssh -o BatchMode=yes",
    });
    expect(gitEnv(true, { PATH: "/bin" })).toEqual({ PATH: "/bin" });
  });

  it("keeps a user GIT_SSH_COMMAND when git cannot prompt", () => {
    expect(gitEnv(false, { GIT_SSH_COMMAND: "ssh -i k" }).GIT_SSH_COMMAND).toBe("ssh -i k");
  });

  it("passes the prompt setting to git", async () => {
    const res = await runGit(["-c", "alias.envp=!echo x$GIT_TERMINAL_PROMPT", "envp"], root);
    expect(res.stdout).toBe(`x${gitEnv().GIT_TERMINAL_PROMPT ?? ""}`);
  });

  it("clones into a nested path whose parent does not exist yet", async () => {
    const src = await makeRepo("src");
    await runGit(
      ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-m", "init"],
      src,
    );
    await mkdir(join(root, "ws"));
    const res = await cloneRepo(src, join(root, "ws", "..", "services", "api"));
    expect(res.ok).toBe(true);
    expect(hasGitDir(join(root, "services", "api"))).toBe(true);
  });
});
