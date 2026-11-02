import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { readAdapter } from "../../plugins/adapter-read";
import { pluginDir } from "../../plugins/state";

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

async function workspace(manifest?: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "haren-adapter-spec-"));
  dirs.push(dir);
  if (manifest === undefined) return dir;
  await writeFile(
    join(dir, "plugins.json"),
    JSON.stringify({
      version: 1,
      plugins: { sample: { source: "x", version: "0.1.0", enabled: true, config: {} } },
    }),
  );
  await mkdir(pluginDir(dir, "sample"), { recursive: true });
  await writeFile(
    join(pluginDir(dir, "sample"), "haren-plugin.json"),
    typeof manifest === "string" ? manifest : JSON.stringify(manifest),
  );
  return dir;
}

describe("readAdapter", () => {
  it("returns null when the plugin is not installed", async () => {
    expect(await readAdapter(await workspace(), "sample")).toBeNull();
  });
  it("returns null when the plugin has no adapter block", async () => {
    const dir = await workspace({ name: "sample", version: "0.1.0", harenApi: "2" });
    expect(await readAdapter(dir, "sample")).toBeNull();
  });
  it("returns the adapter block", async () => {
    const dir = await workspace({
      name: "sample",
      version: "0.1.0",
      harenApi: "2",
      adapter: { unitKind: "screen", commands: { gate: "y {specPath}" } },
    });
    expect((await readAdapter(dir, "sample"))?.commands.gate).toBe("y {specPath}");
  });
  it("throws when the manifest is broken", async () => {
    const dir = await workspace("{ not json");
    await expect(readAdapter(dir, "sample")).rejects.toThrow(/Adapter plugin 'sample'/);
  });
});
