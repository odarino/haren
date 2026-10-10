import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "fs/promises";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { gitInit, runGit } from "../../workspace/git";
import { parseManifest, normalizeRepos, hasMarker } from "../../workspace/manifest";
import { planMigration } from "../../commands/upgrade";
import { brainstormGateScript } from "../../workspace/templates";

const CLI = resolve(import.meta.dir, "..", "..", "index.ts");
let ws: string;

beforeEach(async () => {
  ws = await mkdtemp(join(tmpdir(), "haren-upg-"));
});
afterEach(async () => {
  await rm(ws, { recursive: true, force: true });
});

async function legacyWorkspace(): Promise<string> {
  await mkdir(join(ws, "backend"));
  await gitInit(join(ws, "backend"));
  await runGit(["remote", "add", "origin", "git@github.com:acme/b.git"], join(ws, "backend"));
  const haren = join(ws, "haren");
  await mkdir(join(haren, "artifacts", "03-modules", "checkout"), { recursive: true });
  await writeFile(join(haren, "skill.md"), "# Haren");
  await writeFile(
    join(haren, "manifest.yaml"),
    "project: shop\nmode: explore\n\nrepos:\n  - ../backend\n",
  );
  await writeFile(
    join(haren, "progress.json"),
    JSON.stringify({
      project: "shop",
      version: 1,
      modules: { checkout: { status: "implementing", lastCommit: "abc" } },
    }),
  );
  await writeFile(
    join(haren, "artifacts", "03-modules", "checkout", "module.md"),
    "---\nrepos: [backend]\n---\n",
  );
  await writeFile(join(ws, "CLAUDE.md"), "# Mine\n\n## Haren Framework\n\nRead `haren/skill.md`\n");
  return haren;
}

describe("planMigration", () => {
  it("plans marker, layout, repo map, progress v2 and root files", async () => {
    const haren = await legacyWorkspace();
    const plan = await planMigration({ harenDir: haren, workspaceDir: ws, legacy: true });
    const m = parseManifest(plan.manifest.after);
    expect(hasMarker(m)).toBe(true);
    expect(m.layout).toBe("workspace");
    expect(normalizeRepos(m.repos)).toEqual({
      backend: { path: "../backend", remote: "git@github.com:acme/b.git" },
    });
    expect(JSON.parse(plan.progress!.after).modules.checkout.lastCommit).toEqual({
      backend: "abc",
    });
    expect(plan.editor).toBe("claude-code");
  });

  it("reports a corrupt progress.json with its path", async () => {
    const haren = await legacyWorkspace();
    await writeFile(join(haren, "progress.json"), "{nope");
    await expect(
      planMigration({ harenDir: haren, workspaceDir: ws, legacy: true }),
    ).rejects.toThrow(/^Invalid JSON in .*progress\.json: .*\. Fix the file and run again\.$/);
  });

  it("adds a step when only the version marker changes", async () => {
    const haren = await legacyWorkspace();
    const first = await planMigration({ harenDir: haren, workspaceDir: ws, legacy: true });
    await writeFile(
      join(haren, "manifest.yaml"),
      first.manifest.after.replace(/version: "[^"]*"/, 'version: "0.0.1"'),
    );
    await writeFile(join(haren, "progress.json"), first.progress!.after);
    const plan = await planMigration({ harenDir: haren, workspaceDir: ws, legacy: false });
    expect(plan.manifest.after).not.toBe(plan.manifest.before);
    expect(plan.steps).toContain("manifest.yaml: update version marker");
    expect(plan.steps).not.toContain("manifest.yaml: add version marker");
  });

  it("detects a monorepo", async () => {
    await gitInit(ws);
    const haren = await legacyWorkspace();
    const plan = await planMigration({ harenDir: haren, workspaceDir: ws, legacy: true });
    expect(parseManifest(plan.manifest.after).layout).toBe("monorepo");
  });
});

async function runUpgrade(cwd = ws): Promise<number> {
  const proc = Bun.spawn(["bun", CLI, "upgrade"], { cwd, stdout: "pipe", stderr: "pipe" });
  return proc.exited;
}

async function snapshot(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const p of paths) out[p] = await readFile(p, "utf-8");
  return out;
}

describe("upgrade repeat runs", () => {
  it("does not add a repos step when a repo has no remote and no list is given", async () => {
    const haren = await legacyWorkspace();
    await runGit(["remote", "remove", "origin"], join(ws, "backend"));
    expect(await runUpgrade()).toBe(0);
    const manifestPath = join(haren, "manifest.yaml");
    const before = await readFile(manifestPath, "utf-8");
    expect(normalizeRepos(parseManifest(before).repos)).toEqual({
      backend: { path: "../backend" },
    });
    const plan = await planMigration({ harenDir: haren, workspaceDir: ws, legacy: false });
    expect(plan.steps).not.toContain("manifest.yaml: convert repos to a map with remotes");
    expect(plan.manifest.after).toBe(before);
    expect(await runUpgrade()).toBe(0);
    expect(await readFile(manifestPath, "utf-8")).toBe(before);
  });

  it("a second run on a legacy monorepo has no steps and changes no bytes", async () => {
    await gitInit(ws);
    const haren = await legacyWorkspace();
    await writeFile(join(haren, "FEEDBACK.md"), "# Feedback\n\nmine\n");
    await writeFile(join(haren, "artifacts", "03-modules", "checkout", "spec.md"), "spec\n");
    const userFiles = [
      join(haren, "FEEDBACK.md"),
      join(haren, "artifacts", "03-modules", "checkout", "spec.md"),
      join(haren, "artifacts", "03-modules", "checkout", "module.md"),
    ];
    const userBefore = await snapshot(userFiles);
    expect(await runUpgrade()).toBe(0);
    expect(await snapshot(userFiles)).toEqual(userBefore);

    const tracked = [
      join(haren, "manifest.yaml"),
      join(haren, "progress.json"),
      join(haren, ".gitignore"),
      join(ws, "CLAUDE.md"),
      join(ws, ".claude", "settings.json"),
      join(ws, ".claude", "skills", "haren-onboard", "SKILL.md"),
    ];
    const first = await snapshot(tracked);
    const plan = await planMigration({ harenDir: haren, workspaceDir: ws, legacy: false });
    expect(plan.steps).toEqual([]);
    expect(await runUpgrade()).toBe(0);
    expect(await snapshot(tracked)).toEqual(first);
    expect(await snapshot(userFiles)).toEqual(userBefore);
  });
});

describe("upgrade .gitignore", () => {
  it("creates .gitignore with the agent files as a migration step", async () => {
    const haren = await legacyWorkspace();
    const plan = await planMigration({ harenDir: haren, workspaceDir: ws, legacy: true });
    expect(plan.steps).toContain(".gitignore: add .agent.json, .agent.pid");
    expect(await runUpgrade()).toBe(0);
    expect(await readFile(join(haren, ".gitignore"), "utf-8")).toBe(".agent.json\n.agent.pid\n");
  });

  it("appends only the missing lines to an existing .gitignore", async () => {
    const haren = await legacyWorkspace();
    await writeFile(join(haren, ".gitignore"), "node_modules\n.agent.json");
    expect(await runUpgrade()).toBe(0);
    expect(await readFile(join(haren, ".gitignore"), "utf-8")).toBe(
      "node_modules\n.agent.json\n.agent.pid\n",
    );
  });

  it("adds no step when .gitignore already lists both files", async () => {
    const haren = await legacyWorkspace();
    await writeFile(join(haren, ".gitignore"), ".agent.pid\n.agent.json\n");
    const plan = await planMigration({ harenDir: haren, workspaceDir: ws, legacy: true });
    expect(plan.steps.some((s) => s.startsWith(".gitignore"))).toBe(false);
  });
});

describe("haren upgrade", () => {
  it("--dry-run writes nothing", async () => {
    const haren = await legacyWorkspace();
    const before = await readFile(join(haren, "manifest.yaml"), "utf-8");
    const proc = Bun.spawn(["bun", CLI, "upgrade", "--dry-run"], {
      cwd: ws,
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(out).toContain("add version marker");
    expect(await readFile(join(haren, "manifest.yaml"), "utf-8")).toBe(before);
  });

  it("migrates and keeps user text in CLAUDE.md", async () => {
    const haren = await legacyWorkspace();
    const proc = Bun.spawn(["bun", CLI, "upgrade"], { cwd: ws, stdout: "pipe", stderr: "pipe" });
    expect(await proc.exited).toBe(0);
    expect(hasMarker(parseManifest(await readFile(join(haren, "manifest.yaml"), "utf-8")))).toBe(
      true,
    );
    const claudeMd = await readFile(join(ws, "CLAUDE.md"), "utf-8");
    expect(claudeMd.startsWith("# Mine\n\n<!-- haren:begin -->")).toBe(true);
    expect(JSON.parse(await readFile(join(haren, "progress.json"), "utf-8")).version).toBe(2);
  });

  it("does not list files it changes as protected", async () => {
    await legacyWorkspace();
    const proc = Bun.spawn(["bun", CLI, "upgrade", "--dry-run"], {
      cwd: ws,
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    const protectedPart = out.slice(out.indexOf("Protected"), out.indexOf("Upgrading"));
    expect(protectedPart).toContain("artifacts/");
    for (const f of ["manifest.yaml", "progress.json", "skill.md"]) {
      expect(protectedPart).not.toContain(f);
    }
  });

  it("replaces an old brainstorm gate script", async () => {
    const haren = await legacyWorkspace();
    await mkdir(join(haren, "hooks"));
    const gate = join(haren, "hooks", "brainstorm-gate.ts");
    await writeFile(gate, 'if (filePath.includes("/haren/")) allow();\n');
    const dry = Bun.spawn(["bun", CLI, "upgrade", "--dry-run"], {
      cwd: ws,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await new Response(dry.stdout).text()).toContain("hooks/brainstorm-gate.ts");
    expect(await dry.exited).toBe(0);
    const proc = Bun.spawn(["bun", CLI, "upgrade"], { cwd: ws, stdout: "pipe", stderr: "pipe" });
    expect(await proc.exited).toBe(0);
    expect(await readFile(gate, "utf-8")).toBe(brainstormGateScript);
  });
});
