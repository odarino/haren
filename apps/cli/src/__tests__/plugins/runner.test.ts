import { describe, expect, it } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { runHook, runHookAndApply } from "../../plugins/runner";
import { writePlugins } from "../../plugins/state";

const fixtures = join(import.meta.dir, "fixtures");

async function workspace(names: string[]): Promise<{ workspaceDir: string; harenDir: string }> {
  const workspaceDir = await mkdtemp(join(tmpdir(), "haren-run-"));
  const harenDir = join(workspaceDir, "haren");
  await mkdir(join(harenDir, ".plugins"), { recursive: true });
  const plugins: Record<string, any> = {};
  for (const n of names) {
    await cp(join(fixtures, n), join(harenDir, ".plugins", n), { recursive: true });
    plugins[n] = { source: `file:${n}`, version: "0.0.1", enabled: true, config: { k: 1 } };
  }
  await writePlugins(harenDir, { version: 1, plugins });
  await writeFile(
    join(harenDir, "progress.json"),
    JSON.stringify({
      project: "p",
      version: 2,
      dependencies: {},
      modules: {
        checkout: {
          status: "implementing",
          currentPhase: "implement",
          features: { "task-1-add-cart-api": "pending" },
          lastCommit: {},
          lastUpdated: "x",
        },
      },
    }),
  );
  return { workspaceDir, harenDir };
}

describe("runHook", () => {
  it("returns no outcomes without plugins.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "haren-run-"));
    expect(await runHook("session-start", {}, { workspaceDir: dir, harenDir: join(dir, "haren") })).toEqual([]);
  });
  it("reports a failing, slow, and bad-json hook without throwing", async () => {
    const ws = await workspace(["fail", "slow", "badjson"]);
    const out = await runHook("session-start", {}, { ...ws, timeoutMs: 1000 });
    expect(out.map((o) => [o.plugin, o.ok])).toEqual([
      ["fail", false],
      ["slow", false],
      ["badjson", false],
    ]);
    expect(out[0]!.error).toContain("exit 3");
    expect(out[1]!.error).toContain("timed out");
    expect(out[2]!.error).toContain("invalid JSON");
    const log = await readFile(join(ws.harenDir, ".plugins", "fail", "errors.log"), "utf-8");
    expect(log).toContain("session-start");
  });
  it("passes payload and config, and applies updates", async () => {
    const ws = await workspace(["updater"]);
    const lines = await runHookAndApply("session-start", {}, ws);
    expect(lines.join("\n")).toContain('config={"k":1}');
    expect(lines.join("\n")).toContain("hook=session-start");
    const progress = JSON.parse(await readFile(join(ws.harenDir, "progress.json"), "utf-8"));
    expect(progress.modules.checkout.features["task-1-add-cart-api"]).toBe("in-progress");
  });
  it("skips disabled plugins", async () => {
    const ws = await workspace(["updater"]);
    await writePlugins(ws.harenDir, {
      version: 1,
      plugins: { updater: { source: "file:updater", version: "0.0.1", enabled: false, config: {} } },
    });
    expect(await runHook("session-start", {}, ws)).toEqual([]);
  });
  it("times out a compound command and does not hang on grandchildren", async () => {
    const ws = await workspace(["compound"]);
    const start = Date.now();
    const out = await runHook("session-start", {}, { ...ws, timeoutMs: 500 });
    expect(Date.now() - start).toBeLessThan(2500);
    expect(out[0]!.ok).toBe(false);
    expect(out[0]!.error).toContain("timed out");
  });
  it("turns a corrupt progress.json into a warning line", async () => {
    const ws = await workspace(["updater"]);
    await writeFile(join(ws.harenDir, "progress.json"), "{not json");
    const lines = await runHookAndApply("session-start", {}, ws);
    expect(lines.join("\n")).toContain("warning: could not apply plugin updates:");
  });
});
