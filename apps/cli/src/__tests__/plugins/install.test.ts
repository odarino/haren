import { describe, expect, it } from "bun:test";
import { existsSync } from "fs";
import { mkdir, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { installPlugin, removePlugin } from "../../plugins/install";
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
