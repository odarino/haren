import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { track, upsertArtifactRow } from "../../commands/track";
import { parseArgs } from "../../index";

let root: string;
let harenDir: string;

const REGISTRY = `# Artifact Index

Master registry of all artifacts in this Haren workspace.

| ID | Type | Module | Status | Path |
|----|------|--------|--------|------|
`;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "haren-track-"));
  harenDir = join(root, "haren");
  await mkdir(join(harenDir, "artifacts", "_registry"), { recursive: true });
  await mkdir(join(harenDir, "events"), { recursive: true });
  await writeFile(join(harenDir, "manifest.yaml"), 'haren:\n  version: "1.3.3"\n');
  await writeFile(
    join(harenDir, "progress.json"),
    JSON.stringify({
      project: "shop",
      version: 2,
      phase: "plan",
      currentIteration: 3,
      modules: {
        checkout: { status: "planned", currentPhase: "plan", features: { pay: "pending" } },
      },
      dependencies: {},
    }),
  );
  await writeFile(join(harenDir, "artifacts", "_registry", "artifact-index.md"), REGISTRY);
  await writeFile(join(harenDir, "events", "events.jsonl"), "");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = (...args: string[]) => track(args, root);
const progress = async () => JSON.parse(await readFile(join(harenDir, "progress.json"), "utf-8"));
const events = async () =>
  (await readFile(join(harenDir, "events", "events.jsonl"), "utf-8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

describe("haren track", () => {
  it("is wired in the CLI", () => {
    expect(parseArgs(["track", "status", "a", "planned"])).toEqual({
      command: "track",
      args: ["status", "a", "planned"],
    });
  });

  it("status: applies a valid transition and keeps unknown keys", async () => {
    await run("status", "checkout", "implementing");
    const p = await progress();
    expect(p.modules.checkout.status).toBe("implementing");
    expect(p.modules.checkout.currentPhase).toBe("implement");
    expect(p.phase).toBe("plan");
    expect(p.currentIteration).toBe(3);
    const [e] = await events();
    expect(e).toMatchObject({
      type: "module-status",
      module: "checkout",
      from: "planned",
      to: "implementing",
      phase: "implement",
    });
    expect(typeof e.timestamp).toBe("string");
  });

  it("status: rejects an invalid transition", async () => {
    await expect(run("status", "checkout", "completed")).rejects.toThrow(
      "Invalid module transition",
    );
  });

  it("status: creates a new module only at discovered or decomposed", async () => {
    await run("status", "cart", "discovered");
    const p = await progress();
    expect(p.modules.cart).toMatchObject({
      status: "discovered",
      currentPhase: "discover",
      features: {},
      lastCommit: {},
    });
    await expect(run("status", "other", "planned")).rejects.toThrow("Unknown module 'other'");
  });

  it("status: completed → released", async () => {
    const p = await progress();
    p.modules.checkout.status = "completed";
    await writeFile(join(harenDir, "progress.json"), JSON.stringify(p));
    await run("status", "checkout", "released");
    expect((await progress()).modules.checkout.currentPhase).toBe("release");
  });

  it("feature: adds a pending feature, then moves it", async () => {
    await run("feature", "checkout", "refund");
    expect((await progress()).modules.checkout.features.refund).toBe("pending");
    await expect(run("feature", "checkout", "refund")).rejects.toThrow("already exists");
    await run("feature", "checkout", "refund", "in-progress");
    expect((await progress()).modules.checkout.features.refund).toBe("in-progress");
    await expect(run("feature", "checkout", "refund", "passing")).rejects.toThrow(
      "Invalid feature transition",
    );
    const ev = await events();
    expect(ev[1]).toMatchObject({
      type: "feature-status",
      module: "checkout",
      feature: "refund",
      from: "pending",
      to: "in-progress",
    });
  });

  it("feature: rejects an unknown module", async () => {
    await expect(run("feature", "nope", "x")).rejects.toThrow("Unknown module 'nope'");
  });

  it("commit: records the sha, branch and repo", async () => {
    await run("commit", "checkout", "web", "abc123");
    await run("commit", "checkout", "web", "def456");
    const m = (await progress()).modules.checkout;
    expect(m.lastCommit).toEqual({ web: "def456" });
    expect(m.branch).toBe("feat/checkout");
    expect(m.repos).toEqual(["web"]);
    expect((await events())[0]).toMatchObject({ type: "commit", module: "checkout", repo: "web" });
  });

  it("artifact: appends then updates a registry row", async () => {
    await run(
      "artifact",
      "SPEC-1",
      "--type",
      "spec",
      "--path",
      "a/spec.md",
      "--module",
      "checkout",
    );
    await run("artifact", "PLAN-1", "--type", "plan", "--path", "a/plan.md");
    await run("artifact", "SPEC-1", "--type", "spec", "--path", "a/spec.md", "--status", "final");
    const text = await readFile(
      join(harenDir, "artifacts", "_registry", "artifact-index.md"),
      "utf-8",
    );
    expect(text).toContain("| SPEC-1 | spec | - | final | a/spec.md |");
    expect(text).toContain("| PLAN-1 | plan | - | draft | a/plan.md |");
    expect(text.match(/SPEC-1/g)?.length).toBe(1);
    expect(text.indexOf("SPEC-1")).toBeLessThan(text.indexOf("PLAN-1"));
    expect((await events())[0]).toMatchObject({
      type: "artifact",
      id: "SPEC-1",
      module: "checkout",
    });
  });

  it("artifact: needs --type and --path", async () => {
    await expect(run("artifact", "X", "--path", "p")).rejects.toThrow("--type");
  });

  it("upsertArtifactRow inserts after the last row, before trailing text", () => {
    const out = upsertArtifactRow(REGISTRY + "| A | t | m | s | p |\n\nNotes\n", [
      "B",
      "t",
      "-",
      "s",
      "q",
    ]);
    expect(out).toContain("| A | t | m | s | p |\n| B | t | - | s | q |\n\nNotes");
  });

  it("event: appends a raw event with data and validates phase", async () => {
    await run(
      "event",
      "eval-run",
      "--module",
      "checkout",
      "--phase",
      "evaluate",
      "--data",
      '{"attempt":2}',
    );
    expect((await events())[0]).toMatchObject({
      type: "eval-run",
      module: "checkout",
      phase: "evaluate",
      attempt: 2,
    });
    await expect(run("event", "x", "--phase", "coding")).rejects.toThrow("Invalid phase");
    await expect(run("event", "x", "--data", "[1]")).rejects.toThrow("JSON object");
  });

  it("override: on sets gateOverride with until, off removes it", async () => {
    await run("override", "on", "--reason", "hotfix login", "--hours", "1");
    const p = await progress();
    expect(p.gateOverride.reason).toBe("hotfix login");
    const until = Date.parse(p.gateOverride.until);
    expect(until).toBeGreaterThan(Date.now() + 3_500_000);
    expect(until).toBeLessThan(Date.now() + 3_700_000);
    await run("override", "off");
    const q = await progress();
    expect(q.gateOverride).toBeUndefined();
    expect(q.currentIteration).toBe(3);
    const ev = await events();
    expect(ev.map((e) => e.action)).toEqual(["on", "off"]);
    expect(ev[0].type).toBe("gate-override");
  });

  it("override: on needs --reason; default is 2 hours", async () => {
    await expect(run("override", "on")).rejects.toThrow("--reason");
    await run("override", "on", "--reason", "fix");
    const until = Date.parse((await progress()).gateOverride.until);
    expect(until).toBeGreaterThan(Date.now() + 7_100_000);
  });

  it("honors --haren-dir", async () => {
    await track(["--haren-dir", harenDir, "status", "checkout", "implementing"], tmpdir());
    expect((await progress()).modules.checkout.status).toBe("implementing");
  });
});
