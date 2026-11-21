import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  readProgress,
  writeProgress,
  updateModuleStatus,
  updateFeatureStatus,
  updateUnitStatus,
  unitsBelow,
  unitAtLeast,
  migrateProgress,
  PROGRESS_VERSION,
  type Progress,
} from "../../workspace/progress";

describe("progress", () => {
  let testDir: string;
  let progressPath: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "haren-progress-"));
    progressPath = join(testDir, "progress.json");
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("defaults missing features and lastCommit maps on read", async () => {
    await writeFile(
      progressPath,
      JSON.stringify({
        project: "test",
        version: 1,
        modules: { core: { status: "decomposed", repos: ["api"] } },
        dependencies: {},
      }),
    );
    const progress = await readProgress(progressPath);
    expect(progress.modules.core!.features).toEqual({});
    expect(progress.modules.core!.lastCommit).toEqual({});
  });

  it("reads progress.json", async () => {
    const data: Progress = {
      project: "test",
      version: 1,
      modules: {},
      dependencies: {},
    };
    await writeFile(progressPath, JSON.stringify(data));

    const result = await readProgress(progressPath);
    expect(result.project).toBe("test");
    expect(result.modules).toEqual({});
  });

  it("writes progress.json", async () => {
    const data: Progress = {
      project: "test",
      version: 2,
      modules: {
        auth: {
          status: "planned",
          currentPhase: "plan",
          features: {},
          lastCommit: {},
          lastUpdated: "2026-04-04T10:00:00Z",
        },
      },
      dependencies: {},
    };
    await writeProgress(progressPath, data);

    const raw = JSON.parse(await readFile(progressPath, "utf-8"));
    expect(raw.modules.auth.status).toBe("planned");
  });

  it("updates module status with valid transition", async () => {
    const data: Progress = {
      project: "test",
      version: 2,
      modules: {
        auth: {
          status: "planned",
          currentPhase: "plan",
          features: {},
          lastCommit: {},
          lastUpdated: "2026-04-04T10:00:00Z",
        },
      },
      dependencies: {},
    };

    const updated = updateModuleStatus(data, "auth", "implementing");
    expect(updated.modules.auth.status).toBe("implementing");
    expect(updated.modules.auth.currentPhase).toBe("implement");
  });

  it("rejects invalid module status transition", () => {
    const data: Progress = {
      project: "test",
      version: 2,
      modules: {
        auth: {
          status: "discovered",
          currentPhase: "discover",
          features: {},
          lastCommit: {},
          lastUpdated: "2026-04-04T10:00:00Z",
        },
      },
      dependencies: {},
    };

    expect(() => updateModuleStatus(data, "auth", "implementing")).toThrow();
  });

  it("updates feature status", () => {
    const data: Progress = {
      project: "test",
      version: 2,
      modules: {
        auth: {
          status: "implementing",
          currentPhase: "implement",
          features: { "login-flow": "pending" },
          lastCommit: {},
          lastUpdated: "2026-04-04T10:00:00Z",
        },
      },
      dependencies: {},
    };

    const updated = updateFeatureStatus(data, "auth", "login-flow", "in-progress");
    expect(updated.modules.auth.features["login-flow"]).toBe("in-progress");
  });

  it("rejects invalid feature status transition", () => {
    const data: Progress = {
      project: "test",
      version: 2,
      modules: {
        auth: {
          status: "implementing",
          currentPhase: "implement",
          features: { "login-flow": "pending" },
          lastCommit: {},
          lastUpdated: "2026-04-04T10:00:00Z",
        },
      },
      dependencies: {},
    };

    expect(() => updateFeatureStatus(data, "auth", "login-flow", "passing")).toThrow();
  });
});

const unitBase = () =>
  ({
    project: "p",
    version: 3,
    dependencies: {},
    modules: {
      orders: {
        status: "decomposed",
        currentPhase: "decompose",
        features: {},
        lastCommit: {},
        lastUpdated: "",
        units: {} as Record<string, any>,
      },
    },
  }) as any;

describe("units", () => {
  it("adds a new unit only as inventoried", () => {
    const p = updateUnitStatus(unitBase(), "orders", "SCR_A001", "inventoried");
    expect(p.modules.orders.units!.SCR_A001).toBe("inventoried");
    expect(() => updateUnitStatus(unitBase(), "orders", "SCR_A001", "extracted")).toThrow(
      /new unit/,
    );
  });
  it("enforces order", () => {
    let p = updateUnitStatus(unitBase(), "orders", "SCR_A001", "inventoried");
    expect(() => updateUnitStatus(p, "orders", "SCR_A001", "spec-draft")).toThrow(
      /Invalid unit transition/,
    );
    p = updateUnitStatus(p, "orders", "SCR_A001", "extracted");
    p = updateUnitStatus(p, "orders", "SCR_A001", "spec-draft");
    expect(p.modules.orders.units!.SCR_A001).toBe("spec-draft");
  });
  it("blocked returns to any non-final status; static-review-only sits beside verified", () => {
    let p = unitBase();
    p.modules.orders.units = { SCR_A001: "built" };
    p = updateUnitStatus(p, "orders", "SCR_A001", "blocked");
    p = updateUnitStatus(p, "orders", "SCR_A001", "built");
    p = updateUnitStatus(p, "orders", "SCR_A001", "static-review-only");
    p = updateUnitStatus(p, "orders", "SCR_A001", "verified");
    p = updateUnitStatus(p, "orders", "SCR_A001", "parity-signed");
    expect(p.modules.orders.units!.SCR_A001).toBe("parity-signed");
  });
  it("unitsBelow lists units under a floor", () => {
    const mod = {
      ...unitBase().modules.orders,
      units: { A: "spec-approved", B: "spec-draft", C: "blocked" },
    };
    expect(unitsBelow(mod, "spec-approved").sort()).toEqual(["B", "C"]);
  });
  it("migrates v2 to v3 with empty units", () => {
    const { progress, changed } = migrateProgress(
      { version: 2, modules: { a: { lastCommit: {} } } },
      () => undefined,
    );
    expect(changed).toBe(true);
    expect((progress as any).version).toBe(PROGRESS_VERSION);
    expect((progress as any).modules.a.units).toEqual({});
  });
});

describe("units (review fixes)", () => {
  it("spec-approved can go back to spec-draft", () => {
    const p = unitBase();
    p.modules.orders.units = { A: "spec-approved" };
    expect(updateUnitStatus(p, "orders", "A", "spec-draft").modules.orders.units!.A).toBe(
      "spec-draft",
    );
  });
  it("parity-signed may go only to built", () => {
    const p = unitBase();
    p.modules.orders.units = { A: "parity-signed" };
    expect(updateUnitStatus(p, "orders", "A", "built").modules.orders.units!.A).toBe("built");
    expect(() => updateUnitStatus(p, "orders", "A", "verified")).toThrow(/built/);
    expect(() => updateUnitStatus(p, "orders", "A", "blocked")).toThrow();
  });
  it("static-review-only ranks as built", () => {
    const mod = { ...unitBase().modules.orders, units: { S: "static-review-only" } };
    expect(unitsBelow(mod, "built")).toEqual([]);
    expect(unitsBelow(mod, "verified")).toEqual(["S"]);
  });
  it("unitAtLeast compares on the main line; blocked is below everything", () => {
    expect(unitAtLeast("spec-approved", "spec-approved")).toBe(true);
    expect(unitAtLeast("built", "spec-approved")).toBe(true);
    expect(unitAtLeast("static-review-only", "built")).toBe(true);
    expect(unitAtLeast("spec-draft", "spec-approved")).toBe(false);
    expect(unitAtLeast("blocked", "inventoried")).toBe(false);
  });
  it("updateUnitStatus throws on an unknown current status", () => {
    const p = unitBase();
    p.modules.orders.units = { A: "weird" };
    expect(() => updateUnitStatus(p, "orders", "A", "built")).toThrow(
      "Unknown unit status 'weird' for unit 'A'",
    );
  });
  it("readProgress throws on an unknown unit status", async () => {
    const dir = await mkdtemp(join(tmpdir(), "haren-prog-"));
    const file = join(dir, "progress.json");
    const p = unitBase();
    p.modules.orders.units = { A: "weird" };
    await writeFile(file, JSON.stringify(p));
    await expect(readProgress(file)).rejects.toThrow("Unknown unit status 'weird' for unit 'A'");
    await rm(dir, { recursive: true, force: true });
  });
  it("migrates v1 to v3 and adds units", () => {
    const { progress } = migrateProgress(
      { version: 1, modules: { a: { lastCommit: "abc" } } },
      () => "api",
    );
    expect((progress as any).modules.a).toEqual({ lastCommit: { api: "abc" }, units: {} });
  });
  it("migration keeps existing units", () => {
    const { progress } = migrateProgress(
      { version: 2, modules: { a: { lastCommit: {}, units: { X: "built" } } } },
      () => undefined,
    );
    expect((progress as any).modules.a.units).toEqual({ X: "built" });
  });
  it("v2 path validates lastCommit and tolerates a null module", () => {
    const { progress } = migrateProgress(
      { version: 2, modules: { a: { lastCommit: "abc" }, b: { lastCommit: { x: 1 } }, c: null } },
      () => undefined,
    );
    const m = (progress as any).modules;
    expect(m.a.lastCommit).toEqual({});
    expect(m.b.lastCommit).toEqual({});
    expect(m.c).toEqual({ lastCommit: {}, units: {} });
  });
});

import { updateModuleStatus as _ums, updateFeatureStatus as _ufs } from "../../workspace/progress";

describe("legacy statuses from an old progress file", () => {
  const legacy = (status: string, feature = "pending") =>
    ({
      project: "p",
      version: 3,
      phase: "plan",
      status: "active",
      modules: { m: { status, currentPhase: "plan", features: { f: feature } } },
      dependencies: {},
    }) as never;
  it("moves an unknown module status to planned instead of crashing", () => {
    expect(_ums(legacy("specified"), "m", "planned").modules.m.status).toBe("planned");
  });
  it("gives a clear error for a bad exit from an unknown module status", () => {
    expect(() => _ums(legacy("specified"), "m", "released")).toThrow(/unknown status/);
  });
  it("moves an unknown feature status to in-progress", () => {
    expect(_ufs(legacy("planned", "todo"), "m", "f", "in-progress").modules.m.features.f).toBe(
      "in-progress",
    );
  });
});
