import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { track, upsertArtifactRow } from "../../commands/track";
import { parseArgs } from "../../index";
import { buildManifestText } from "../../workspace/manifest";

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
    await run("commit", "checkout", "default", "abc123");
    await run("commit", "checkout", "default", "def456");
    const m = (await progress()).modules.checkout;
    expect(m.lastCommit).toEqual({ default: "def456" });
    expect(m.branch).toBe("feat/checkout");
    expect(m.repos).toEqual(["default"]);
    expect((await events())[0]).toMatchObject({ type: "commit", module: "checkout", repo: "default" });
  });

  it("check accepts 'default' when manifest repos is empty", async () => {
    await run("commit", "checkout", "default", "abc123");
    await expect(run("check")).resolves.toBeUndefined();
  });

  it("commit --remove drops a stale repo key", async () => {
    await run("commit", "checkout", "default", "abc123");
    await run("commit", "checkout", "default", "--remove");
    const m = (await progress()).modules.checkout;
    expect(m.lastCommit).toEqual({});
    expect(m.repos).toEqual([]);
    await expect(run("commit", "checkout", "default", "--remove")).rejects.toThrow(/has no repo key/);
  });

  it("commit and status --repos use the same repo key rule", async () => {
    await expect(run("commit", "checkout", "backend", "abc123")).rejects.toThrow(
      /Unknown repo key: backend\. Allowed: default/,
    );
    await run("status", "checkout", "planned", "--repos", "default", "--branch", "feat/x");
    const m = (await progress()).modules.checkout;
    expect(m.repos).toEqual(["default"]);
    expect(m.branch).toBe("feat/x");
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

describe("haren track check", () => {
  const artifact = async (rel: string) => {
    await mkdir(join(harenDir, "artifacts", rel, ".."), { recursive: true });
    await writeFile(join(harenDir, "artifacts", rel), "# x\n");
  };

  it("passes on a clean workspace", async () => {
    await expect(run("check")).resolves.toBeUndefined();
  });

  it("fails when an artifact file has no index row", async () => {
    await artifact("03-modules/checkout/spec.md");
    await expect(run("check")).rejects.toThrow(/03-modules\/checkout\/spec.md has no row/);
  });

  it("passes after the artifact is registered, and ignores baseline files", async () => {
    await artifact("03-modules/checkout/spec.md");
    await artifact("00-baseline/prd.md");
    await run(
      "artifact",
      "SPEC-001",
      "--type",
      "spec",
      "--path",
      "artifacts/03-modules/checkout/spec.md",
      "--module",
      "checkout",
    );
    await expect(run("check")).resolves.toBeUndefined();
  });

  it("fails when an index row points to a missing file", async () => {
    await run("artifact", "SPEC-009", "--type", "spec", "--path", "artifacts/03-modules/gone.md");
    await expect(run("check")).rejects.toThrow(/SPEC-009 points to missing file/);
  });

  it("fails when progress.json uses a repo key that manifest.yaml does not declare", async () => {
    const declared = 'haren:\n  version: "1.3.3"\nrepos:\n  legacy_be:\n    path: ../legacy_be\n';
    await writeFile(join(harenDir, "manifest.yaml"), declared);
    await run("commit", "checkout", "legacy_be", "abc123");
    await writeFile(join(harenDir, "manifest.yaml"), 'haren:\n  version: "1.3.3"\n');
    await expect(run("check")).rejects.toThrow(/uses repo 'legacy_be'/);
    await writeFile(join(harenDir, "manifest.yaml"), declared);
    await expect(run("check")).resolves.toBeUndefined();
  });
});

describe("haren track unit with an adapter", () => {
  const adapterManifest =
    'haren:\n  version: "1.5.0"\nmode: migration\nrepos:\n  legacy_src: { path: ../legacy_src, role: legacy, readOnly: true }\nmigration:\n  adapter: sample\n  unitId: "^SCR_[A-Z]\\\\d{3}$"\n';
  async function install(commands: Record<string, string>) {
    await writeFile(
      join(harenDir, "plugins.json"),
      JSON.stringify({
        version: 1,
        plugins: { sample: { source: "x", version: "0.1.0", enabled: true, config: {} } },
      }),
    );
    const dir = join(harenDir, ".plugins", "sample");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "haren-plugin.json"),
      JSON.stringify({
        name: "sample",
        version: "0.1.0",
        harenApi: "2",
        adapter: { unitKind: "screen", commands },
      }),
    );
  }
  beforeEach(async () => {
    await writeFile(join(harenDir, "manifest.yaml"), adapterManifest);
  });

  it("refuses extracted and spec-approved when the adapter owns them", async () => {
    await install({ extract: "x {unit}", gate: "y {specPath}" });
    await run("unit", "checkout", "SCR_A001", "inventoried");
    await expect(run("unit", "checkout", "SCR_A001", "extracted")).rejects.toThrow(
      /adapter owns this step/,
    );
    await expect(run("unit", "checkout", "SCR_A001", "spec-approved")).rejects.toThrow(
      /adapter owns this step/,
    );
  });
  it("allows steps the adapter does not declare", async () => {
    await install({ gate: "y {specPath}" });
    await run("unit", "checkout", "SCR_A001", "inventoried");
    await run("unit", "checkout", "SCR_A001", "extracted");
    expect((await progress()).modules.checkout.units.SCR_A001).toBe("extracted");
  });
  it("fails closed when the registered adapter manifest is invalid", async () => {
    await install({ extract: "x {unit}" });
    await run("unit", "checkout", "SCR_A001", "inventoried");
    await writeFile(join(harenDir, ".plugins", "sample", "haren-plugin.json"), "{ not json");
    await expect(run("unit", "checkout", "SCR_A001", "extracted")).rejects.toThrow(
      /Adapter plugin 'sample'/,
    );
    await install({ bogus: "x" });
    await expect(run("unit", "checkout", "SCR_A001", "extracted")).rejects.toThrow(
      /Adapter plugin 'sample': .*Unknown adapter command/,
    );
  });
  it("fails closed when the named adapter is not installed", async () => {
    const msg =
      /Adapter 'sample' is named in manifest\.yaml but not installed\. Run `haren plugin add <source>`, or remove migration\.adapter to work by hand\./;
    await run("unit", "checkout", "SCR_A001", "inventoried");
    await expect(run("unit", "checkout", "SCR_A001", "extracted")).rejects.toThrow(msg);
    await expect(run("unit", "checkout", "SCR_A001", "spec-approved")).rejects.toThrow(msg);
    expect((await progress()).modules.checkout.units.SCR_A001).toBe("inventoried");
  });
  it("fails closed when the adapter is registered but haren-plugin.json is missing", async () => {
    await install({ extract: "x {unit}" });
    await rm(join(harenDir, ".plugins", "sample", "haren-plugin.json"));
    await run("unit", "checkout", "SCR_A001", "inventoried");
    await expect(run("unit", "checkout", "SCR_A001", "extracted")).rejects.toThrow(
      /Adapter 'sample' is named in manifest\.yaml but not installed/,
    );
  });
});

describe("haren track unit", () => {
  const migManifest =
    'haren:\n  version: "1.5.0"\nmode: migration\nrepos:\n  legacy_src: { path: ../legacy_src, role: legacy, readOnly: true }\nmigration:\n  unitId: "^SCR_[A-Z]\\\\d{3}(_P\\\\d+)?$"\n';
  beforeEach(async () => {
    await writeFile(join(harenDir, "manifest.yaml"), migManifest);
  });

  it("records a unit and an event", async () => {
    await run("unit", "checkout", "SCR_A001", "inventoried");
    expect((await progress()).modules.checkout.units.SCR_A001).toBe("inventoried");
    expect((await events()).at(-1)).toMatchObject({
      type: "unit-status",
      unit: "SCR_A001",
      to: "inventoried",
    });
  });
  it("rejects a unit id that does not match unitId", async () => {
    await expect(run("unit", "checkout", "BAD", "inventoried")).rejects.toThrow(/unitId/);
  });
  it("accepts a unit id with a part suffix", async () => {
    await run("unit", "checkout", "SCR_A001_P2", "inventoried");
    expect((await progress()).modules.checkout.units.SCR_A001_P2).toBe("inventoried");
  });
  it("rejects units outside migration mode", async () => {
    await writeFile(join(harenDir, "manifest.yaml"), 'haren:\n  version: "1.5.0"\n');
    await expect(run("unit", "checkout", "SCR_A001", "inventoried")).rejects.toThrow(
      /mode: migration/,
    );
  });
  it("blocks module 'completed' while a unit is below parity-signed", async () => {
    await run("unit", "checkout", "SCR_A001", "inventoried");
    await run("status", "checkout", "implementing");
    await run("status", "checkout", "evaluating");
    await expect(run("status", "checkout", "completed")).rejects.toThrow(/SCR_A001/);
  });
  it("blocks module 'planned' while a unit is below spec-approved", async () => {
    await run("status", "m", "decomposed");
    await run("unit", "m", "SCR_A001", "inventoried");
    await run("unit", "m", "SCR_A001", "extracted");
    await run("unit", "m", "SCR_A001", "spec-draft");
    await expect(run("status", "m", "planned")).rejects.toThrow(/SCR_A001/);
  });
});

describe("track check in migration mode", () => {
  const legacy = "repos:\n  legacy_src: { path: ../legacy_src, role: legacy, readOnly: true }\n";
  const unitId = 'migration:\n  unitId: "^SCR_[A-Z]\\\\d{3}$"\n';
  const writeUnits = (units: Record<string, string>) =>
    writeFile(
      join(harenDir, "progress.json"),
      JSON.stringify({
        project: "shop",
        version: 3,
        phase: "plan",
        currentIteration: 3,
        modules: { checkout: { status: "planned", currentPhase: "plan", features: {}, units } },
        dependencies: {},
      }),
    );

  it("fails without a legacy repo", async () => {
    await writeFile(
      join(harenDir, "manifest.yaml"),
      'haren:\n  version: "1.5.0"\nmode: migration\nmigration:\n  unitId: "^SCR_"\n',
    );
    await expect(run("check")).rejects.toThrow(/role: legacy/);
  });
  it("gives an actionable error on a fresh migration scaffold", async () => {
    await writeFile(
      join(harenDir, "manifest.yaml"),
      buildManifestText({
        version: "1.5.0",
        layout: "workspace",
        project: "shop",
        mode: "migration",
        language: "English",
        repos: {},
      }),
    );
    const err = await run("check").catch((e) => e);
    expect(err.message).toContain("role: legacy");
    expect(err.message).toContain(
      "legacy_src: { path: ../legacy_src, role: legacy, readOnly: true }",
    );
  });
  it("fails when a unit id does not match unitId", async () => {
    await writeFile(
      join(harenDir, "manifest.yaml"),
      `haren:\n  version: "1.5.0"\nmode: migration\n${legacy}${unitId}`,
    );
    await writeUnits({ BAD: "inventoried" });
    await expect(run("check")).rejects.toThrow(/unit 'BAD' does not match migration\.unitId/);
  });
  it("fails when an approved unit has no passing gate.json in adapter mode", async () => {
    await writeFile(
      join(harenDir, "manifest.yaml"),
      `haren:\n  version: "1.5.0"\nmode: migration\n${legacy}${unitId.replace("migration:\n", "migration:\n  adapter: sample\n")}`,
    );
    await writeUnits({ SCR_A001: "spec-approved" });
    await expect(run("check")).rejects.toThrow(/Adapter 'sample' is named in manifest\.yaml/);
    await writeFile(
      join(harenDir, "plugins.json"),
      JSON.stringify({
        version: 1,
        plugins: { sample: { source: "x", version: "0.1.0", enabled: true, config: {} } },
      }),
    );
    await mkdir(join(harenDir, ".plugins", "sample"), { recursive: true });
    await writeFile(
      join(harenDir, ".plugins", "sample", "haren-plugin.json"),
      JSON.stringify({
        name: "sample",
        version: "0.1.0",
        harenApi: "2",
        adapter: { unitKind: "screen", commands: { gate: "y {specPath}" } },
      }),
    );
    await expect(run("check")).rejects.toThrow(/SCR_A001.*gate\.json/);
    const dir = join(harenDir, "artifacts", "02-discovery", "units", "SCR_A001");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "gate.json"), "{ not json");
    await expect(run("check")).rejects.toThrow(/SCR_A001.*gate\.json/);
    await writeFile(join(dir, "gate.json"), JSON.stringify({ pass: true }));
    await run("check");
  });
});

describe("haren track depends", () => {
  const setup = async () => {
    await run("status", "cart", "discovered");
    await run("status", "auth", "discovered");
  };
  it("replaces the dependency list and emits an event", async () => {
    await setup();
    await run("depends", "checkout", "cart", "auth");
    expect((await progress()).dependencies.checkout).toEqual(["cart", "auth"]);
    await run("depends", "checkout", "auth");
    expect((await progress()).dependencies.checkout).toEqual(["auth"]);
    expect((await events()).at(-1)).toMatchObject({
      type: "dependencies",
      module: "checkout",
      dependsOn: ["auth"],
    });
  });
  it("clears the list when no deps are given", async () => {
    await setup();
    await run("depends", "checkout", "cart");
    await run("depends", "checkout");
    expect((await progress()).dependencies.checkout).toEqual([]);
  });
  it("rejects unknown modules", async () => {
    await expect(run("depends", "ghost", "checkout")).rejects.toThrow(/Unknown module 'ghost'/);
    await expect(run("depends", "checkout", "ghost")).rejects.toThrow(/Unknown module 'ghost'/);
  });
  it("rejects a cycle and a self dependency", async () => {
    await setup();
    await run("depends", "cart", "auth");
    await run("depends", "auth", "checkout");
    await expect(run("depends", "checkout", "cart")).rejects.toThrow(
      /cycle: checkout → cart → auth → checkout/,
    );
    await expect(run("depends", "checkout", "checkout")).rejects.toThrow(/cycle/);
    expect((await progress()).dependencies.checkout).toBeUndefined();
  });
  it("finds no cycle in a dense acyclic graph quickly", async () => {
    await setup();
    const p = await progress();
    const names = Array.from({ length: 40 }, (_, i) => `m${i}`);
    for (const n of names) p.modules[n] = { status: "discovered" };
    // Each node depends on every later node: exponential paths without a visited set.
    p.dependencies = Object.fromEntries(names.map((n, i) => [n, names.slice(i + 1)]));
    await writeFile(join(harenDir, "progress.json"), JSON.stringify(p));
    const start = Date.now();
    await run("depends", "checkout", "m0");
    expect(Date.now() - start).toBeLessThan(2000);
  });
});

describe("module gate in migration mode (positive paths)", () => {
  const migManifest =
    'haren:\n  version: "1.5.0"\nmode: migration\nrepos:\n  legacy_src: { path: ../legacy_src, role: legacy, readOnly: true }\nmigration:\n  unitId: "^SCR_[A-Z]\\\\d{3}$"\n';
  const setModule = async (status: string, units: Record<string, string>) => {
    const p = await progress();
    p.modules.checkout = { ...p.modules.checkout, status, units };
    await writeFile(join(harenDir, "progress.json"), JSON.stringify(p));
  };
  it("completed succeeds when all units are parity-signed", async () => {
    await writeFile(join(harenDir, "manifest.yaml"), migManifest);
    await setModule("evaluating", { SCR_A001: "parity-signed", SCR_A002: "parity-signed" });
    await run("status", "checkout", "completed");
    expect((await progress()).modules.checkout.status).toBe("completed");
  });
  it("a module with no units passes the gate", async () => {
    await writeFile(join(harenDir, "manifest.yaml"), migManifest);
    await setModule("evaluating", {});
    await run("status", "checkout", "completed");
    expect((await progress()).modules.checkout.status).toBe("completed");
  });
  it("a non-migration workspace is not gated by units", async () => {
    await setModule("evaluating", { SCR_A001: "inventoried" });
    await run("status", "checkout", "completed");
    expect((await progress()).modules.checkout.status).toBe("completed");
  });
});

describe("track check in migration mode (more)", () => {
  const legacy = "repos:\n  legacy_src: { path: ../legacy_src, role: legacy, readOnly: true }\n";
  const writeUnits = (units: Record<string, string>) =>
    writeFile(
      join(harenDir, "progress.json"),
      JSON.stringify({
        project: "shop",
        version: 3,
        modules: { checkout: { status: "planned", currentPhase: "plan", features: {}, units } },
        dependencies: {},
      }),
    );
  async function installSample() {
    await writeFile(
      join(harenDir, "plugins.json"),
      JSON.stringify({
        version: 1,
        plugins: { sample: { source: "x", version: "0.1.0", enabled: true, config: {} } },
      }),
    );
    await mkdir(join(harenDir, ".plugins", "sample"), { recursive: true });
    await writeFile(
      join(harenDir, ".plugins", "sample", "haren-plugin.json"),
      JSON.stringify({
        name: "sample",
        version: "0.1.0",
        harenApi: "2",
        adapter: { unitKind: "screen", commands: { gate: "y {specPath}" } },
      }),
    );
  }
  it("fails when mode: migration has no migration block", async () => {
    await writeFile(
      join(harenDir, "manifest.yaml"),
      `haren:\n  version: "1.5.0"\nmode: migration\n${legacy}`,
    );
    await expect(run("check")).rejects.toThrow(/needs a migration block/);
  });
  it("does not require gate.json when no adapter is set", async () => {
    await writeFile(
      join(harenDir, "manifest.yaml"),
      `haren:\n  version: "1.5.0"\nmode: migration\n${legacy}migration:\n  unitId: "^SCR_"\n`,
    );
    await writeUnits({ SCR_A001: "spec-approved" });
    await run("check");
  });
  it("skips the gate.json check for a blocked unit", async () => {
    await writeFile(
      join(harenDir, "manifest.yaml"),
      `haren:\n  version: "1.5.0"\nmode: migration\n${legacy}migration:\n  adapter: sample\n  unitId: "^SCR_"\n`,
    );
    await installSample();
    await writeUnits({ SCR_A001: "blocked" });
    await run("check");
    await writeUnits({ SCR_A001: "built" });
    await expect(run("check")).rejects.toThrow(/SCR_A001.*gate\.json/);
  });
  it("fails when more than one repo has role: legacy", async () => {
    await writeFile(
      join(harenDir, "manifest.yaml"),
      `haren:\n  version: "1.5.0"\nmode: migration\nrepos:\n  a: { path: ../a, role: legacy }\n  b: { path: ../b, role: legacy }\nmigration:\n  unitId: "^SCR_"\n`,
    );
    await expect(run("check")).rejects.toThrow(/more than one repo with role: legacy/);
  });
});

describe("track status --branch and --repos", () => {
  const manifest =
    'haren:\n  version: "1.3.3"\nrepos:\n  web: { path: ../web }\n  api: { path: ../api }\n';
  const read = async () => JSON.parse(await readFile(join(harenDir, "progress.json"), "utf-8"));

  it("sets branch and repos on a new module", async () => {
    await writeFile(join(harenDir, "manifest.yaml"), manifest);
    await track(
      ["status", "cart", "decomposed", "--branch", "feat/cart", "--repos", "web,api"],
      root,
    );
    const mod = (await read()).modules.cart;
    expect(mod.status).toBe("decomposed");
    expect(mod.branch).toBe("feat/cart");
    expect(mod.repos).toEqual(["web", "api"]);
  });

  it("rejects a repo key that is not in the manifest", async () => {
    await writeFile(join(harenDir, "manifest.yaml"), manifest);
    await expect(
      track(["status", "cart", "decomposed", "--repos", "web,nope"], root),
    ).rejects.toThrow(/Unknown repo key: nope/);
    expect((await read()).modules.cart).toBeUndefined();
  });

  it("updates repos with the same status and no transition", async () => {
    await writeFile(join(harenDir, "manifest.yaml"), manifest);
    await track(["status", "cart", "decomposed", "--repos", "web"], root);
    await track(["status", "cart", "decomposed", "--repos", "api", "--branch", "feat/x"], root);
    const mod = (await read()).modules.cart;
    expect(mod.status).toBe("decomposed");
    expect(mod.repos).toEqual(["api"]);
    expect(mod.branch).toBe("feat/x");
  });

  it("updates repos with a valid transition on an existing module", async () => {
    await writeFile(join(harenDir, "manifest.yaml"), manifest);
    await track(["status", "checkout", "implementing", "--repos", "web"], root);
    const mod = (await read()).modules.checkout;
    expect(mod.status).toBe("implementing");
    expect(mod.repos).toEqual(["web"]);
  });

  it("still rejects a same-status move without branch or repos", async () => {
    await track(["status", "cart", "decomposed"], root);
    await expect(track(["status", "cart", "decomposed"], root)).rejects.toThrow(
      /Invalid module transition/,
    );
  });
});

describe("haren track ui-mode", () => {
  it("writes the manifest and an event", async () => {
    const before = await readFile(join(harenDir, "manifest.yaml"), "utf-8");
    await run("ui-mode", "browser");
    const after = await readFile(join(harenDir, "manifest.yaml"), "utf-8");
    expect(after).toContain("mockups: browser");
    // Everything else in the manifest stays.
    expect(after.startsWith(before.replace(/\n*$/, ""))).toBe(true);
    expect((await events()).at(-1)).toMatchObject({ type: "ui-mode", mode: "browser" });
    await expect(run("ui-mode", "fancy")).rejects.toThrow(/ask, ascii, browser, artifact/);
  });
});
