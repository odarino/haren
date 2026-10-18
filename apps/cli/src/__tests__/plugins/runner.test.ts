import { describe, expect, it } from "bun:test";
import { existsSync } from "fs";
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
    expect(
      await runHook("session-start", {}, { workspaceDir: dir, harenDir: join(dir, "haren") }),
    ).toEqual([]);
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
    expect(lines.join("\n")).toContain(`data=${join(ws.harenDir, ".plugin-data", "updater")}`);
    expect(existsSync(join(ws.harenDir, ".plugin-data", "updater"))).toBe(true);
    const progress = JSON.parse(await readFile(join(ws.harenDir, "progress.json"), "utf-8"));
    expect(progress.modules.checkout.features["task-1-add-cart-api"]).toBe("in-progress");
  });
  it("runs the hook of an npm-style plugin whose version lives in package.json", async () => {
    const ws = await workspace(["npmlike"]);
    const out = await runHook("session-start", {}, ws);
    expect(out[0]!.error).toBeUndefined();
    expect(out[0]!.ok).toBe(true);
    expect(out[0]!.messages).toEqual(["ok"]);
  });
  it("skips disabled plugins", async () => {
    const ws = await workspace(["updater"]);
    await writePlugins(ws.harenDir, {
      version: 1,
      plugins: {
        updater: { source: "file:updater", version: "0.0.1", enabled: false, config: {} },
      },
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
  describe("after-plan key alignment", () => {
    const tasksMd =
      "## Task 1: Add cart API\n\n**Description:** a\n**Dependencies:** none\n\n## Task 2: Cart UI & totals\n\n**Description:** b\n**Dependencies:** Task 1\n\n## Task 3: Pay\n\n**Description:** c\n**Dependencies:** Task 2\n";
    it("uses the existing feature key and adds missing tasks as pending", async () => {
      const ws = await workspace(["planecho"]);
      const pPath = join(ws.harenDir, "progress.json");
      const prog = JSON.parse(await readFile(pPath, "utf-8"));
      prog.modules.checkout.features = {
        "task-1-add-cart-api": "passing",
        "task-2-cart-ui-and-totals": "in-progress",
      };
      await writeFile(pPath, JSON.stringify(prog));
      await mkdir(join(ws.harenDir, "plans"), { recursive: true });
      await writeFile(join(ws.harenDir, "plans", "tasks.md"), tasksMd);
      const lines = await runHookAndApply(
        "after-plan",
        { module: "checkout", tasksFile: "plans/tasks.md" },
        ws,
      );
      expect(lines.join("\n")).toContain(
        "keys=task-1-add-cart-api,task-2-cart-ui-and-totals,task-3-pay",
      );
      const after = JSON.parse(await readFile(pPath, "utf-8"));
      expect(after.modules.checkout.features).toEqual({
        "task-1-add-cart-api": "passing",
        "task-2-cart-ui-and-totals": "in-progress",
        "task-3-pay": "pending",
      });
    });
    it("uses aligned keys in dependencies", async () => {
      const ws = await workspace(["planecho"]);
      const pPath = join(ws.harenDir, "progress.json");
      const prog = JSON.parse(await readFile(pPath, "utf-8"));
      prog.modules.checkout.features = { "task-2-cart-ui-and-totals": "pending" };
      await writeFile(pPath, JSON.stringify(prog));
      await writeFile(join(ws.harenDir, "tasks.md"), tasksMd);
      const lines = await runHookAndApply(
        "after-plan",
        { module: "checkout", tasksFile: "tasks.md" },
        ws,
      );
      expect(lines.join("\n")).toContain("deps=,task-1-add-cart-api,task-2-cart-ui-and-totals");
    });
    it("leaves progress.json byte-identical when nothing is added", async () => {
      const ws = await workspace(["planecho"]);
      const pPath = join(ws.harenDir, "progress.json");
      const prog = JSON.parse(await readFile(pPath, "utf-8"));
      prog.modules.checkout.features = { "task-1-add-cart-api": "pending" };
      const raw = JSON.stringify(prog);
      await writeFile(pPath, raw);
      await writeFile(
        join(ws.harenDir, "tasks.md"),
        "## Task 1: Add cart API\n\n**Description:** a\n",
      );
      await runHookAndApply("after-plan", { module: "checkout", tasksFile: "tasks.md" }, ws);
      expect(await readFile(pPath, "utf-8")).toBe(raw);
    });
    it("still runs the hook with computed keys when progress.json is corrupt", async () => {
      const ws = await workspace(["planecho"]);
      await writeFile(join(ws.harenDir, "progress.json"), "{not json");
      await writeFile(join(ws.harenDir, "tasks.md"), tasksMd);
      const lines = await runHookAndApply(
        "after-plan",
        { module: "checkout", tasksFile: "tasks.md" },
        ws,
      );
      expect(lines.join("\n")).toContain(
        "keys=task-1-add-cart-api,task-2-cart-ui-totals,task-3-pay",
      );
    });
    it("never creates a module", async () => {
      const ws = await workspace(["planecho"]);
      await writeFile(join(ws.harenDir, "tasks.md"), tasksMd);
      await runHookAndApply("after-plan", { module: "ghost", tasksFile: "tasks.md" }, ws);
      const after = JSON.parse(await readFile(join(ws.harenDir, "progress.json"), "utf-8"));
      expect(Object.keys(after.modules)).toEqual(["checkout"]);
    });
  });
});
