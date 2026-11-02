import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import { legacyRepo, parseManifest, type MigrationConfig } from "../workspace/manifest";
import {
  readProgress,
  UNIT_LINE,
  updateUnitStatus,
  writeProgress,
  type Progress,
} from "../workspace/progress";
import { adapterMissingMessage, readAdapter } from "../plugins/adapter-read";
import type { AdapterCommand, AdapterSpec } from "../plugins/adapter-spec";
import {
  AdapterError,
  runAdapter,
  type ExtractOut,
  type GateOut,
  type InventoryOut,
} from "../plugins/adapter-run";
import { pluginDir } from "../plugins/state";
import { harenDirFlag, resolveHarenDir } from "../workspace/resolve";
import { emit, loadMigration, pathsFor, upsertArtifactRow, type TrackPaths } from "./track";

export const MIGRATE_USAGE = `Usage:
  haren migrate inventory [--module <m>]
  haren migrate extract <unit>
  haren migrate gate <unit> [--approve]
Options: --haren-dir <path>`;

const UNIT_MAP_HEADER =
  "| Unit | Parent | Family | Title | Module |\n|------|--------|--------|-------|--------|";

type InventoryUnit = InventoryOut["units"][number];

interface Ctx {
  paths: TrackPaths;
  migration: MigrationConfig;
  adapterName: string;
  adapter: AdapterSpec;
  legacyRoot: string;
}

function parseMigrateArgs(args: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--approve") flags.approve = true;
    else if (arg === "--module" || arg === "--haren-dir") {
      const value = args[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      flags[arg.slice(2)] = value;
    } else if (arg.startsWith("--haren-dir=")) flags["haren-dir"] = arg.split("=", 2)[1];
    else if (arg.startsWith("--module=")) flags.module = arg.split("=", 2)[1];
    else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  return { positional, flags };
}

const cell = (v: string | null | undefined) => (v ? v.replaceAll("|", "\\|") : "-");

/** The unit map table. `moduleOf` maps unit id to module name. */
export function renderUnitMap(
  units: InventoryUnit[],
  moduleOf: Record<string, string>,
  previous = "",
): string {
  const rows = units.map(
    (u) =>
      `| ${cell(u.id)} | ${cell(u.parent)} | ${cell(u.family)} | ${cell(u.title)} | ${cell(moduleOf[u.id])} |`,
  );
  const tail = afterUnitTable(previous);
  return `# Unit Map\n\n${UNIT_MAP_HEADER}\n${rows.join("\n")}\n${tail ? `\n${tail}\n` : ""}`;
}

/** The text after the unit table of an existing unit map (for example a "Shared components" section). */
function afterUnitTable(text: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^\|\s*Unit\s*\|/.test(l.trim()));
  if (start < 0) return "";
  let end = start;
  while (end < lines.length && lines[end].trim().startsWith("|")) end++;
  return lines.slice(end).join("\n").trim();
}

/** Rows of an existing unit map, keyed by unit id. */
function parseUnitMap(text: string): Map<string, { unit: InventoryUnit; module: string }> {
  const rows = new Map<string, { unit: InventoryUnit; module: string }>();
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    const c = t
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map((s) => s.trim().replaceAll("\\|", "|"));
    if (c.length < 5 || c[0] === "Unit" || /^-+$/.test(c[0])) continue;
    const v = (s: string) => (s === "-" ? undefined : s);
    rows.set(c[0], {
      unit: { id: c[0], parent: v(c[1]) ?? null, family: v(c[2]), title: v(c[3]) },
      module: v(c[4]) ?? "",
    });
  }
  return rows;
}

function moduleOfUnit(progress: Progress, unit: string): string {
  for (const [name, mod] of Object.entries(progress.modules)) {
    if (mod.units && unit in mod.units) return name;
  }
  throw new Error(`Unit '${unit}' is not in progress.json. Run haren migrate inventory first.`);
}

function commandFor(ctx: Ctx, cmd: AdapterCommand): string {
  const template = ctx.adapter.commands[cmd];
  if (!template)
    throw new Error(`Adapter has no ${cmd} command. Do this step by hand (see skill extract)`);
  return template;
}

function checkUnitId(ctx: Ctx, unit: string | undefined): string {
  if (!unit) throw new Error(`Missing <unit>.\n${MIGRATE_USAGE}`);
  if (!ctx.migration.unitId.test(unit)) {
    throw new Error(`Unit '${unit}' does not match migration.unitId`);
  }
  return unit;
}

const unitDirFor = (ctx: Ctx, unit: string) =>
  join(ctx.paths.harenDir, "artifacts", "02-discovery", "units", unit);

async function loadContext(harenDir: string): Promise<Ctx> {
  const paths = pathsFor(harenDir);
  const migration = await loadMigration(paths);
  if (!migration) throw new Error("haren migrate needs mode: migration in manifest.yaml");
  const manifest = parseManifest(await readFile(join(harenDir, "manifest.yaml"), "utf-8"));
  const legacy = legacyRepo(manifest);
  if (!legacy) throw new Error("haren migrate needs a repo with role: legacy in manifest.yaml");
  if (!migration.adapter) throw new Error("manifest migration.adapter is not set");
  const adapter = await readAdapter(harenDir, migration.adapter);
  if (!adapter) throw new Error(adapterMissingMessage(migration.adapter));
  return {
    paths,
    migration,
    adapterName: migration.adapter,
    adapter,
    legacyRoot: resolve(harenDir, legacy[1].path),
  };
}

export async function migrate(args: string[], cwd = process.cwd()): Promise<void> {
  const { positional, flags } = parseMigrateArgs(args);
  const [sub, unitArg] = positional;
  if (!sub) {
    console.log(MIGRATE_USAGE);
    return;
  }
  if (!["inventory", "extract", "gate"].includes(sub)) {
    throw new Error(`Unknown migrate command: ${sub}\n${MIGRATE_USAGE}`);
  }
  const location = await resolveHarenDir(cwd, { harenDir: harenDirFlag(args), env: process.env });
  if (!location) throw new Error("No haren folder found. Run `haren init` first.");
  const ctx = await loadContext(location.harenDir);

  if (sub === "inventory") return inventory(ctx, flags.module as string | undefined);
  const unit = checkUnitId(ctx, unitArg);
  if (sub === "extract") return extract(ctx, unit);
  return gate(ctx, unit, flags.approve === true);
}

async function inventory(ctx: Ctx, moduleFlag: string | undefined): Promise<void> {
  const template = commandFor(ctx, "inventory");
  let progress = await readProgress(ctx.paths.progress);
  if (moduleFlag && !progress.modules[moduleFlag]) {
    throw new Error(`Unknown module '${moduleFlag}'`);
  }
  const raw = await runAdapter<InventoryOut>(
    "inventory",
    template,
    { legacyRoot: ctx.legacyRoot },
    pluginDir(ctx.paths.harenDir, ctx.adapterName),
  );
  const badIds = raw.units.filter((u) => !ctx.migration.unitId.test(u.id)).map((u) => u.id);
  const out = { units: raw.units.filter((u) => ctx.migration.unitId.test(u.id)) };
  const mapRel = "artifacts/02-discovery/unit-map.md";
  const mapPath = join(ctx.paths.harenDir, mapRel);
  const previous = existsSync(mapPath) ? await readFile(mapPath, "utf-8") : "";
  const known = parseUnitMap(previous);

  const moduleOf: Record<string, string> = {};
  const units: InventoryUnit[] = [];
  const seen = new Set<string>();
  let fresh = 0;
  for (const u of out.units) {
    seen.add(u.id);
    units.push(u);
    const prev = known.get(u.id);
    if (prev) moduleOf[u.id] = prev.module;
    else {
      fresh++;
      if (moduleFlag) moduleOf[u.id] = moduleFlag;
    }
  }
  const gone = [...known.keys()].filter((id) => !seen.has(id));
  for (const id of gone) {
    const row = known.get(id)!;
    units.push(row.unit);
    moduleOf[id] = row.module;
  }

  await mkdir(dirname(mapPath), { recursive: true });
  await writeFile(mapPath, renderUnitMap(units, moduleOf, previous));

  const added: [string, string][] = [];
  const skipped: { unit: string; module: string }[] = [];
  for (const u of out.units) {
    const mod = moduleOf[u.id];
    if (mod && !progress.modules[mod]) skipped.push({ unit: u.id, module: mod });
    if (!mod || !progress.modules[mod]) continue;
    if (progress.modules[mod].units?.[u.id] !== undefined) continue;
    progress = updateUnitStatus(progress, mod, u.id, "inventoried");
    added.push([mod, u.id]);
  }
  if (added.length) await writeProgress(ctx.paths.progress, progress);
  for (const [module, unit] of added) {
    await emit(ctx.paths, { type: "unit-status", module, unit, from: null, to: "inventoried" });
  }

  const registry = existsSync(ctx.paths.registry)
    ? await readFile(ctx.paths.registry, "utf-8")
    : "";
  if (!/^\|\s*UNITMAP-001\s*\|/m.test(registry)) {
    await mkdir(dirname(ctx.paths.registry), { recursive: true });
    await writeFile(
      ctx.paths.registry,
      upsertArtifactRow(registry, ["UNITMAP-001", "unit-map", "-", "draft", mapRel]),
    );
  }
  console.log(
    `  inventory: ${fresh} new, ${out.units.length - fresh} known, ${gone.length} disappeared`,
  );
  if (gone.length) console.log(`  disappeared (kept): ${gone.join(", ")}`);
  if (badIds.length) {
    console.log(`  warning: dropped, id does not match migration.unitId: ${badIds.join(", ")}`);
  }
  if (skipped.length) {
    const missing = [...new Set(skipped.map((s) => s.module))];
    console.log(
      `  warning: skipped, module not in progress.json: ${skipped.map((s) => `${s.unit} (${s.module})`).join(", ")}. Run ${missing.map((m) => `\`haren track status ${m} decomposed\``).join(", ")}, or fix the Module cell in unit-map.md, then run inventory again.`,
    );
  }
}

async function extract(ctx: Ctx, unit: string): Promise<void> {
  const template = commandFor(ctx, "extract");
  const progress = await readProgress(ctx.paths.progress);
  const module = moduleOfUnit(progress, unit);
  const unitDir = unitDirFor(ctx, unit);
  await mkdir(unitDir, { recursive: true });
  const out = await runAdapter<ExtractOut>(
    "extract",
    template,
    { unit, legacyRoot: ctx.legacyRoot, unitDir },
    pluginDir(ctx.paths.harenDir, ctx.adapterName),
  );
  if (out.unit !== unit) {
    throw new AdapterError(`adapter extract returned unit '${out.unit}', expected '${unit}'`);
  }
  const from = progress.modules[module].units![unit];
  if (UNIT_LINE.indexOf(from) > UNIT_LINE.indexOf("extracted")) {
    console.log(
      `  ${module}/${unit}: re-extracted (${out.files.length} files), status stays ${from}`,
    );
    return;
  }
  if (from !== "extracted") {
    await writeProgress(ctx.paths.progress, updateUnitStatus(progress, module, unit, "extracted"));
    await emit(ctx.paths, { type: "unit-status", module, unit, from, to: "extracted" });
  }
  console.log(`  ${module}/${unit}: ${from} → extracted (${out.files.length} files)`);
}

async function gate(ctx: Ctx, unit: string, approve: boolean): Promise<void> {
  const template = commandFor(ctx, "gate");
  const progress = await readProgress(ctx.paths.progress);
  const module = moduleOfUnit(progress, unit);
  const unitDir = unitDirFor(ctx, unit);
  const specPath = join(unitDir, "spec.md");
  if (!existsSync(specPath)) throw new Error(`No spec at ${specPath}. Write the spec first.`);
  const from = progress.modules[module].units![unit];
  if (from !== "spec-draft" && from !== "spec-approved") {
    throw new Error(`Unit '${unit}' is '${from}'; gate needs spec-draft`);
  }

  let out: GateOut;
  try {
    out = await runAdapter<GateOut>(
      "gate",
      template,
      { specPath, unitDir },
      pluginDir(ctx.paths.harenDir, ctx.adapterName),
    );
  } catch (e) {
    console.error(`  adapter error: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
  await writeFile(
    join(unitDir, "gate.json"),
    `${JSON.stringify({ ...out, ranAt: new Date().toISOString() }, null, 2)}\n`,
  );

  if (!out.pass) {
    for (const f of out.findings) console.log(`  [${f.severity}] ${f.rule}: ${f.message}`);
    if (from === "spec-approved") {
      // The spec changed after approval and no longer passes: approval is void.
      await writeProgress(
        ctx.paths.progress,
        updateUnitStatus(progress, module, unit, "spec-draft"),
      );
      await emit(ctx.paths, { type: "unit-status", module, unit, from, to: "spec-draft" });
      console.log(`  ${module}/${unit}: spec-approved → spec-draft`);
      throw new Error(
        `gate FAIL for ${unit}: ${out.findings.length} finding(s). Status is now spec-draft.`,
      );
    }
    throw new Error(
      `gate FAIL for ${unit}: ${out.findings.length} finding(s). Status stays ${from}.`,
    );
  }
  for (const f of out.findings) console.log(`  [${f.severity}] ${f.rule}: ${f.message}`);
  console.log(`  gate PASS for ${unit}`);

  if (!approve) {
    if (!process.stdin.isTTY) {
      throw new Error("Not approved. Review the spec, then re-run with --approve.");
    }
    const answer = prompt(`  Approve the spec of ${unit}? [y/N]`);
    if (answer?.trim().toLowerCase() !== "y") {
      console.log(`  Not approved. Status stays ${from}.`);
      return;
    }
  }
  if (from !== "spec-approved") {
    await writeProgress(
      ctx.paths.progress,
      updateUnitStatus(progress, module, unit, "spec-approved"),
    );
    await emit(ctx.paths, { type: "unit-status", module, unit, from, to: "spec-approved" });
  }
  await emit(ctx.paths, { type: "unit-gate", module, unit, pass: true, approvedBy: "user" });
  console.log(`  ${module}/${unit}: ${from} → spec-approved`);
}
