import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { buildPlan, renderPlan, isNoop, type Plan } from "../../workspace/plan";
import { gitInit } from "../../workspace/git";
import { writeRootFiles } from "../../workspace/root-files";

describe("renderPlan", () => {
  it("renders a new workspace plan", () => {
    const plan: Plan = {
      rootDir: "~/projects/shop",
      harenDirName: "haren",
      layout: "workspace",
      createHaren: true,
      manifestPreview: "layout: workspace\nrepos:\n  backend:\n    path: ../backend\n",
      items: [
        { path: "CLAUDE.md", action: "create", note: "(generated, not versioned)" },
        { path: "backend", action: "keep" },
        { path: "frontend", action: "clone", remote: "git@github.com:acme/f.git" },
        { path: "scratch", action: "warn", note: "! not a git repo" },
      ],
    };
    expect(renderPlan(plan)).toMatchSnapshot();
  });
});

describe("buildPlan", () => {
  let ws: string;
  beforeEach(async () => {
    ws = await mkdtemp(join(tmpdir(), "haren-plan-"));
    await mkdir(join(ws, "rules"));
    await mkdir(join(ws, "backend"));
    await gitInit(join(ws, "backend"));
    await mkdir(join(ws, "notes"));
  });
  afterEach(async () => {
    await rm(ws, { recursive: true, force: true });
  });

  it("marks repos keep / clone / warn", async () => {
    const plan = await buildPlan({
      rootDir: ws,
      harenDir: join(ws, "rules"),
      layout: "workspace",
      createHaren: false,
      editor: "claude-code",
      repos: {
        backend: { path: "../backend" },
        frontend: { path: "../frontend", remote: "git@github.com:acme/f.git" },
        notes: { path: "../notes" },
        docs: { path: "../docs" },
      },
    });
    const byPath = Object.fromEntries(plan.items.map((i) => [i.path, i]));
    expect(byPath.backend.action).toBe("keep");
    expect(byPath.frontend.action).toBe("clone");
    expect(byPath.notes).toMatchObject({ action: "warn", note: "! not a git repo" });
    expect(byPath.docs).toMatchObject({ action: "warn", note: "! cannot clone, no remote" });
    expect(byPath["CLAUDE.md"]).toMatchObject({
      action: "create",
      note: "(generated, not versioned)",
    });
  });

  it("is a no-op when everything is in place", async () => {
    await writeRootFiles({ workspaceDir: ws, harenDir: join(ws, "rules"), editor: "claude-code" });
    const plan = await buildPlan({
      rootDir: ws,
      harenDir: join(ws, "rules"),
      layout: "workspace",
      createHaren: false,
      editor: "claude-code",
      repos: { backend: { path: "../backend" } },
    });
    expect(isNoop(plan)).toBe(true);
  });
});
