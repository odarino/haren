import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync } from "fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { migrate, renderUnitMap } from "../../commands/migrate";
import { pluginDir } from "../../plugins/state";
import { parseArgs } from "../../index";

let root: string;
let harenDir: string;
let plugin: string;

const MANIFEST =
  'haren:\n  version: "1.5.0"\nmode: migration\nrepos:\n  legacy_src: { path: ../legacy_src, role: legacy, readOnly: true }\nmigration:\n  adapter: fake\n  unitId: "^SCR_[A-Z]\\\\d{3}(_P\\\\d+)?$"\n';

const INVENTORY = `console.log(JSON.stringify({ units: [
  { id: "SCR_A001", parent: null, family: "order", title: "Order list" },
  { id: "SCR_A001_P1", parent: "SCR_A001", family: "order", title: "Order popup" },
] }));`;

const EXTRACT = `import { writeFileSync } from "fs";
import { join } from "path";
const [unit, , root, , out] = process.argv.slice(2);
writeFileSync(join(out, "ir.json"), JSON.stringify({ unit, root }));
console.log(JSON.stringify({ unit, files: ["ir.json"] }));`;

const gateScript = (pass: boolean) =>
  `console.log(JSON.stringify({ unit: "SCR_A001", pass: ${pass}, findings: ${
    pass ? "[]" : '[{ severity: "error", rule: "missing-binding", message: "ORDER_TBL not bound" }]'
  } }));`;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "haren-migrate-"));
  harenDir = join(root, "haren");
  await mkdir(join(root, "legacy_src"), { recursive: true });
  await mkdir(join(harenDir, "artifacts", "_registry"), { recursive: true });
  await mkdir(join(harenDir, "events"), { recursive: true });
  await writeFile(join(harenDir, "manifest.yaml"), MANIFEST);
  await writeFile(
    join(harenDir, "progress.json"),
    JSON.stringify({
      project: "shop",
      version: 3,
      modules: {
        orders: { status: "decomposed", currentPhase: "decompose", features: {}, lastCommit: {} },
      },
      dependencies: {},
    }),
  );
  await writeFile(
    join(harenDir, "artifacts", "_registry", "artifact-index.md"),
    "| ID | Type | Module | Status | Path |\n|----|------|--------|--------|------|\n",
  );
  await writeFile(join(harenDir, "events", "events.jsonl"), "");
  await writeFile(
    join(harenDir, "plugins.json"),
    JSON.stringify({
      version: 1,
      plugins: { fake: { source: "x", version: "0.1.0", enabled: true, config: {} } },
    }),
  );
  plugin = pluginDir(harenDir, "fake");
  await mkdir(join(plugin, "tools"), { recursive: true });
  await writeFile(
    join(plugin, "haren-plugin.json"),
    JSON.stringify({
      name: "fake",
      version: "0.1.0",
      harenApi: "2",
      adapter: {
        unitKind: "screen",
        commands: {
          inventory: "bun tools/inventory.ts --root {legacyRoot}",
          extract: "bun tools/extract.ts {unit} --root {legacyRoot} --out {unitDir}",
          gate: "bun tools/gate.ts {specPath} --ir {unitDir}",
        },
      },
    }),
  );
  await writeFile(join(plugin, "tools", "inventory.ts"), INVENTORY);
  await writeFile(join(plugin, "tools", "extract.ts"), EXTRACT);
  await writeFile(join(plugin, "tools", "gate.ts"), gateScript(true));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const progress = async () => JSON.parse(await readFile(join(harenDir, "progress.json"), "utf-8"));
const events = async () =>
  (await readFile(join(harenDir, "events", "events.jsonl"), "utf-8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
const unitDir = (u: string) => join(harenDir, "artifacts", "02-discovery", "units", u);

async function setUnit(unit: string, status: string) {
  const p = await progress();
  p.modules.orders.units = { ...(p.modules.orders.units ?? {}), [unit]: status };
  await writeFile(join(harenDir, "progress.json"), JSON.stringify(p));
}

async function readyForGate() {
  await migrate(["inventory", "--module", "orders"], root);
  await setUnit("SCR_A001", "spec-draft");
  await mkdir(unitDir("SCR_A001"), { recursive: true });
  await writeFile(join(unitDir("SCR_A001"), "spec.md"), "# SCR_A001\n");
}

describe("haren migrate", () => {
  it("is wired in the CLI", () => {
    expect(parseArgs(["migrate", "inventory"])).toEqual({
      command: "migrate",
      args: ["inventory"],
    });
  });

  it("inventory writes unit-map and inventoried units", async () => {
    await migrate(["inventory", "--module", "orders"], root);
    expect((await progress()).modules.orders.units).toEqual({
      SCR_A001: "inventoried",
      SCR_A001_P1: "inventoried",
    });
    expect(await readFile(join(harenDir, "artifacts/02-discovery/unit-map.md"), "utf-8")).toContain(
      "| SCR_A001_P1 | SCR_A001 |",
    );
    const registry = await readFile(
      join(harenDir, "artifacts", "_registry", "artifact-index.md"),
      "utf-8",
    );
    expect(registry).toContain("| UNITMAP-001 | unit-map |");
  });

  it("inventory keeps known Module cells and never deletes units", async () => {
    await migrate(["inventory", "--module", "orders"], root);
    await writeFile(
      join(plugin, "tools", "inventory.ts"),
      `console.log(JSON.stringify({ units: [{ id: "SCR_B002", parent: null }] }));`,
    );
    await migrate(["inventory"], root);
    const map = await readFile(join(harenDir, "artifacts/02-discovery/unit-map.md"), "utf-8");
    expect(map).toContain("| SCR_A001 | - | order | Order list | orders |");
    expect(map).toContain("| SCR_B002 | - | - | - | - |");
    expect(Object.keys((await progress()).modules.orders.units)).toEqual([
      "SCR_A001",
      "SCR_A001_P1",
    ]);
  });

  it("inventory warns about units whose module is not in progress.json", async () => {
    await mkdir(join(harenDir, "artifacts", "02-discovery"), { recursive: true });
    await writeFile(
      join(harenDir, "artifacts/02-discovery/unit-map.md"),
      renderUnitMap([{ id: "SCR_A001", parent: null }], { SCR_A001: "ghost" }),
    );
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => void lines.push(a.join(" "));
    try {
      await migrate(["inventory"], root);
    } finally {
      console.log = orig;
    }
    expect(lines.join("\n")).toContain("skipped, module not in progress.json: SCR_A001 (ghost)");
    expect((await progress()).modules.orders.units ?? {}).toEqual({});
  });

  it("renderUnitMap renders the table", () => {
    const text = renderUnitMap([{ id: "SCR_A001", parent: null, title: "A" }], {
      SCR_A001: "orders",
    });
    expect(text).toContain("| Unit | Parent | Family | Title | Module |");
    expect(text).toContain("| SCR_A001 | - | - | A | orders |");
  });

  it("extract sets extracted", async () => {
    await migrate(["inventory", "--module", "orders"], root);
    await migrate(["extract", "SCR_A001"], root);
    expect((await progress()).modules.orders.units.SCR_A001).toBe("extracted");
    const ir = JSON.parse(await readFile(join(unitDir("SCR_A001"), "ir.json"), "utf-8"));
    expect(ir).toEqual({ unit: "SCR_A001", root: join(root, "legacy_src") });
    expect((await events()).at(-1)).toMatchObject({
      type: "unit-status",
      module: "orders",
      unit: "SCR_A001",
      from: "inventoried",
      to: "extracted",
    });
  });

  it("extract rejects a unit that does not match migration.unitId", async () => {
    await expect(migrate(["extract", "BAD_1"], root)).rejects.toThrow(/migration.unitId/);
  });

  it("gate FAIL keeps spec-draft and writes gate.json", async () => {
    await readyForGate();
    await writeFile(join(plugin, "tools", "gate.ts"), gateScript(false));
    await expect(migrate(["gate", "SCR_A001", "--approve"], root)).rejects.toThrow(/gate FAIL/);
    expect((await progress()).modules.orders.units.SCR_A001).toBe("spec-draft");
    const gate = JSON.parse(await readFile(join(unitDir("SCR_A001"), "gate.json"), "utf-8"));
    expect(gate.pass).toBe(false);
    expect(gate.findings[0].rule).toBe("missing-binding");
    expect(typeof gate.ranAt).toBe("string");
  });

  it("gate PASS with --approve sets spec-approved", async () => {
    await readyForGate();
    await migrate(["gate", "SCR_A001", "--approve"], root);
    expect((await progress()).modules.orders.units.SCR_A001).toBe("spec-approved");
    const gate = JSON.parse(await readFile(join(unitDir("SCR_A001"), "gate.json"), "utf-8"));
    expect(gate.pass).toBe(true);
    expect((await events()).at(-1)).toMatchObject({
      type: "unit-gate",
      unit: "SCR_A001",
      pass: true,
      approvedBy: "user",
    });
  });

  it("gate PASS without --approve and no TTY refuses", async () => {
    await readyForGate();
    await expect(migrate(["gate", "SCR_A001"], root)).rejects.toThrow(/--approve/);
    expect((await progress()).modules.orders.units.SCR_A001).toBe("spec-draft");
  });

  it("adapter error changes no status", async () => {
    await readyForGate();
    await writeFile(join(plugin, "tools", "gate.ts"), "process.exit(1);");
    await expect(migrate(["gate", "SCR_A001", "--approve"], root)).rejects.toMatchObject({
      name: "AdapterError",
    });
    expect((await progress()).modules.orders.units.SCR_A001).toBe("spec-draft");
    expect(existsSync(join(unitDir("SCR_A001"), "gate.json"))).toBe(false);
  });

  it("names the missing adapter command", async () => {
    const m = JSON.parse(await readFile(join(plugin, "haren-plugin.json"), "utf-8"));
    delete m.adapter.commands.extract;
    await writeFile(join(plugin, "haren-plugin.json"), JSON.stringify(m));
    await migrate(["inventory", "--module", "orders"], root);
    await expect(migrate(["extract", "SCR_A001"], root)).rejects.toThrow(
      "Adapter has no extract command. Do this step by hand (see skill extract)",
    );
  });
});
