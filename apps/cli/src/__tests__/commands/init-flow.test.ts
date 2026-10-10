import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { gitInit, runGit, hasGitDir } from "../../workspace/git";
import { parseManifest, normalizeRepos } from "../../workspace/manifest";

const CLI = resolve(import.meta.dir, "..", "..", "index.ts");
let ws: string;

beforeEach(async () => {
  ws = await mkdtemp(join(tmpdir(), "haren-flow-"));
});
afterEach(async () => {
  await rm(ws, { recursive: true, force: true });
});

async function haren(args: string[], cwd = ws, env?: Record<string, string>) {
  const proc = Bun.spawn(["bun", CLI, ...args], {
    cwd,
    env: env ? { ...process.env, ...env } : undefined,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { out, err, code };
}

async function repo(name: string, remote?: string) {
  await mkdir(join(ws, name));
  await gitInit(join(ws, name));
  if (remote) await runGit(["remote", "add", "origin", remote], join(ws, name));
}

describe("haren init flow", () => {
  it("creates a renamed haren repo in a new workspace", async () => {
    await repo("backend", "git@github.com:acme/b.git");
    await repo("frontend");
    const r = await haren([
      "init",
      "--yes",
      "--haren-dir",
      "rules",
      "--project",
      "shop",
      "--mode",
      "explore",
    ]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("multi-repo workspace");
    expect(hasGitDir(join(ws, "rules"))).toBe(true);
    const m = parseManifest(await readFile(join(ws, "rules", "manifest.yaml"), "utf-8"));
    expect(m.layout).toBe("workspace");
    // --yes selects only repos with a remote
    expect(normalizeRepos(m.repos)).toEqual({
      backend: { path: "../backend", remote: "git@github.com:acme/b.git" },
    });
    expect(await readFile(join(ws, "CLAUDE.md"), "utf-8")).toContain("rules/skill.md");
    expect(await readFile(join(ws, "rules", "skill.md"), "utf-8")).not.toMatch(/(^|[^\w])haren\//);
  });

  it("prints the plan and writes nothing with --dry-run", async () => {
    await repo("backend", "git@github.com:acme/b.git");
    const r = await haren(["init", "--yes", "--dry-run"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Plan:");
    expect(existsSync(join(ws, "haren"))).toBe(false);
  });

  it("refuses to apply without a TTY and without --yes", async () => {
    await repo("backend", "git@github.com:acme/b.git");
    const r = await haren([
      "init",
      "--project",
      "p",
      "--mode",
      "explore",
      "--language",
      "English",
      "--editor",
      "claude-code",
      "--haren-dir",
      "haren",
    ]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("Re-run with --yes");
    expect(existsSync(join(ws, "haren"))).toBe(false);
  });

  it("keeps the monorepo behavior", async () => {
    await gitInit(ws);
    const r = await haren(["init", "--yes"]);
    expect(r.code).toBe(0);
    expect(parseManifest(await readFile(join(ws, "haren", "manifest.yaml"), "utf-8")).layout).toBe(
      "monorepo",
    );
    expect(hasGitDir(join(ws, "haren"))).toBe(false);
  });

  it("setup mode clones missing repos for a teammate", async () => {
    // Source repo to clone from
    const src = join(ws, "origin-backend");
    await mkdir(src);
    await gitInit(src);
    await runGit(
      ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-m", "init"],
      src,
    );
    // Teammate workspace that only has the haren repo
    const team = join(ws, "team");
    await mkdir(team);
    const first = await haren(
      ["init", "--yes", "--layout", "workspace", "--haren-dir", "rules"],
      team,
    );
    expect(first.code).toBe(0);
    const manifestPath = join(team, "rules", "manifest.yaml");
    const text = await readFile(manifestPath, "utf-8");
    await Bun.write(
      manifestPath,
      text.replace(
        /repos:[\s\S]*?\n\n/,
        `repos:\n  backend:\n    path: ../backend\n    remote: ${src}\n\n`,
      ),
    );
    await rm(join(team, "CLAUDE.md"));

    const r = await haren(["init", "--yes"], team);
    expect(r.code).toBe(0);
    expect(hasGitDir(join(team, "backend"))).toBe(true);
    expect(existsSync(join(team, "CLAUDE.md"))).toBe(true);

    const again = await haren(["init", "--yes"], team);
    expect(again.code).toBe(0);
    expect(again.out).toContain("Already set up");
  });

  it("errors when two haren folders exist", async () => {
    for (const name of ["a", "b"]) {
      await mkdir(join(ws, name));
      await Bun.write(join(ws, name, "manifest.yaml"), `haren:\n  version: "1.2.0"\n`);
    }
    const r = await haren(["init", "--yes"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("--haren-dir");
  });

  it("--force keeps the monorepo layout and does not git init haren/", async () => {
    await gitInit(ws);
    expect((await haren(["init", "--yes"])).code).toBe(0);
    const r = await haren(["init", "--yes", "--force"]);
    expect(r.code).toBe(0);
    expect(parseManifest(await readFile(join(ws, "haren", "manifest.yaml"), "utf-8")).layout).toBe(
      "monorepo",
    );
    expect(existsSync(join(ws, "haren", ".git"))).toBe(false);
  });

  it("--force keeps a renamed folder and its tracked repos", async () => {
    await repo("backend", "git@github.com:acme/b.git");
    expect((await haren(["init", "--yes", "--haren-dir", "rules"])).code).toBe(0);
    const r = await haren(["init", "--yes", "--force"]);
    expect(r.code).toBe(0);
    expect(existsSync(join(ws, "haren"))).toBe(false);
    const m = parseManifest(await readFile(join(ws, "rules", "manifest.yaml"), "utf-8"));
    expect(m.layout).toBe("workspace");
    expect(normalizeRepos(m.repos)).toEqual({
      backend: { path: "../backend", remote: "git@github.com:acme/b.git" },
    });
  });

  it("does not create --dir when the plan is not applied", async () => {
    const target = join(ws, "new-ws");
    const r = await haren([
      "init",
      "--dir",
      target,
      "--project",
      "p",
      "--mode",
      "explore",
      "--language",
      "English",
      "--editor",
      "claude-code",
      "--haren-dir",
      "haren",
    ]);
    expect(r.code).toBe(1);
    expect(existsSync(target)).toBe(false);
  });

  async function forceWorkspace(remote: string): Promise<string> {
    const team = join(ws, "team");
    await mkdir(team);
    const first = await haren(
      ["init", "--yes", "--layout", "workspace", "--haren-dir", "rules"],
      team,
    );
    expect(first.code).toBe(0);
    const manifestPath = join(team, "rules", "manifest.yaml");
    const text = await readFile(manifestPath, "utf-8");
    await Bun.write(
      manifestPath,
      text.replace(
        /repos:[\s\S]*?\n\n/,
        `repos:\n  backend:\n    path: ../backend\n    remote: ${remote}\n\n`,
      ),
    );
    return team;
  }

  it("--force clones missing repos in a workspace", async () => {
    const src = join(ws, "origin-backend");
    await mkdir(src);
    await gitInit(src);
    await runGit(
      ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-m", "init"],
      src,
    );
    const team = await forceWorkspace(src);
    const r = await haren(["init", "--yes", "--force"], team);
    expect(r.code).toBe(0);
    expect(hasGitDir(join(team, "backend"))).toBe(true);
  });

  it("--force exits 1 after writing files when a clone fails", async () => {
    const team = await forceWorkspace(join(ws, "does-not-exist"));
    await rm(join(team, "CLAUDE.md"));
    const r = await haren(["init", "--yes", "--force"], team);
    expect(r.code).toBe(1);
    expect(r.err).toContain("failed to clone: backend");
    expect(existsSync(join(team, "CLAUDE.md"))).toBe(true);
  });

  it("refuses to set up the home folder unless --force is given", async () => {
    const args = ["init", "--dir", ws, "--yes", "--project", "p", "--mode", "explore"];
    const r = await haren(args, ws, { HOME: ws });
    expect(r.code).toBe(1);
    expect(r.err).toContain("Refusing to set up haren in your home folder");
    expect(existsSync(join(ws, "CLAUDE.md"))).toBe(false);

    const forced = await haren([...args, "--force"], ws, { HOME: ws });
    expect(forced.code).toBe(0);
    expect(existsSync(join(ws, "CLAUDE.md"))).toBe(true);
  });
});
