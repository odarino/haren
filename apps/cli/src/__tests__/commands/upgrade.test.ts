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
