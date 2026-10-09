import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { resolveHarenDir, MultipleHarenDirsError } from "../../workspace/resolve";

const MARKED = `haren:\n  version: "1.2.0"\nproject: x\n`;
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "haren-resolve-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function folder(name: string, manifest: string | null, skillMd = false): Promise<string> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  if (manifest !== null) await writeFile(join(dir, "manifest.yaml"), manifest);
  if (skillMd) await writeFile(join(dir, "skill.md"), "# Haren");
  return dir;
}

describe("resolveHarenDir", () => {
  it("finds a renamed haren folder among children by marker", async () => {
    await folder("backend", null);
    const dir = await folder("cmis_ai_rules", MARKED);
    expect(await resolveHarenDir(root)).toEqual({
      harenDir: dir,
      workspaceDir: root,
      legacy: false,
    });
  });

  it("finds the marker in cwd", async () => {
    const dir = await folder("haren", MARKED);
    expect(await resolveHarenDir(dir)).toEqual({
      harenDir: dir,
      workspaceDir: root,
      legacy: false,
    });
  });

  it("throws when two children have the marker", async () => {
    await folder("a", MARKED);
    await folder("b", MARKED);
    const err = await resolveHarenDir(root).catch((e) => e);
    expect(err).toBeInstanceOf(MultipleHarenDirsError);
    expect((err as MultipleHarenDirsError).matches).toEqual([join(root, "a"), join(root, "b")]);
  });

  it("uses the explicit option, then HAREN_DIR", async () => {
    await folder("a", MARKED);
    const b = await folder("b", MARKED);
    expect((await resolveHarenDir(root, { harenDir: "b" }))?.harenDir).toBe(b);
    expect((await resolveHarenDir(root, { env: { HAREN_DIR: b } }))?.harenDir).toBe(b);
  });

  it("throws when the explicit folder has no manifest", async () => {
    await expect(resolveHarenDir(root, { harenDir: "nope" })).rejects.toThrow("No manifest.yaml");
  });

  it("falls back to a legacy haren folder", async () => {
    const dir = await folder("haren", "project: x\n", true);
    expect(await resolveHarenDir(root)).toEqual({
      harenDir: dir,
      workspaceDir: root,
      legacy: true,
    });
  });

  it("ignores a manifest.yaml without marker and without skill.md", async () => {
    await folder("other", "name: not-haren\n");
    await folder("haren", "project: x\n");
    expect(await resolveHarenDir(root)).toBeNull();
  });
});
