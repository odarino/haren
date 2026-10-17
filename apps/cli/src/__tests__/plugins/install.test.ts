import { describe, expect, it } from "bun:test";
import { existsSync } from "fs";
import { mkdir, mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  installPlugin,
  refreshPlugins,
  removeEditorCopies,
  removePlugin,
} from "../../plugins/install";
import { pluginFiles } from "../../workspace/root-files";
import { readPlugins } from "../../plugins/state";

const fixtures = join(import.meta.dir, "fixtures");

async function ctx(confirmAnswer: boolean) {
  const workspaceDir = await mkdtemp(join(tmpdir(), "haren-inst-"));
  const harenDir = join(workspaceDir, "haren");
  await mkdir(harenDir);
  const lines: string[] = [];
  return {
    workspaceDir,
    harenDir,
    project: "shop",
    lines,
    io: { confirm: async () => confirmAnswer, log: (l: string) => lines.push(l) },
  };
}

describe("installPlugin", () => {
  it("asks before installing an unofficial source and records it", async () => {
    const c = await ctx(true);
    const m = await installPlugin(`file:${join(fixtures, "hello")}`, c);
    expect(m.name).toBe("hello");
    expect(c.lines.join("\n")).toContain("not in the haren registry");
    expect(existsSync(join(c.harenDir, ".plugins", "hello", "haren-plugin.json"))).toBe(true);
    expect((await readPlugins(c.harenDir)).plugins.hello).toMatchObject({
      version: "0.1.0",
      enabled: true,
    });
  });
  it("stops when the user declines", async () => {
    const c = await ctx(false);
    await expect(installPlugin(`file:${join(fixtures, "hello")}`, c)).rejects.toThrow("cancelled");
    expect((await readPlugins(c.harenDir)).plugins).toEqual({});
  });
  it("removes a plugin", async () => {
    const c = await ctx(true);
    await installPlugin(`file:${join(fixtures, "hello")}`, c);
    await removePlugin("hello", c);
    expect(existsSync(join(c.harenDir, ".plugins", "hello"))).toBe(false);
    expect((await readPlugins(c.harenDir)).plugins).toEqual({});
  });
  it("keeps the plugin data folder on remove", async () => {
    const c = await ctx(true);
    await installPlugin(`file:${join(fixtures, "hello")}`, c);
    const data = join(c.harenDir, ".plugin-data", "hello");
    await mkdir(data, { recursive: true });
    await writeFile(join(data, "state.json"), "{}");
    await removePlugin("hello", c);
    expect(existsSync(join(data, "state.json"))).toBe(true);
  });
  it("fails when a required bin is missing and has no install command", async () => {
    const c = await ctx(true);
    await expect(installPlugin(`file:${join(fixtures, "needs-tool")}`, c)).rejects.toThrow(
      "haren-test-missing-bin is required: missing",
    );
  });
});

describe("installPlugin failure safety", () => {
  it("leaves no folder when requirements fail", async () => {
    const c = await ctx(true);
    await expect(installPlugin(`file:${join(fixtures, "needs-tool")}`, c)).rejects.toThrow();
    expect(existsSync(join(c.harenDir, ".plugins", "needs-tool"))).toBe(false);
    expect(existsSync(join(c.harenDir, ".plugins", ".incoming"))).toBe(false);
    expect((await readPlugins(c.harenDir)).plugins).toEqual({});
  });
  it("keeps the old install when a reinstall fails", async () => {
    const c = await ctx(true);
    const src = await mkdtemp(join(tmpdir(), "haren-src-"));
    const manifest = (extra: object) =>
      JSON.stringify({ name: "flaky", version: "1.0.0", harenApi: "1", ...extra });
    await Bun.write(join(src, "haren-plugin.json"), manifest({}));
    await installPlugin(`file:${src}`, c);
    await Bun.write(
      join(src, "haren-plugin.json"),
      JSON.stringify({ name: "flaky", version: "2.0.0", harenApi: "1", setup: ["exit 3"] }),
    );
    await expect(installPlugin(`file:${src}`, c)).rejects.toThrow();
    const kept = await Bun.file(join(c.harenDir, ".plugins", "flaky", "haren-plugin.json")).text();
    expect(kept).toContain("1.0.0");
    expect((await readPlugins(c.harenDir)).plugins.flaky.version).toBe("1.0.0");
  });
});

describe("removeEditorCopies", () => {
  it("deletes only the removed plugin's own copies", async () => {
    const c = await ctx(true);
    await installPlugin(`file:${join(fixtures, "hello")}`, c);
    const own = join(c.workspaceDir, ".claude", "skills", "hello-greet");
    const mine = join(c.workspaceDir, ".cursor", "skills", "hello-greet");
    const user = join(c.workspaceDir, ".claude", "skills", "hello-custom");
    for (const d of [own, mine, user]) {
      await mkdir(d, { recursive: true });
      await Bun.write(join(d, "SKILL.md"), "x");
    }
    const copies = await pluginFiles(c.harenDir, "hello");
    expect(copies.map((f) => f.path)).toEqual(["skills/hello-greet/SKILL.md"]);
    await removePlugin("hello", c);
    await removeEditorCopies(c.workspaceDir, copies);
    expect(existsSync(own)).toBe(false);
    expect(existsSync(mine)).toBe(false);
    expect(existsSync(user)).toBe(true);
  });
});

describe("refreshPlugins", () => {
  it("keeps the old copy when the manifest name changes", async () => {
    const c = await ctx(true);
    const src = await mkdtemp(join(tmpdir(), "haren-src-"));
    const write = (name: string, version: string) =>
      Bun.write(join(src, "haren-plugin.json"), JSON.stringify({ name, version, harenApi: "1" }));
    await write("renamer", "1.0.0");
    await installPlugin(`file:${src}`, c);
    await write("other", "2.0.0");
    const warnings = await refreshPlugins(c);
    expect(warnings).toEqual(["plugin renamer: kept 1.0.0: manifest name changed to other"]);
    expect(existsSync(join(c.harenDir, ".plugins", "other"))).toBe(false);
    expect(existsSync(join(c.harenDir, ".plugins", ".incoming"))).toBe(false);
    expect((await readPlugins(c.harenDir)).plugins.renamer.version).toBe("1.0.0");
  });
  it("keeps the plugin data folder on refresh", async () => {
    const c = await ctx(true);
    await installPlugin(`file:${join(fixtures, "hello")}`, c);
    const data = join(c.harenDir, ".plugin-data", "hello");
    await mkdir(data, { recursive: true });
    await writeFile(join(data, "state.json"), "{}");
    await refreshPlugins(c);
    expect(existsSync(join(data, "state.json"))).toBe(true);
  });
});

describe("removeEditorCopies containment", () => {
  it("does not delete outside the editor group folder", async () => {
    const c = await ctx(true);
    const victim = join(c.workspaceDir, ".claude", "keep.txt");
    await mkdir(join(c.workspaceDir, ".claude"), { recursive: true });
    await Bun.write(victim, "x");
    const outer = join(c.workspaceDir, "..", "outside-victim.md");
    await Bun.write(outer, "x");
    await removeEditorCopies(c.workspaceDir, [
      { path: "agents/../../keep.txt" },
      { path: "agents/../../../outside-victim.md" },
      { path: "skills/../../keep.txt/SKILL.md" },
    ]);
    expect(existsSync(victim)).toBe(true);
    expect(existsSync(outer)).toBe(true);
  });
});
