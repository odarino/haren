// src/__tests__/e2e/migration.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { scaffoldWorkspace } from "../../commands/init";
import { migrate, renderUnitMap } from "../../commands/migrate";
import { track } from "../../commands/track";
import { installPlugin } from "../../plugins/install";

const SAMPLE = resolve(import.meta.dir, "../../../../../examples/adapters/sample");

const { version: HAREN_VERSION } = JSON.parse(
  readFileSync(resolve(import.meta.dir, "../../../package.json"), "utf-8"),
) as { version: string };

const MANIFEST = `haren:\n  version: "${HAREN_VERSION}"\nproject: shop\nmode: migration\nrepos:\n  legacy_src: { path: ../legacy_src, role: legacy, readOnly: true }\nmigration:\n  adapter: sample-adapter\n  unitId: "^SCR_[A-Z]\\\\d{3}(_P\\\\d+)?$"\n`;

const specWith = (
  writes: string,
  bindings = ["ORDER_TBL.ORDER_NO", "ORDER_TBL.STATUS"],
) => `# SCR_A001

## Fields
orderNo, status

## Bindings
${bindings.map((b) => `- ${b}`).join("\n")}

## Writes
${writes}

## Behavior
Writes happen only on save.

## Parity checklist
- [ ] Same fields
`;

let root: string;
let harenDir: string;

const unitDir = (u: string) => join(harenDir, "artifacts", "02-discovery", "units", u);
const run = (args: string[]) => track([...args, "--haren-dir", harenDir], root);
const mig = (args: string[]) => migrate([...args, "--haren-dir", harenDir], root);
const progress = async () => JSON.parse(await readFile(join(harenDir, "progress.json"), "utf-8"));
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, saved);
  }
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "haren-e2e-migration-"));
  harenDir = join(root, "haren");
  await cp(join(SAMPLE, "fixture", "legacy_src"), join(root, "legacy_src"), { recursive: true });
  await scaffoldWorkspace(harenDir, { project: "shop", mode: "explore", language: "English" });
  await writeFile(join(harenDir, "manifest.yaml"), MANIFEST);
  const p = await progress();
  for (const m of ["orders", "reports"]) {
    p.modules[m] = {
      status: "decomposed",
      currentPhase: "decompose",
      features: {},
      lastCommit: {},
    };
  }
  await writeFile(join(harenDir, "progress.json"), JSON.stringify(p));
  await installPlugin(`file:${SAMPLE}`, {
    workspaceDir: root,
    harenDir,
    project: "shop",
    io: { confirm: async () => true, log: () => {} },
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("e2e: migration unit flow with the sample adapter", () => {
  it("takes three units from inventory to a planned module", async () => {
    // Seed the unit map so SCR_B001 sits in its own module.
    const mapPath = join(harenDir, "artifacts", "02-discovery", "unit-map.md");
    await mkdir(join(harenDir, "artifacts", "02-discovery"), { recursive: true });
    await writeFile(
      mapPath,
      renderUnitMap(
        [
          { id: "SCR_A001", parent: null, family: "order", title: "Order list" },
          { id: "SCR_A001_P1", parent: "SCR_A001", family: "order", title: "Order popup" },
          { id: "SCR_B001", parent: null, family: "report", title: "Order report" },
        ],
        { SCR_A001: "orders", SCR_A001_P1: "orders", SCR_B001: "reports" },
      ),
    );

    await quiet(() => mig(["inventory", "--module", "orders"]));
    let p = await progress();
    expect(p.modules.orders.units).toEqual({
      SCR_A001: "inventoried",
      SCR_A001_P1: "inventoried",
    });
    expect(p.modules.reports.units).toEqual({ SCR_B001: "inventoried" });
    expect(await readFile(mapPath, "utf-8")).toContain("| SCR_A001_P1 | SCR_A001 | order |");

    // Extract writes the IR files.
    await quiet(() => mig(["extract", "SCR_A001"]));
    expect((await progress()).modules.orders.units.SCR_A001).toBe("extracted");
    expect(await readFile(join(unitDir("SCR_A001"), "ir.xml"), "utf-8")).toContain("ORDER_LOG");
    expect(await readFile(join(unitDir("SCR_A001"), "view.txt"), "utf-8")).toContain(
      "orderNo <- ORDER_TBL.ORDER_NO",
    );

    // A spec without ORDER_LOG fails the gate.
    await writeFile(join(unitDir("SCR_A001"), "spec.md"), specWith("- none"));
    await quiet(() => run(["unit", "orders", "SCR_A001", "spec-draft"]));
    await expect(quiet(() => mig(["gate", "SCR_A001", "--approve"]))).rejects.toThrow(/gate FAIL/);
    const failed = JSON.parse(await readFile(join(unitDir("SCR_A001"), "gate.json"), "utf-8"));
    expect(failed.pass).toBe(false);
    expect(failed.findings[0].rule).toBe("missing-writes");
    expect((await progress()).modules.orders.units.SCR_A001).toBe("spec-draft");

    // A spec that omits one binding fails with missing-binding.
    await writeFile(
      join(unitDir("SCR_A001"), "spec.md"),
      specWith("- ORDER_LOG", ["ORDER_TBL.ORDER_NO"]),
    );
    await expect(quiet(() => mig(["gate", "SCR_A001", "--approve"]))).rejects.toThrow(/gate FAIL/);
    const unbound = JSON.parse(await readFile(join(unitDir("SCR_A001"), "gate.json"), "utf-8"));
    expect(unbound.pass).toBe(false);
    expect(unbound.findings.map((f: { rule: string }) => f.rule)).toEqual(["missing-binding"]);
    expect(unbound.findings[0].message).toContain("ORDER_TBL.STATUS");
    expect((await progress()).modules.orders.units.SCR_A001).toBe("spec-draft");

    // A fixed spec passes and the status moves.
    await writeFile(join(unitDir("SCR_A001"), "spec.md"), specWith("- ORDER_LOG"));
    await quiet(() => mig(["gate", "SCR_A001", "--approve"]));
    const passed = JSON.parse(await readFile(join(unitDir("SCR_A001"), "gate.json"), "utf-8"));
    expect(passed.pass).toBe(true);
    expect((await progress()).modules.orders.units.SCR_A001).toBe("spec-approved");

    // The adapter owns the approval step.
    await expect(run(["unit", "orders", "SCR_A001_P1", "spec-approved"])).rejects.toThrow(
      /adapter owns this step/,
    );
    // The module cannot plan while a unit is below spec-approved.
    await expect(run(["status", "orders", "planned"])).rejects.toThrow(
      /units below 'spec-approved': SCR_A001_P1/,
    );

    // Bring the other units to spec-approved.
    for (const [module, unit, spec] of [
      ["orders", "SCR_A001_P1", "- none\n\n## Bindings\nORDER_TBL.ORDER_NO"],
      ["reports", "SCR_B001", "- none\n\n## Bindings\nORDER_TBL.TOTAL"],
    ]) {
      await quiet(() => mig(["extract", unit]));
      await writeFile(join(unitDir(unit), "spec.md"), `# ${unit}\n\n## Writes\n${spec}\n`);
      await quiet(() => run(["unit", module, unit, "spec-draft"]));
      await quiet(() => mig(["gate", unit, "--approve"]));
    }
    await quiet(() => run(["status", "reports", "planned"]));
    await quiet(() => run(["status", "orders", "planned"]));
    p = await progress();
    expect(p.modules.orders.status).toBe("planned");

    // Register the specs, then the workspace check passes.
    for (const [id, module, unit] of [
      ["SPEC-A001", "orders", "SCR_A001"],
      ["SPEC-A001-P1", "orders", "SCR_A001_P1"],
      ["SPEC-B001", "reports", "SCR_B001"],
    ]) {
      await quiet(() =>
        run([
          "artifact",
          id,
          "--type",
          "unit-spec",
          "--module",
          module,
          "--path",
          `02-discovery/units/${unit}/spec.md`,
        ]),
      );
    }
    for (const unit of ["SCR_A001", "SCR_A001_P1", "SCR_B001"]) {
      for (const f of ["ir.xml", "view.txt", "gate.json"]) {
        expect(await Bun.file(join(unitDir(unit), f)).exists()).toBe(true);
      }
    }
    await expect(quiet(() => run(["check"]))).resolves.toBeUndefined();
  });
});
