import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { readPlugins, writePlugins } from "../../plugins/state";

describe("plugins.json", () => {
  it("returns an empty file when missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "haren-state-"));
    expect(await readPlugins(dir)).toEqual({ version: 1, plugins: {} });
  });
  it("round-trips entries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "haren-state-"));
    const data = {
      version: 1 as const,
      plugins: { backlog: { source: "npm:x", version: "1.0.0", enabled: true, config: {} } },
    };
    await writePlugins(dir, data);
    expect(await readPlugins(dir)).toEqual(data);
    expect((await readFile(join(dir, "plugins.json"), "utf-8")).endsWith("\n")).toBe(true);
  });
});
