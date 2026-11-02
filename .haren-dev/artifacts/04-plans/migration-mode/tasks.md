---
module: migration-mode
date: 2026-11-02
design: artifacts/04-plans/migration-mode/design.md
---

# Migration Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `mode: migration` to haren: per-unit lifecycle in progress.json, read-only legacy repos, `haren migrate` commands that call a technology adapter plugin through a JSON contract, plus templates, skills and a neutral sample adapter.

**Architecture:** Core state lives in `progress.json` v3 (`modules.*.units`) and changes only through the CLI (`haren track unit`, `haren migrate`). Adapters are haren plugins with an optional `adapter` block (`harenApi` "2"); the CLI runs adapter commands with argv (no shell) and validates their stdout JSON. Skills in `content/` drive agents through the lifecycle.

**Tech Stack:** Bun, TypeScript, `bun:test`, `Bun.YAML`, `Bun.spawn`. Package: `apps/cli`.

## Global Constraints

- No client names, project names, screen IDs, table names, legacy product names or domain terms anywhere (code, fixtures, docs, commits). Use `SCR_A001`, `SCR_A001_P1`, `SCR_B001`, `ORDER_TBL`, `ORDER_LOG`, `legacy_src`. Before each commit run the scrub check in Task 0.
- Edit haren itself only in `content/` and `apps/cli/`. After content edits run `bun apps/cli/src/index.ts upgrade --haren-dir .haren-dev --yes`.
- Run tests from `apps/cli`: `bun test`. Format with Prettier, 2-space indent.
- Never edit `progress.json` by hand in skills; skills call the CLI.
- Adapter commands run with `Bun.spawn(argv)`; never `sh -c` with substituted values.
- Unit statuses (exact strings): `inventoried`, `extracted`, `spec-draft`, `spec-approved`, `built`, `verified`, `parity-signed`, side statuses `blocked`, `static-review-only`.
- Plugin `harenApi` accepted values: `"1"` and `"2"`. Only `"2"` may have `adapter`.
- Code changes outside `.haren-dev/` need `haren track override on --reason "<task>"` in this repo (dogfood gate); turn it off after.

---

### Task 0: Scrub check script

**Files:**
- Create: `scripts/scrub-check.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Fails when staged changes contain terms from the private deny list.
# The deny list lives OUTSIDE the repo: $HAREN_SCRUB_TERMS (one regex per line).
set -euo pipefail
terms="${HAREN_SCRUB_TERMS:-$HOME/.config/haren/scrub-terms.txt}"
[ -f "$terms" ] || { echo "scrub: no deny list at $terms (skipped)"; exit 0; }
if git diff --cached -U0 | grep '^+' | grep -inE -f "$terms"; then
  echo "scrub: FAIL — remove client terms above"; exit 1
fi
echo "scrub: PASS"
```

- [ ] **Step 2:** `chmod +x scripts/scrub-check.sh`. Ask the user to create the deny list file outside the repo (the plan must not contain the terms).
- [ ] **Step 3: Commit**

```bash
git add scripts/scrub-check.sh && scripts/scrub-check.sh && git commit -m "chore: add scrub check for client terms"
```

---

### Task 1: progress.json v3 with units

**Files:**
- Modify: `apps/cli/src/workspace/progress.ts`
- Test: `apps/cli/src/__tests__/workspace/progress.test.ts`, `apps/cli/src/__tests__/workspace/progress-migrate.test.ts`

**Interfaces:**
- Produces: `type UnitStatus`, `UNIT_STATUSES: UnitStatus[]`, `ModuleProgress.units?: Record<string, UnitStatus>`, `updateUnitStatus(progress, module, unit, to): Progress`, `unitsBelow(mod: ModuleProgress, floor: UnitStatus): string[]`, `PROGRESS_VERSION = 3`.

- [ ] **Step 1: Write failing tests** (append to `progress.test.ts`)

```ts
import { updateUnitStatus, unitsBelow, migrateProgress, PROGRESS_VERSION } from "../../workspace/progress";

const base = () => ({
  project: "p", version: 3, dependencies: {},
  modules: { orders: { status: "decomposed", currentPhase: "decompose", features: {}, lastCommit: {},
    lastUpdated: "", units: {} as Record<string, any> } },
}) as any;

describe("units", () => {
  it("adds a new unit only as inventoried", () => {
    const p = updateUnitStatus(base(), "orders", "SCR_A001", "inventoried");
    expect(p.modules.orders.units!.SCR_A001).toBe("inventoried");
    expect(() => updateUnitStatus(base(), "orders", "SCR_A001", "extracted")).toThrow(/new unit/);
  });
  it("enforces order", () => {
    let p = updateUnitStatus(base(), "orders", "SCR_A001", "inventoried");
    expect(() => updateUnitStatus(p, "orders", "SCR_A001", "spec-draft")).toThrow(/Invalid unit transition/);
    p = updateUnitStatus(p, "orders", "SCR_A001", "extracted");
    p = updateUnitStatus(p, "orders", "SCR_A001", "spec-draft");
    expect(p.modules.orders.units!.SCR_A001).toBe("spec-draft");
  });
  it("blocked returns to any non-final status; static-review-only sits beside verified", () => {
    let p = base(); p.modules.orders.units = { SCR_A001: "built" };
    p = updateUnitStatus(p, "orders", "SCR_A001", "blocked");
    p = updateUnitStatus(p, "orders", "SCR_A001", "built");
    p = updateUnitStatus(p, "orders", "SCR_A001", "static-review-only");
    p = updateUnitStatus(p, "orders", "SCR_A001", "verified");
    p = updateUnitStatus(p, "orders", "SCR_A001", "parity-signed");
    expect(p.modules.orders.units!.SCR_A001).toBe("parity-signed");
  });
  it("unitsBelow lists units under a floor", () => {
    const mod = { ...base().modules.orders, units: { A: "spec-approved", B: "spec-draft", C: "blocked" } };
    expect(unitsBelow(mod, "spec-approved").sort()).toEqual(["B", "C"]);
  });
  it("migrates v2 to v3 with empty units", () => {
    const { progress, changed } = migrateProgress({ version: 2, modules: { a: { lastCommit: {} } } }, () => undefined);
    expect(changed).toBe(true);
    expect((progress as any).version).toBe(PROGRESS_VERSION);
    expect((progress as any).modules.a.units).toEqual({});
  });
});
```

- [ ] **Step 2:** Run `bun test src/__tests__/workspace/progress.test.ts`. Expected: FAIL (`updateUnitStatus` not exported).

- [ ] **Step 3: Implement** in `progress.ts`

```ts
export type UnitStatus =
  | "inventoried" | "extracted" | "spec-draft" | "spec-approved"
  | "built" | "verified" | "parity-signed" | "blocked" | "static-review-only";

/** Main line, in order. Side statuses are handled in VALID_UNIT_TRANSITIONS. */
export const UNIT_LINE: UnitStatus[] = [
  "inventoried", "extracted", "spec-draft", "spec-approved", "built", "verified", "parity-signed",
];
export const UNIT_STATUSES: UnitStatus[] = [...UNIT_LINE, "blocked", "static-review-only"];

const VALID_UNIT_TRANSITIONS: Record<UnitStatus, UnitStatus[]> = {
  inventoried: ["extracted", "blocked"],
  extracted: ["spec-draft", "blocked"],
  "spec-draft": ["spec-approved", "extracted", "blocked"],
  "spec-approved": ["built", "spec-draft", "blocked"],
  built: ["verified", "static-review-only", "blocked"],
  "static-review-only": ["verified", "built", "blocked"],
  verified: ["parity-signed", "built", "blocked"],
  "parity-signed": ["built"],
  blocked: ["inventoried", "extracted", "spec-draft", "spec-approved", "built", "static-review-only", "verified"],
};

/** Rank on the main line; side statuses rank as the step they sit on. */
function unitRank(s: UnitStatus): number {
  if (s === "static-review-only") return UNIT_LINE.indexOf("built");
  if (s === "blocked") return -1;
  return UNIT_LINE.indexOf(s);
}

export function unitsBelow(mod: ModuleProgress, floor: UnitStatus): string[] {
  return Object.entries(mod.units ?? {})
    .filter(([, s]) => unitRank(s) < unitRank(floor))
    .map(([u]) => u);
}

export function updateUnitStatus(progress: Progress, moduleName: string, unit: string, to: UnitStatus): Progress {
  const mod = progress.modules[moduleName];
  if (!mod) throw new Error(`Module '${moduleName}' not found`);
  const units = mod.units ?? {};
  const from = units[unit];
  if (from === undefined) {
    if (to !== "inventoried") throw new Error(`A new unit can start only at 'inventoried' (got '${to}')`);
  } else if (!VALID_UNIT_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid unit transition: ${from} → ${to}. Allowed: ${VALID_UNIT_TRANSITIONS[from].join(", ")}`);
  }
  return {
    ...progress,
    modules: { ...progress.modules, [moduleName]: { ...mod, units: { ...units, [unit]: to }, lastUpdated: new Date().toISOString() } },
  };
}
```

Add `units?: Record<string, UnitStatus>;` to `ModuleProgress`. In `readProgress` add `if (!isObject(mod.units)) mod.units = {};`. Set `PROGRESS_VERSION = 3`. In `migrateProgress`, replace the early return check and loop so that both v1 and v2 inputs get `units` (keep existing v1 `lastCommit` logic; for v2 keep `lastCommit` as is):

```ts
  const version = data.version ?? 1;
  if (version >= PROGRESS_VERSION) return { progress: raw, changed: false };
  // ... inside the loop, after computing lastCommit (v1) or keeping it (v2):
  const units = mod?.units && typeof mod.units === "object" && !Array.isArray(mod.units) ? mod.units : {};
  modules[name] = { ...mod, lastCommit: version >= 2 ? (mod.lastCommit ?? {}) : lastCommit, units };
```

- [ ] **Step 4:** Run `bun test`. Fix existing tests that assert `version: 2` after migration or init (search `version).toBe(2)` and `"version": 2` in `__tests__` and snapshots); update them to `3`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(cli): progress v3 with per-unit lifecycle`.

---

### Task 2: Manifest — legacy role, readOnly, migration block

**Files:**
- Modify: `apps/cli/src/workspace/manifest.ts`
- Test: `apps/cli/src/__tests__/workspace/manifest.test.ts`

**Interfaces:**
- Produces: `RepoRole` includes `"legacy"`; `RepoEntry.readOnly?: boolean`; `interface MigrationConfig { adapter?: string; unitId: RegExp; parentOf?: RegExp; acceptance: "parity" | "parity-with-approved-deviations"; liveLegacy: boolean }`; `readMigrationConfig(m: Manifest): MigrationConfig | null` (throws on an invalid block); `legacyRepo(m: Manifest): [string, RepoEntry] | null`.

- [ ] **Step 1: Failing tests**

```ts
import { parseManifest, readMigrationConfig, legacyRepo, normalizeRepos } from "../../workspace/manifest";

const MIG = `mode: migration
repos:
  legacy_src: { path: ../legacy_src, role: legacy, readOnly: true }
  backend: { path: ../backend, role: backend }
migration:
  adapter: sample
  unitId: '^SCR_[A-Z]\\d{3}(_P\\d+)?$'
  parentOf: '_P\\d+$'
  acceptance: parity-with-approved-deviations
  liveLegacy: true
`;

describe("migration manifest", () => {
  it("reads the migration block", () => {
    const c = readMigrationConfig(parseManifest(MIG))!;
    expect(c.adapter).toBe("sample");
    expect(c.unitId.test("SCR_A001_P1")).toBe(true);
    expect(c.unitId.test("X1")).toBe(false);
    expect(c.acceptance).toBe("parity-with-approved-deviations");
  });
  it("returns null outside migration mode", () => {
    expect(readMigrationConfig(parseManifest("mode: inherit\n"))).toBeNull();
  });
  it("throws on a bad block", () => {
    expect(() => readMigrationConfig(parseManifest("mode: migration\nmigration:\n  unitId: '('\n"))).toThrow(/unitId/);
    expect(() => readMigrationConfig(parseManifest("mode: migration\n"))).toThrow(/migration block/);
  });
  it("finds the legacy repo and keeps readOnly", () => {
    const [key, repo] = legacyRepo(parseManifest(MIG))!;
    expect(key).toBe("legacy_src");
    expect(repo.readOnly).toBe(true);
    expect(normalizeRepos(parseManifest(MIG).repos).backend.readOnly).toBeUndefined();
  });
});
```

- [ ] **Step 2:** Run; expected FAIL.
- [ ] **Step 3: Implement**

```ts
export type RepoRole = "frontend" | "backend" | "e2e" | "legacy" | "other";
// RepoEntry: add `readOnly?: boolean;`  REPO_FIELDS: add "readOnly"
// renderReposBlock: render booleans unquoted: `readOnly: true`

export interface MigrationConfig {
  adapter?: string;
  unitId: RegExp;
  parentOf?: RegExp;
  acceptance: "parity" | "parity-with-approved-deviations";
  liveLegacy: boolean;
}

function regex(value: unknown, field: string): RegExp {
  if (typeof value !== "string" || !value) throw new Error(`manifest migration.${field} must be a regex string`);
  try { return new RegExp(value); } catch { throw new Error(`manifest migration.${field} is not a valid regex: ${value}`); }
}

export function readMigrationConfig(m: Manifest): MigrationConfig | null {
  if (m.mode !== "migration") return null;
  const b = m.migration as Record<string, unknown> | undefined;
  if (!b || typeof b !== "object") throw new Error("mode: migration needs a migration block in manifest.yaml");
  const acceptance = (b.acceptance ?? "parity") as MigrationConfig["acceptance"];
  if (acceptance !== "parity" && acceptance !== "parity-with-approved-deviations") {
    throw new Error(`manifest migration.acceptance must be parity or parity-with-approved-deviations`);
  }
  return {
    adapter: typeof b.adapter === "string" && b.adapter ? b.adapter : undefined,
    unitId: regex(b.unitId, "unitId"),
    parentOf: b.parentOf === undefined ? undefined : regex(b.parentOf, "parentOf"),
    acceptance,
    liveLegacy: b.liveLegacy === true,
  };
}

export function legacyRepo(m: Manifest): [string, RepoEntry] | null {
  const found = Object.entries(normalizeRepos(m.repos)).find(([, r]) => r.role === "legacy");
  return found ?? null;
}
```

- [ ] **Step 4:** `bun test`; all PASS.
- [ ] **Step 5: Commit** `feat(cli): legacy repo role, readOnly and migration manifest block`.

---

### Task 3: Gate hook blocks readOnly repos

**Files:**
- Modify: `apps/cli/src/workspace/templates.ts` (generated `brainstorm-gate.ts` body, around `interface Repo` and `main()`)
- Test: `apps/cli/src/__tests__/hooks/brainstorm-gate.test.ts`

- [ ] **Step 1: Failing tests** (append; the file's `MANIFEST` gets a `legacy_src` repo)

```ts
describe("readOnly repos", () => {
  beforeEach(async () => {
    await writeFile(join(harenDir, "manifest.yaml"),
      MANIFEST + "  legacy_src:\n    path: ../legacy_src\n    role: legacy\n    readOnly: true\n");
    await mkdir(join(root, "legacy_src"), { recursive: true });
  });
  it("blocks writes to a readOnly repo even when a module is planned", async () => {
    await progress(planned());
    const r = await runGate(join(root, "legacy_src", "a.xml"));
    expect(r.code).toBe(2);
    expect(r.out).toContain("read-only");
  });
  it("keeps the block when the gate override is on", async () => {
    await progress({ ...planned(), gateOverride: { reason: "hotfix" } });
    expect((await runGate(join(root, "legacy_src", "a.xml"))).code).toBe(2);
  });
  it("keeps the block with HAREN_GATE=off", async () => {
    await progress(planned());
    expect((await runGate(join(root, "legacy_src", "a.xml"), { HAREN_GATE: "off" })).code).toBe(2);
  });
});
```

- [ ] **Step 2:** Run; FAIL (code 0).
- [ ] **Step 3: Implement** in the template string:
  - `interface Repo { path: string; role?: string; readOnly?: boolean }`; copy `readOnly: value.readOnly === true` (and `item?.readOnly === true` for arrays) in `normalizeRepos`.
  - At the start of `main()`, right after the "inside haren folder" allow, insert:

```ts
  if (target) {
    for (const repo of Object.values(await readRepos())) {
      if (repo.readOnly && inside(target, realRoot(repo.path))) {
        deny("This repo is read-only (manifest readOnly: true). It is the legacy source of truth. The gate override does not lift this block.");
      }
    }
  }
```

  This runs before the `HAREN_GATE === "off"` and override checks.
- [ ] **Step 4:** `bun test src/__tests__/hooks`; PASS. Regenerate the dogfood hook via `upgrade` (see Global Constraints).
- [ ] **Step 5: Commit** `feat(cli): gate blocks writes to read-only legacy repos`.

---

### Task 4: `haren track unit` and module gates

**Files:**
- Modify: `apps/cli/src/commands/track.ts`
- Test: `apps/cli/src/__tests__/commands/track.test.ts`

**Interfaces:**
- Consumes: `updateUnitStatus`, `unitsBelow`, `UNIT_STATUSES` (Task 1); `parseManifest`, `readMigrationConfig` (Task 2); `readAdapter(harenDir, name)` returns `AdapterSpec | null` (Task 6 — until then, add a local stub `async function adapterCommands(): Promise<Set<string>> { return new Set(); }` and replace it in Task 6).
- Produces: event `{ type: "unit-status", module, unit, from, to }`; exported `loadMigration(paths)`.

- [ ] **Step 1: Failing tests**

```ts
describe("haren track unit", () => {
  const migManifest = 'haren:\n  version: "1.5.0"\nmode: migration\nrepos:\n  legacy_src: { path: ../legacy_src, role: legacy, readOnly: true }\nmigration:\n  unitId: "^SCR_[A-Z]\\\\d{3}(_P\\\\d+)?$"\n';
  beforeEach(async () => { await writeFile(join(harenDir, "manifest.yaml"), migManifest); });

  it("records a unit and an event", async () => {
    await run("unit", "checkout", "SCR_A001", "inventoried");
    expect((await progress()).modules.checkout.units.SCR_A001).toBe("inventoried");
    expect((await events()).at(-1)).toMatchObject({ type: "unit-status", unit: "SCR_A001", to: "inventoried" });
  });
  it("rejects a unit id that does not match unitId", async () => {
    await expect(run("unit", "checkout", "BAD", "inventoried")).rejects.toThrow(/unitId/);
  });
  it("rejects units outside migration mode", async () => {
    await writeFile(join(harenDir, "manifest.yaml"), 'haren:\n  version: "1.5.0"\n');
    await expect(run("unit", "checkout", "SCR_A001", "inventoried")).rejects.toThrow(/mode: migration/);
  });
  it("blocks module 'completed' while a unit is below parity-signed", async () => {
    await run("unit", "checkout", "SCR_A001", "inventoried");
    // checkout is 'planned' in the fixture; walk it to evaluating
    await run("status", "checkout", "implementing");
    await run("status", "checkout", "evaluating");
    await expect(run("status", "checkout", "completed")).rejects.toThrow(/SCR_A001/);
  });
});
```

Add one test for the `planned` gate with a module at `decomposed` and a unit at `spec-draft`: `track status m planned` rejects with the unit name.

- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3: Implement**
  - Usage line `haren track unit <module> <unit> <status>`; `case "unit": return trackUnit(paths, rest);`.
  - `loadMigration(paths)`: read manifest, return `readMigrationConfig(...)`.
  - `trackUnit`: require migration config (else throw `track unit needs mode: migration in manifest.yaml`), validate status in `UNIT_STATUSES`, validate `unitId.test(unit)` (else throw `Unit 'X' does not match migration.unitId`), refuse `extracted` when the adapter declares `extract` and `spec-approved` when it declares `gate` (`Use haren migrate extract|gate; the adapter owns this step`), then `updateUnitStatus`, write, emit, print `  module/unit: from → to`.
  - In `trackStatus`, before `updateModuleStatus`, when migration config exists:

```ts
    const floor = to === "planned" ? "spec-approved" : to === "completed" ? "parity-signed" : null;
    if (floor) {
      const below = unitsBelow(progress.modules[module], floor);
      if (below.length) throw new Error(`Module '${module}' cannot be '${to}': units below '${floor}': ${below.join(", ")}`);
    }
```
- [ ] **Step 4:** `bun test`; PASS.
- [ ] **Step 5: Commit** `feat(cli): haren track unit and unit gates on module status`.

---

### Task 5: `track check` migration rules

**Files:**
- Modify: `apps/cli/src/commands/track.ts` (`checkWorkspace`)
- Test: `apps/cli/src/__tests__/commands/track.test.ts`

- [ ] **Step 1: Failing tests**

```ts
describe("track check in migration mode", () => {
  it("fails without a legacy repo", async () => {
    await writeFile(join(harenDir, "manifest.yaml"), 'haren:\n  version: "1.5.0"\nmode: migration\nmigration:\n  unitId: "^SCR_"\n');
    await expect(run("check")).rejects.toThrow(/role: legacy/);
  });
  it("fails when a unit id does not match unitId", async () => {
    // write progress with units { BAD: "inventoried" } directly in the fixture
  });
  it("fails when an approved unit has no passing gate.json in adapter mode", async () => {
    // manifest with migration.adapter: sample; unit SCR_A001 at spec-approved; no gate.json
    // expect /SCR_A001.*gate.json/
  });
});
```

Write the two commented tests fully: build the progress JSON with `writeFile(join(harenDir,"progress.json"), JSON.stringify({...}))` and assert the error regex in the comment.

- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3: Implement** in `checkWorkspace`, after the repo check:

```ts
  let mig: MigrationConfig | null = null;
  try { mig = readMigrationConfig(manifest); } catch (e) { errors.push((e as Error).message); }
  if (manifest.mode === "migration" && mig) {
    if (!legacyRepo(manifest)) errors.push("mode: migration needs one repo with role: legacy in manifest.yaml");
    for (const [name, mod] of Object.entries(progress.modules)) {
      for (const [unit, status] of Object.entries(mod.units ?? {})) {
        if (!mig.unitId.test(unit)) errors.push(`module '${name}' unit '${unit}' does not match migration.unitId`);
        if (mig.adapter && unitsBelow({ ...mod, units: { [unit]: status } }, "spec-approved").length === 0) {
          const gate = join(paths.harenDir, "artifacts", "02-discovery", "units", unit, "gate.json");
          const ok = existsSync(gate) && JSON.parse(await readFile(gate, "utf-8")).pass === true;
          if (!ok) errors.push(`unit '${unit}' is ${status} but artifacts/02-discovery/units/${unit}/gate.json is missing or not pass`);
        }
      }
    }
  }
```

Also exclude `02-discovery/units/**/gate.json` and IR files from the index rule: in `listArtifactFiles` only `.md` files are listed, so only `units/<unit>/spec.md` needs a row (keep as is).
- [ ] **Step 4:** `bun test`; PASS.
- [ ] **Step 5: Commit** `feat(cli): track check rules for migration workspaces`.

---

### Task 6: Plugin manifest `harenApi` "2" with adapter block

**Files:**
- Modify: `apps/cli/src/plugins/manifest.ts`
- Create: `apps/cli/src/plugins/adapter-spec.ts`
- Test: `apps/cli/src/__tests__/plugins/manifest.test.ts`

**Interfaces:**
- Produces: `HAREN_APIS = ["1", "2"]`; `PluginManifest.adapter?: AdapterSpec`; in `adapter-spec.ts`:

```ts
export const ADAPTER_COMMANDS = ["inventory", "extract", "gate"] as const;
export type AdapterCommand = (typeof ADAPTER_COMMANDS)[number];
export interface AdapterSpec {
  unitKind: string;
  commands: Partial<Record<AdapterCommand, string>>;
  skills: { spec?: string };
  semantics?: string; // path inside the plugin
}
export function validateAdapter(raw: unknown): AdapterSpec;
export async function readAdapter(harenDir: string, name: string): Promise<AdapterSpec | null>; // null when not installed or no adapter block
```

- [ ] **Step 1: Failing tests**

```ts
it("accepts harenApi 2 with an adapter block", () => {
  const m = validateManifest({ name: "sample-adapter", version: "0.1.0", harenApi: "2",
    adapter: { unitKind: "screen", commands: { gate: "bun tools/gate.ts {specPath}" }, skills: { spec: "sample-spec" } } });
  expect(m.adapter?.commands.gate).toBe("bun tools/gate.ts {specPath}");
});
it("rejects adapter on harenApi 1", () => {
  expect(() => validateManifest({ name: "x", version: "1", harenApi: "1", adapter: { unitKind: "s", commands: {} } })).toThrow(/harenApi "2"/);
});
it("rejects unknown adapter commands and unknown placeholders", () => {
  const bad = (commands: any) => () => validateManifest({ name: "x", version: "1", harenApi: "2", adapter: { unitKind: "s", commands } });
  expect(bad({ deploy: "x" })).toThrow(/Unknown adapter command/);
  expect(bad({ gate: "x {nope}" })).toThrow(/placeholder/);
});
it("rejects a semantics path outside the plugin", () => {
  expect(() => validateManifest({ name: "x", version: "1", harenApi: "2", adapter: { unitKind: "s", commands: {}, semantics: "../x.md" } })).toThrow(/inside the plugin/);
});
```

- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3: Implement.** In `manifest.ts`: accept `m.harenApi` in `HAREN_APIS`, keep returned `harenApi` as given; if `m.adapter !== undefined` and `harenApi !== "2"` throw `Plugin manifest: adapter needs harenApi "2"`; else `adapter: validateAdapter(m.adapter)`. Keep `HAREN_API` export as `"2"` for new plugins (check callers with `grep -rn HAREN_API apps/cli/src`). In `adapter-spec.ts`, allowed placeholders `{legacyRoot}`, `{unit}`, `{unitDir}`, `{specPath}`; check with `/\{(\w+)\}/g`; reuse the `relativePathList` rule for `semantics` (export it from `manifest.ts` as `assertInsidePlugin(path, field)`). `readAdapter` reads `plugins.json` via `readPlugins`, then `readInstalledManifest(pluginDir(harenDir, name))`, returns `.adapter ?? null`.
- [ ] **Step 4:** Replace the Task 4 stub with `readAdapter`. `bun test`; PASS.
- [ ] **Step 5: Commit** `feat(cli): plugin harenApi 2 with adapter contract`.

---

### Task 7: Adapter runner

**Files:**
- Create: `apps/cli/src/plugins/adapter-run.ts`
- Test: `apps/cli/src/__tests__/plugins/adapter-run.test.ts`

**Interfaces:**
- Produces:

```ts
export interface InventoryOut { units: { id: string; parent: string | null; family?: string; title?: string }[] }
export interface ExtractOut { unit: string; files: string[] }
export interface GateOut { unit: string; pass: boolean; findings: { severity: "error" | "warning"; rule: string; message: string }[] }
export class AdapterError extends Error {}
export function buildArgv(template: string, values: Record<string, string>): string[];
export async function runAdapter<T>(command: AdapterCommand, template: string, values: Record<string, string>, cwd: string): Promise<T>;
```

- [ ] **Step 1: Failing tests**

```ts
import { buildArgv, runAdapter, AdapterError } from "../../plugins/adapter-run";

it("substitutes placeholders as whole argv items, never through a shell", () => {
  expect(buildArgv("bun gate.ts {specPath} --unit {unit}", { specPath: "a b; rm -rf x", unit: "SCR_A001" }))
    .toEqual(["bun", "gate.ts", "a b; rm -rf x", "--unit", "SCR_A001"]);
});
it("parses and validates gate output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "adapter-"));
  await writeFile(join(dir, "g.ts"), 'console.log(JSON.stringify({unit:"SCR_A001",pass:true,findings:[]}))');
  expect(await runAdapter("gate", "bun g.ts", {}, dir)).toEqual({ unit: "SCR_A001", pass: true, findings: [] });
});
it("non-zero exit is an AdapterError", async () => {
  const dir = await mkdtemp(join(tmpdir(), "adapter-"));
  await writeFile(join(dir, "g.ts"), "process.exit(3)");
  await expect(runAdapter("gate", "bun g.ts", {}, dir)).rejects.toBeInstanceOf(AdapterError);
});
it("schema mismatch is an AdapterError", async () => {
  const dir = await mkdtemp(join(tmpdir(), "adapter-"));
  await writeFile(join(dir, "g.ts"), 'console.log(JSON.stringify({pass:"yes"}))');
  await expect(runAdapter("gate", "bun g.ts", {}, dir)).rejects.toThrow(/schema/);
});
```

- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3: Implement**

```ts
export function buildArgv(template: string, values: Record<string, string>): string[] {
  return template.trim().split(/\s+/).map((tok) => {
    const whole = /^\{(\w+)\}$/.exec(tok);
    if (whole) {
      if (!(whole[1] in values)) throw new AdapterError(`No value for placeholder {${whole[1]}}`);
      return values[whole[1]];
    }
    return tok.replace(/\{(\w+)\}/g, (_, k) => {
      if (!(k in values)) throw new AdapterError(`No value for placeholder {${k}}`);
      return values[k];
    });
  });
}

const isStr = (v: unknown) => typeof v === "string" && v.length > 0;
const VALIDATORS: Record<AdapterCommand, (o: any) => boolean> = {
  inventory: (o) => Array.isArray(o?.units) && o.units.every((u: any) => isStr(u?.id) && (u.parent === null || isStr(u.parent))),
  extract: (o) => isStr(o?.unit) && Array.isArray(o.files) && o.files.every(isStr),
  gate: (o) => isStr(o?.unit) && typeof o.pass === "boolean" && Array.isArray(o.findings)
    && o.findings.every((f: any) => (f?.severity === "error" || f?.severity === "warning") && isStr(f.rule) && typeof f.message === "string"),
};

export async function runAdapter<T>(command: AdapterCommand, template: string, values: Record<string, string>, cwd: string): Promise<T> {
  const argv = buildArgv(template, values);
  const proc = Bun.spawn(argv, { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new AdapterError(`adapter ${command} exited ${code}: ${err.trim().slice(0, 500)}`);
  let parsed: unknown;
  try { parsed = JSON.parse(out); } catch { throw new AdapterError(`adapter ${command} printed non-JSON output (schema)`); }
  if (!VALIDATORS[command](parsed)) throw new AdapterError(`adapter ${command} output does not match the schema`);
  return parsed as T;
}
```
- [ ] **Step 4:** `bun test`; PASS.
- [ ] **Step 5: Commit** `feat(cli): adapter runner with argv placeholders and schema checks`.

---

### Task 8: `haren migrate inventory|extract|gate`

**Files:**
- Create: `apps/cli/src/commands/migrate.ts`
- Modify: `apps/cli/src/index.ts` (add `migrate` to parse and dispatch, same pattern as `track`)
- Test: `apps/cli/src/__tests__/commands/migrate.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 4 (`loadMigration`), 6 (`readAdapter`, plugin dir), 7 (`runAdapter`).
- Produces: `migrate(args: string[], cwd?: string): Promise<void>`; `renderUnitMap(units, moduleOf): string`. Files: `artifacts/02-discovery/unit-map.md`, `artifacts/02-discovery/units/<unit>/` (IR files from the adapter), `.../gate.json`.

Behavior:
- Common: resolve haren dir, load migration config (error if not migration mode), resolve `legacyRoot` = absolute path of the `role: legacy` repo, resolve adapter (`readAdapter(harenDir, mig.adapter)`); if a needed command is missing, throw `Adapter has no <cmd> command. Do this step by hand (see skill extract)`. Run commands with `cwd` = plugin dir.
- `inventory [--module <m>]`: run; write/refresh `unit-map.md` (table `| Unit | Parent | Family | Title | Module |`; keep the existing Module cell for known units; new units get `--module` value or `-`). For each unit with a module and not yet in progress: `updateUnitStatus(..., "inventoried")` + event. Print new / known / disappeared counts; never delete units. Register the map with `upsertArtifactRow` (ID `UNITMAP-001`, type `unit-map`) if missing.
- `extract <unit>`: unit must exist in progress (find its module); run with `{unit}`, `{legacyRoot}`, `{unitDir}`; check `out.unit === unit`; status → `extracted` (if already past `extracted`, keep status and print `re-extracted`).
- `gate <unit> [--approve]`: spec path `units/<unit>/spec.md` must exist; run with `{specPath}`, `{unitDir}`; write `gate.json` = output + `ranAt`; on FAIL print findings, exit non-zero, no status change; on PASS require `--approve` or an interactive `y` (`prompt()` from Bun) then status → `spec-approved` with event `{ type: "unit-gate", unit, pass, approvedBy: "user" }`.

- [ ] **Step 1: Failing tests.** Build a temp workspace: haren dir with migration manifest (`adapter: fake`), `progress.json` with module `orders` at `decomposed`, `plugins.json` listing `fake`, and plugin dir `plugins/fake/` (use `pluginDir()` for the path) with `haren-plugin.json` (`harenApi: "2"`, commands calling small `bun` scripts that print fixed JSON). Tests:

```ts
it("inventory writes unit-map and inventoried units", async () => {
  await migrate(["inventory", "--module", "orders"], root);
  expect((await progress()).modules.orders.units).toEqual({ SCR_A001: "inventoried", SCR_A001_P1: "inventoried" });
  expect(await readFile(join(harenDir, "artifacts/02-discovery/unit-map.md"), "utf-8")).toContain("| SCR_A001_P1 | SCR_A001 |");
});
it("extract sets extracted", async () => { /* inventory, then extract SCR_A001 → status extracted */ });
it("gate FAIL keeps spec-draft and writes gate.json", async () => { /* fake gate prints pass:false */ });
it("gate PASS with --approve sets spec-approved", async () => { /* fake gate prints pass:true */ });
it("adapter error changes no status", async () => { /* fake gate exits 1 → rejects AdapterError, status unchanged */ });
```

Write each commented test fully with the fixture helpers (switch the fake gate script content per test with `writeFile`).
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3: Implement** `migrate.ts` per Behavior. Reuse `pathsFor`-style paths, `emit`, `upsertArtifactRow` from `track.ts` (export `emit` and `pathsFor` from `track.ts`).
- [ ] **Step 4:** `bun test`; PASS. Run `bun apps/cli/src/index.ts migrate` with no args → prints usage.
- [ ] **Step 5: Commit** `feat(cli): haren migrate inventory, extract and gate`.

---

### Task 9: Sample adapter and E2E

**Files:**
- Create: `examples/adapters/sample/haren-plugin.json`, `examples/adapters/sample/tools/{inventory,extract,gate}.ts`, `examples/adapters/sample/skills/sample-spec/SKILL.md`, `examples/adapters/sample/rules/legacy-semantics.md`, `examples/adapters/sample/README.md`, `examples/adapters/sample/fixture/legacy_src/{SCR_A001,SCR_A001_P1,SCR_B001}.screen.xml`
- Test: `apps/cli/src/__tests__/e2e/migration.test.ts`

Fake format (`SCR_A001.screen.xml`):

```xml
<screen id="SCR_A001" title="Order list" family="order">
  <field name="orderNo" bind="ORDER_TBL.ORDER_NO"/>
  <field name="status" bind="ORDER_TBL.STATUS"/>
  <writes table="ORDER_LOG"/>
</screen>
```

`SCR_A001_P1` has `parent="SCR_A001"`; `SCR_B001` family `report`, no writes.

- [ ] **Step 1:** Write `tools/inventory.ts` (read `*.screen.xml` under `--root`, regex out `id`, `parent`, `family`, `title`, print `{units}`), `tools/extract.ts` (copy the XML to `--out/ir.xml`, write `--out/view.txt` with one line per field, print `{unit, files}`), `tools/gate.ts` (rule `missing-binding`: every `bind` value in `--ir/ir.xml` must appear in the spec text; rule `missing-writes`: every `<writes table>` must appear under a `## Writes` heading; print `{unit, pass, findings}`).
- [ ] **Step 2:** `haren-plugin.json`:

```json
{
  "name": "sample-adapter",
  "version": "0.1.0",
  "harenApi": "2",
  "description": "Neutral example adapter for haren migration mode",
  "skills": ["skills/sample-spec"],
  "adapter": {
    "unitKind": "screen",
    "commands": {
      "inventory": "bun tools/inventory.ts --root {legacyRoot}",
      "extract": "bun tools/extract.ts {unit} --root {legacyRoot} --out {unitDir}",
      "gate": "bun tools/gate.ts {specPath} --ir {unitDir}"
    },
    "skills": { "spec": "sample-spec" },
    "semantics": "rules/legacy-semantics.md"
  }
}
```

- [ ] **Step 3:** `skills/sample-spec/SKILL.md`: read `ir.xml`, `view.txt`, `artifacts/01-research/legacy-semantics.md`; write `units/<unit>/spec.md` from `unit-spec.md` template with sections Fields, Bindings, Writes, Behavior, Parity checklist. `rules/legacy-semantics.md`: 3 fake rules (e.g. "A popup inherits its parent's filter values", "An empty bind means a computed field", "Writes happen only on save, never on load").
- [ ] **Step 4: E2E test:** temp workspace via `haren init` helpers used in `e2e/` tests (check existing e2e for the helper), set `mode: migration`, copy fixture to `legacy_src`, `haren plugin install <abs path to examples/adapters/sample>`, then: `migrate inventory --module orders` → 3 units; `migrate extract SCR_A001`; write a spec missing `ORDER_LOG`; `track unit orders SCR_A001 spec-draft`; `migrate gate SCR_A001 --approve` → rejects, `gate.json.pass === false`; fix spec; gate PASS → `spec-approved`; `track unit ... spec-approved` by hand is refused; `track status orders planned` refused (other units below); bring `SCR_A001_P1` and `SCR_B001` to `spec-approved` (move `SCR_B001` to its own module in unit-map first, or include it); `track status orders planned` succeeds; `track check` PASS (register specs with `track artifact`).
- [ ] **Step 5:** `bun test`; PASS. Run `scripts/scrub-check.sh`. Commit `feat: sample migration adapter and e2e flow`.

---

### Task 10: Templates and skills

**Files:**
- Create: `content/templates/{unit-map,unit-spec,legacy-semantics,deviation-log,parity-evidence}.md`, `content/skills/discover/migration.md`, `content/skills/extract/SKILL.md`
- Modify: `content/skills/discover/SKILL.md` (mode list + routing), `content/skills/plan/SKILL.md`, `content/skills/implement/SKILL.md`, `content/skills/evaluate/SKILL.md`, `content/skills/validate-artifact/SKILL.md`, `content/skills/read-context/SKILL.md`, `content/skills/update-tracking/SKILL.md`, `apps/cli/src/commands/init.ts` (mode list in skill.md "On Session Start" and mode choice: add `migration` = "rewrite of a legacy system with parity as the bar"; init accepts `--mode migration` if init has a mode flag — check `init-args`)
- Test: `apps/cli/src/__tests__/content/content.test.ts` (existing content checks: new skill dir has frontmatter `name`, templates referenced exist)

Content (each file written in ASD-STE100 style, no client terms):

- `unit-map.md`: frontmatter `type: unit-map`; table `| Unit | Parent | Family | Title | Module | Shared components |`; note "Generated by `haren migrate inventory`. Edit only the Module and Shared components columns."
- `unit-spec.md`: frontmatter `unit`, `module`, `source` (legacy path); sections Purpose, Fields, Bindings, Writes (tables and side effects), Behavior, Legacy traps (links to legacy-semantics rules), Parity checklist (`- [ ]` items), Manual gate (used only without an adapter gate: every binding covered, every write covered, reviewer, date).
- `legacy-semantics.md`: table `| Rule ID | Platform behavior | Wrong reading | Correct reading | Found by |`.
- `deviation-log.md`: table `| ID | Unit | Legacy behavior | Target behavior | Reason | Approved by | Date | Status |`; Status is `approved` or `revoked`; rule text: "Never delete a row. Revoke it."
- `parity-evidence.md`: frontmatter `unit`, `difference`, `verdict: matches-legacy | target-bug | approved-deviation`; sections Environment (legacy user, tenant, locale; target user, tenant, locale — must be equal), Steps, Legacy result, Target result, Evidence (screenshots, network, SQL), Verdict.
- `discover/migration.md`: steps per design §Skills (adapter inventory or manual `track unit ... inventoried`; group units into modules by family and shared tables; parent units travel with their popups; write `unit-map.md` and context brief; copy adapter semantics if missing; then `decompose`).
- `extract/SKILL.md`: frontmatter `name: extract`, `type: sequential`, `agent: researcher`; per unit: `haren migrate extract <unit>` (or manual: read legacy source, `track unit <m> <u> extracted`); write spec with the adapter skill named in the plugin `adapter.skills.spec`, or the template; read `legacy-semantics.md` first; `track unit ... spec-draft`; `haren migrate gate <unit>` until PASS; show the spec and gate result to the user; only after approval run `haren migrate gate <unit> --approve` (manual: tick Manual gate, then `track unit ... spec-approved`); register the spec with `haren track artifact`. HARD-GATE: never set `spec-approved` without user approval.
- plan: in migration mode, add to Process: read unit specs of the module and `deviation-log.md`; reuse inventory includes the legacy unit's Writes; tasks reference unit IDs as well as STORY-IDs.
- implement: read `deviation-log.md` before each task; never change behavior that has an `approved` deviation row back to legacy; after a unit's tasks pass, `track unit <m> <u> built`.
- evaluate: per unit run the parity checklist; with `liveLegacy: true` compare on both systems with the same user, tenant and locale; set `verified`, or `static-review-only` when the live system was not used; each difference closes only by a fix, a `parity-evidence` file, or an `approved` deviation row; BA sign-off → `parity-signed`; module `completed` only after all units are `parity-signed`.
- validate-artifact: add rules for Unit Spec (all sections, gate.json pass or Manual gate ticked), Deviation Log (all columns, approver present), Parity Evidence (environment equal on both sides, verdict set).
- read-context: in migration mode print unit counts per status per module and the legacy repo (read-only).
- update-tracking: rows for `track unit` and `migrate *`.

- [ ] **Step 1:** Write a failing content test: `content/skills/extract/SKILL.md` exists with `name: extract`; the five templates exist; `discover/SKILL.md` mentions `migration`.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Write all files above.
- [ ] **Step 4:** `bun test`; PASS. Run `bun apps/cli/src/index.ts upgrade --haren-dir .haren-dev --yes`; `track check --haren-dir .haren-dev` PASS.
- [ ] **Step 5:** Scrub check, commit `feat(content): migration mode templates and skills`.

---

### Task 11: Docs and agent verification

**Files:**
- Modify: `README.md`, `README.vi.md` (modes table: add `migration`; command list: `track unit`, `migrate inventory|extract|gate`; short "Write an adapter" section pointing to `examples/adapters/sample` and the JSON schemas)
- Modify: `apps/cli/package.json` version → `1.5.0` (and CHANGELOG if the repo has one)

- [ ] **Step 1:** Update docs.
- [ ] **Step 2:** Run the `verify-with-agent` skill: a fresh agent in a temp workspace built from the sample adapter fixture, prompt "start discovery" then "extract SCR_A001". Check: agent ran `haren migrate inventory`, wrote spec, ran gate, asked for approval, never edited `legacy_src`.
- [ ] **Step 3:** `bun test` full suite; scrub check; commit `docs: migration mode and adapter contract; release 1.5.0`.
- [ ] **Step 4:** Ask the user before tagging or publishing.

---

## Self-Review

- Spec coverage: manifest (T2), progress v3 (T1), track unit + module gates (T4), track check rules (T5), readOnly hook (T3), adapter contract (T6), argv runner + schemas (T7), migrate commands (T8), templates/skills (T10), sample adapter + e2e (T9), agent run + docs (T11), semantics copy on install (T8 `inventory`/T10 discover step — copy when `artifacts/01-research/legacy-semantics.md` is missing). Portal UI and `haren adapter new` are out of scope.
- Names used across tasks: `updateUnitStatus`, `unitsBelow`, `UNIT_STATUSES`, `readMigrationConfig`, `legacyRepo`, `MigrationConfig`, `AdapterSpec`, `readAdapter`, `runAdapter`, `buildArgv`, `AdapterError`, `loadMigration`, `emit`, `pathsFor`.
