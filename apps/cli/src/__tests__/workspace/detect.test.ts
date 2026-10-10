import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { detectLayout, inferLayout } from "../../workspace/detect";
import { gitInit } from "../../workspace/git";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "haren-detect-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("detectLayout", () => {
  it("returns existing when a marker folder exists", async () => {
    await mkdir(join(root, "rules"));
    await writeFile(join(root, "rules", "manifest.yaml"), `haren:\n  version: "1.2.0"\n`);
    const d = await detectLayout(root);
    expect(d.kind).toBe("existing");
    expect(d.location?.harenDir).toBe(join(root, "rules"));
  });

  it("returns monorepo for a missing folder inside a git work tree", async () => {
    await gitInit(root);
    expect((await detectLayout(join(root, "new", "sub"))).kind).toBe("monorepo");
  });

  it("returns monorepo when the folder is inside a git work tree", async () => {
    await gitInit(root);
    expect((await detectLayout(root)).kind).toBe("monorepo");
  });

  it("returns workspace-new when children are git repos", async () => {
    await mkdir(join(root, "backend"));
    await gitInit(join(root, "backend"));
    const d = await detectLayout(root);
    expect(d.kind).toBe("workspace-new");
    expect(d.childRepos.map((r) => r.name)).toEqual(["backend"]);
  });

  it("returns unknown for an empty folder", async () => {
    expect((await detectLayout(root)).kind).toBe("unknown");
  });

  it("returns workspace-new for a workspace under an unrelated outer repo", async () => {
    await gitInit(root);
    const ws = join(root, "ws");
    await mkdir(join(ws, "backend"), { recursive: true });
    await gitInit(join(ws, "backend"));
    expect((await detectLayout(ws)).kind).toBe("workspace-new");
  });

  it("returns monorepo for a plain subfolder of a repo", async () => {
    await gitInit(root);
    await mkdir(join(root, "tools"));
    expect((await detectLayout(join(root, "tools"))).kind).toBe("monorepo");
  });

  it("returns monorepo when the folder has .git and child repos", async () => {
    await gitInit(root);
    await mkdir(join(root, "backend"));
    await gitInit(join(root, "backend"));
    expect((await detectLayout(root)).kind).toBe("monorepo");
  });

  it("returns existing for a marker folder inside a git repo", async () => {
    await gitInit(root);
    await mkdir(join(root, "rules"));
    await writeFile(join(root, "rules", "manifest.yaml"), `haren:\n  version: "1.2.0"\n`);
    const d = await detectLayout(root);
    expect(d.kind).toBe("existing");
    expect(d.location?.harenDir).toBe(join(root, "rules"));
  });
});

describe("inferLayout", () => {
  it("returns monorepo with no child repos for a folder with .git", async () => {
    await gitInit(root);
    await mkdir(join(root, "backend"));
    await gitInit(join(root, "backend"));
    expect(await inferLayout(root)).toEqual({ layout: "monorepo", childRepos: [] });
  });

  it("returns workspace with the child repos", async () => {
    await mkdir(join(root, "api"));
    await gitInit(join(root, "api"));
    const res = await inferLayout(root);
    expect(res.layout).toBe("workspace");
    expect(res.childRepos).toEqual([{ name: "api", path: join(root, "api"), remote: null }]);
  });

  it("returns monorepo for a missing folder inside a work tree", async () => {
    await gitInit(root);
    expect(await inferLayout(join(root, "a", "b"))).toEqual({ layout: "monorepo", childRepos: [] });
  });

  it("returns null for an empty folder outside git", async () => {
    expect(await inferLayout(root)).toEqual({ layout: null, childRepos: [] });
  });
});
