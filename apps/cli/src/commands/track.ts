import { existsSync } from "fs";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { dirname, join, relative, sep } from "path";
import {
  legacyRepo,
  normalizeRepos,
  parseManifest,
  readMigrationConfig,
  setUiModeText,
  UI_MODES,
  type UiMode,
  type MigrationConfig,
} from "../workspace/manifest";
import { appendEvent, EVENT_PHASES, isEventPhase, type HarenEvent } from "../workspace/events";
import {
  FEATURE_STATUSES,
  MODULE_STATUSES,
  phaseForStatus,
  readProgress,
  unitAtLeast,
  unitsBelow,
  UNIT_STATUSES,
  updateFeatureStatus,
  updateModuleStatus,
  updateUnitStatus,
  writeProgress,
  type FeatureStatus,
  type ModuleStatus,
  type Progress,
  type UnitStatus,
} from "../workspace/progress";
import { adapterMissingMessage, readAdapter } from "../plugins/adapter-read";
import { harenDirFlag, resolveHarenDir } from "../workspace/resolve";

export const TRACK_USAGE = `Usage:
  haren track status <module> <status> [--branch <name>] [--repos <key1,key2>]
  haren track feature <module> <feature> [status]
  haren track unit <module> <unit> <status>
  haren track commit <module> <repoKey> <sha>
  haren track depends <module> [dep ...]
  haren track artifact <id> --type <type> --path <path> [--module <m>] [--status <s>]
  haren track event <type> [--module m] [--phase p] [--feature f] [--data '<json object>']
  haren track override on --reason "<text>" [--hours <n>]
  haren track override off
  haren track ui-mode <ask|ascii|browser>
  haren track check
Options: --haren-dir <path>`;

const VALUE_FLAGS = [
  "--haren-dir",
  "--type",
  "--path",
  "--module",
  "--status",
  "--phase",
  "--feature",
  "--data",
  "--reason",
  "--hours",
  "--branch",
  "--repos",
];

interface ParsedTrackArgs {
  positional: string[];
  flags: Record<string, string>;
}

export function parseTrackArgs(args: string[]): ParsedTrackArgs {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const name = eq === -1 ? arg : arg.slice(0, eq);
      if (!VALUE_FLAGS.includes(name)) throw new Error(`Unknown option: ${name}`);
      const value = eq === -1 ? args[++i] : arg.slice(eq + 1);
      if (value === undefined) throw new Error(`${name} needs a value`);
      flags[name.slice(2)] = value;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

export interface TrackPaths {
  harenDir: string;
  progress: string;
  events: string;
  registry: string;
}

export function pathsFor(harenDir: string): TrackPaths {
  return {
    harenDir,
    progress: join(harenDir, "progress.json"),
    events: join(harenDir, "events", "events.jsonl"),
    registry: join(harenDir, "artifacts", "_registry", "artifact-index.md"),
  };
}

export async function emit(paths: TrackPaths, event: Omit<HarenEvent, "timestamp">): Promise<void> {
  await mkdir(dirname(paths.events), { recursive: true });
  await appendEvent(paths.events, { ...event, timestamp: new Date().toISOString() } as HarenEvent);
}

function need(value: string | undefined, what: string): string {
  if (value === undefined || value === "") throw new Error(`Missing ${what}.\n${TRACK_USAGE}`);
  return value;
}

function requireModule(progress: Progress, name: string): void {
  if (!progress.modules[name]) {
    const known = Object.keys(progress.modules);
    throw new Error(
      `Unknown module '${name}'. Known modules: ${known.length ? known.join(", ") : "(none)"}`,
    );
  }
}

async function loadProgress(paths: TrackPaths): Promise<Progress> {
  if (!existsSync(paths.progress)) throw new Error(`No progress.json in ${paths.harenDir}`);
  return readProgress(paths.progress);
}

export async function track(args: string[], cwd = process.cwd()): Promise<void> {
  const { positional, flags } = parseTrackArgs(args);
  const [sub, ...rest] = positional;
  if (!sub) {
    console.log(TRACK_USAGE);
    return;
  }

  const location = await resolveHarenDir(cwd, {
    harenDir: harenDirFlag(args),
    env: process.env,
  });
  if (!location) throw new Error("No haren folder found. Run `haren init` first.");
  const paths = pathsFor(location.harenDir);

  switch (sub) {
    case "status":
      return trackStatus(paths, rest, flags);
    case "feature":
      return trackFeature(paths, rest);
    case "unit":
      return trackUnit(paths, rest);
    case "commit":
      return trackCommit(paths, rest);
    case "depends":
      return trackDepends(paths, rest);
    case "artifact":
      return trackArtifact(paths, rest, flags);
    case "event":
      return trackEvent(paths, rest, flags);
    case "override":
      return trackOverride(paths, rest, flags);
    case "ui-mode":
      return trackUiMode(paths, rest);
    case "check":
      return trackCheck(paths);
    default:
      throw new Error(`Unknown track command: ${sub}\n${TRACK_USAGE}`);
  }
}

async function trackUiMode(paths: TrackPaths, rest: string[]): Promise<void> {
  const mode = need(rest[0], "ui mode");
  if (!UI_MODES.includes(mode as UiMode)) {
    throw new Error(`Invalid ui mode '${mode}'. Use ${UI_MODES.join(", ")}.`);
  }
  const manifestPath = join(paths.harenDir, "manifest.yaml");
  if (!existsSync(manifestPath)) throw new Error(`No manifest.yaml in ${paths.harenDir}`);
  const text = await readFile(manifestPath, "utf-8");
  await writeFile(manifestPath, setUiModeText(text, mode as UiMode));
  await emit(paths, { type: "ui-mode", mode });
  console.log(`  UI mockups mode: ${mode}.`);
}

export async function loadMigration(paths: TrackPaths): Promise<MigrationConfig | null> {
  const manifestPath = join(paths.harenDir, "manifest.yaml");
  if (!existsSync(manifestPath)) return null;
  return readMigrationConfig(parseManifest(await readFile(manifestPath, "utf-8")));
}

/**
 * The command names the migration adapter declares; empty when none is set.
 * Null when the manifest names an adapter that is not installed.
 */
async function adapterCommands(
  paths: TrackPaths,
  migration: MigrationConfig,
): Promise<Set<string> | null> {
  if (!migration.adapter) return new Set();
  const adapter = await readAdapter(paths.harenDir, migration.adapter);
  if (!adapter) return null;
  return new Set(Object.keys(adapter.commands));
}

async function trackUnit(paths: TrackPaths, rest: string[]): Promise<void> {
  const module = need(rest[0], "<module>");
  const unit = need(rest[1], "<unit>");
  const to = need(rest[2], "<status>") as UnitStatus;
  const migration = await loadMigration(paths);
  if (!migration) throw new Error("track unit needs mode: migration in manifest.yaml");
  if (!UNIT_STATUSES.includes(to)) {
    throw new Error(`Invalid unit status '${to}'. Allowed: ${UNIT_STATUSES.join(", ")}`);
  }
  if (!migration.unitId.test(unit)) {
    throw new Error(`Unit '${unit}' does not match migration.unitId`);
  }
  const commands = await adapterCommands(paths, migration);
  if (!commands) {
    if (to === "extracted" || to === "spec-approved") {
      throw new Error(adapterMissingMessage(migration.adapter as string));
    }
  } else if (
    (to === "extracted" && commands.has("extract")) ||
    (to === "spec-approved" && commands.has("gate"))
  ) {
    throw new Error("Use haren migrate extract|gate; the adapter owns this step");
  }
  const progress = await loadProgress(paths);
  requireModule(progress, module);
  const from = progress.modules[module].units?.[unit] ?? null;
  const next = updateUnitStatus(progress, module, unit, to);
  await writeProgress(paths.progress, next);
  await emit(paths, { type: "unit-status", module, unit, from, to });
  console.log(`  ${module}/${unit}: ${from ?? "(new)"} → ${to}`);
}

/** The branch and repos given with --branch and --repos. Repo keys must exist in manifest.yaml. */
async function moduleMeta(
  paths: TrackPaths,
  flags: Record<string, string>,
): Promise<{ branch?: string; repos?: string[] }> {
  const meta: { branch?: string; repos?: string[] } = {};
  if (flags.branch !== undefined) meta.branch = need(flags.branch, "--branch <name>");
  if (flags.repos !== undefined) {
    const repos = [
      ...new Set(
        flags.repos
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean),
      ),
    ];
    if (!repos.length) throw new Error(`Missing --repos <key1,key2>.\n${TRACK_USAGE}`);
    const manifestPath = join(paths.harenDir, "manifest.yaml");
    const manifest = existsSync(manifestPath)
      ? parseManifest(await readFile(manifestPath, "utf-8"))
      : {};
    const declared = Object.keys(normalizeRepos(manifest.repos));
    const unknown = repos.filter((r) => !declared.includes(r));
    if (unknown.length) {
      throw new Error(
        `Unknown repo key: ${unknown.join(", ")}. manifest.yaml repos: ${declared.length ? declared.join(", ") : "(none)"}`,
      );
    }
    meta.repos = repos;
  }
  return meta;
}

async function trackStatus(
  paths: TrackPaths,
  rest: string[],
  flags: Record<string, string>,
): Promise<void> {
  const module = need(rest[0], "<module>");
  const to = need(rest[1], "<status>") as ModuleStatus;
  if (!MODULE_STATUSES.includes(to)) {
    throw new Error(`Invalid module status '${to}'. Allowed: ${MODULE_STATUSES.join(", ")}`);
  }
  const progress = await loadProgress(paths);
  const meta = await moduleMeta(paths, flags);
  // Same status plus --branch or --repos only updates the branch and repos.
  const metaOnly = progress.modules[module]?.status === to && Object.keys(meta).length > 0;
  const migration = await loadMigration(paths);
  if (migration && progress.modules[module] && !metaOnly) {
    const floor = to === "planned" ? "spec-approved" : to === "completed" ? "parity-signed" : null;
    if (floor) {
      const below = unitsBelow(progress.modules[module], floor);
      if (below.length) {
        throw new Error(
          `Module '${module}' cannot be '${to}': units below '${floor}': ${below.join(", ")}`,
        );
      }
    }
  }
  let next: Progress;
  let from: ModuleStatus | null = null;
  if (!progress.modules[module]) {
    if (to !== "discovered" && to !== "decomposed") {
      throw new Error(
        `Unknown module '${module}'. A new module can start only at 'discovered' or 'decomposed'.`,
      );
    }
    next = {
      ...progress,
      modules: {
        ...progress.modules,
        [module]: {
          status: to,
          currentPhase: phaseForStatus(to),
          features: {},
          lastCommit: {},
          ...meta,
          lastUpdated: new Date().toISOString(),
        },
      },
    };
  } else {
    from = progress.modules[module].status;
    next = metaOnly ? progress : updateModuleStatus(progress, module, to);
    next = {
      ...next,
      modules: {
        ...next.modules,
        [module]: { ...next.modules[module], ...meta, lastUpdated: new Date().toISOString() },
      },
    };
  }
  await writeProgress(paths.progress, next);
  await emit(paths, { type: "module-status", module, from, to, phase: phaseForStatus(to) });
  console.log(`  ${module}: ${from ?? "(new)"} → ${to}`);
}

async function trackFeature(paths: TrackPaths, rest: string[]): Promise<void> {
  const module = need(rest[0], "<module>");
  const feature = need(rest[1], "<feature>");
  const to = rest[2] as FeatureStatus | undefined;
  const progress = await loadProgress(paths);
  requireModule(progress, module);
  const mod = progress.modules[module];
  let next: Progress;
  let from: FeatureStatus | null = null;
  if (to === undefined) {
    if (mod.features[feature] !== undefined) {
      throw new Error(`Feature '${feature}' already exists in module '${module}'`);
    }
    next = {
      ...progress,
      modules: {
        ...progress.modules,
        [module]: {
          ...mod,
          features: { ...mod.features, [feature]: "pending" },
          lastUpdated: new Date().toISOString(),
        },
      },
    };
  } else {
    if (!FEATURE_STATUSES.includes(to)) {
      throw new Error(`Invalid feature status '${to}'. Allowed: ${FEATURE_STATUSES.join(", ")}`);
    }
    from = mod.features[feature] ?? null;
    next = updateFeatureStatus(progress, module, feature, to);
  }
  const status = to ?? "pending";
  await writeProgress(paths.progress, next);
  await emit(paths, { type: "feature-status", module, feature, from, to: status });
  console.log(`  ${module}/${feature}: ${from ?? "(new)"} → ${status}`);
}

async function trackCommit(paths: TrackPaths, rest: string[]): Promise<void> {
  const module = need(rest[0], "<module>");
  const repo = need(rest[1], "<repoKey>");
  const sha = need(rest[2], "<sha>");
  const progress = await loadProgress(paths);
  requireModule(progress, module);
  const mod = progress.modules[module];
  const repos = Array.isArray(mod.repos) ? mod.repos : [];
  const next: Progress = {
    ...progress,
    modules: {
      ...progress.modules,
      [module]: {
        ...mod,
        lastCommit: { ...mod.lastCommit, [repo]: sha },
        branch: mod.branch || `feat/${module}`,
        repos: repos.includes(repo) ? repos : [...repos, repo],
        lastUpdated: new Date().toISOString(),
      },
    },
  };
  await writeProgress(paths.progress, next);
  await emit(paths, { type: "commit", module, repo, sha });
  console.log(`  ${module}: lastCommit.${repo} = ${sha}`);
}

/** A path that closes a cycle when `module` depends on `deps`; null when there is none. */
function findCycle(
  graph: Record<string, string[]>,
  module: string,
  deps: string[],
): string[] | null {
  const next = { ...graph, [module]: deps };
  // Each node is expanded once: a node that did not reach `module` before never will.
  const visited = new Set<string>([module]);
  const visit = (node: string, path: string[]): string[] | null => {
    for (const dep of next[node] ?? []) {
      if (dep === module) return [...path, dep];
      if (visited.has(dep)) continue;
      visited.add(dep);
      const found = visit(dep, [...path, dep]);
      if (found) return found;
    }
    return null;
  };
  return visit(module, [module]);
}

async function trackDepends(paths: TrackPaths, rest: string[]): Promise<void> {
  const module = need(rest[0], "<module>");
  const deps = [...new Set(rest.slice(1))];
  const progress = await loadProgress(paths);
  requireModule(progress, module);
  for (const dep of deps) requireModule(progress, dep);
  const graph = progress.dependencies ?? {};
  const cycle = findCycle(graph, module, deps);
  if (cycle) throw new Error(`Dependency cycle: ${cycle.join(" → ")}`);
  await writeProgress(paths.progress, {
    ...progress,
    dependencies: { ...graph, [module]: deps },
  });
  await emit(paths, { type: "dependencies", module, dependsOn: deps });
  console.log(`  ${module} depends on: ${deps.length ? deps.join(", ") : "(none)"}`);
}

const REGISTRY_HEADER = `| ID | Type | Module | Status | Path |\n|----|------|--------|--------|------|`;

/** Insert or replace the row for `id` in the artifact index table. */
export function upsertArtifactRow(text: string, cells: string[]): string {
  const row = `| ${cells.map((c) => c.replaceAll("|", "\\|")).join(" | ")} |`;
  const lines = text.split("\n");
  let lastRow = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("|")) continue;
    lastRow = i;
    const id = line.slice(1).split("|")[0].trim();
    if (id === cells[0]) {
      lines[i] = row;
      return lines.join("\n");
    }
  }
  if (lastRow === -1) {
    const base = text.trimEnd();
    return `${base ? base + "\n\n" : ""}${REGISTRY_HEADER}\n${row}\n`;
  }
  lines.splice(lastRow + 1, 0, row);
  return lines.join("\n");
}

async function trackArtifact(
  paths: TrackPaths,
  rest: string[],
  flags: Record<string, string>,
): Promise<void> {
  const id = need(rest[0], "<id>");
  const artifactType = need(flags.type, "--type <type>");
  const path = need(flags.path, "--path <path>");
  const module = flags.module ?? "-";
  const status = flags.status ?? "draft";
  if (flags.module) {
    const progress = await loadProgress(paths);
    requireModule(progress, flags.module);
  }
  const existing = existsSync(paths.registry) ? await readFile(paths.registry, "utf-8") : "";
  await mkdir(dirname(paths.registry), { recursive: true });
  await writeFile(
    paths.registry,
    upsertArtifactRow(existing, [id, artifactType, module, status, path]),
  );
  await emit(paths, {
    type: "artifact",
    id,
    artifactType,
    path,
    status,
    ...(flags.module ? { module: flags.module } : {}),
  });
  console.log(`  artifact ${id} → ${path}`);
}

async function trackEvent(
  paths: TrackPaths,
  rest: string[],
  flags: Record<string, string>,
): Promise<void> {
  const type = need(rest[0], "<type>");
  if (flags.phase !== undefined && !isEventPhase(flags.phase)) {
    throw new Error(`Invalid phase '${flags.phase}'. Allowed: ${EVENT_PHASES.join(", ")}`);
  }
  let data: Record<string, unknown> = {};
  if (flags.data !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(flags.data);
    } catch {
      throw new Error("--data must be a JSON object");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("--data must be a JSON object");
    }
    data = parsed as Record<string, unknown>;
  }
  const event: Record<string, unknown> = { ...data, type };
  if (flags.module) event.module = flags.module;
  if (flags.phase) event.phase = flags.phase;
  if (flags.feature) event.feature = flags.feature;
  await emit(paths, event as Omit<HarenEvent, "timestamp">);
  console.log(`  event ${type}`);
}

async function trackOverride(
  paths: TrackPaths,
  rest: string[],
  flags: Record<string, string>,
): Promise<void> {
  const action = need(rest[0], "on|off");
  const progress = await loadProgress(paths);
  if (action === "on") {
    const reason = need(flags.reason, '--reason "<text>"');
    const hours = flags.hours === undefined ? 2 : Number(flags.hours);
    if (!Number.isFinite(hours) || hours <= 0) {
      throw new Error("--hours must be a positive number");
    }
    const until = new Date(Date.now() + hours * 3_600_000).toISOString();
    await writeProgress(paths.progress, { ...progress, gateOverride: { reason, until } });
    await emit(paths, { type: "gate-override", action: "on", reason, until });
    console.log(`  Gate override on until ${until}. Run \`haren track override off\` when done.`);
  } else if (action === "off") {
    const { gateOverride: _removed, ...next } = progress;
    await writeProgress(paths.progress, next as Progress);
    await emit(paths, { type: "gate-override", action: "off" });
    console.log("  Gate override off.");
  } else {
    throw new Error(`Unknown override action '${action}'. Use on or off.`);
  }
}

export interface CheckResult {
  errors: string[];
  warnings: string[];
}

/** Folders under artifacts/ that hold inputs or the registry, not tracked artifacts. */
const UNTRACKED_DIRS = new Set(["_registry", "00-baseline"]);

async function listArtifactFiles(artifactsDir: string): Promise<string[]> {
  if (!existsSync(artifactsDir)) return [];
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (dir === artifactsDir && UNTRACKED_DIRS.has(entry.name)) continue;
        await walk(full);
      } else if (entry.name.endsWith(".md") && entry.name.toLowerCase() !== "readme.md") {
        out.push(full);
      }
    }
  };
  await walk(artifactsDir);
  return out;
}

/** Parse the artifact index table into rows of { id, module, path }. */
export function parseRegistryRows(text: string): { id: string; module: string; path: string }[] {
  const rows: { id: string; module: string; path: string }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const cells = line
      .slice(1, line.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((c) => c.trim());
    if (cells.length < 5 || cells[0] === "ID" || /^-+$/.test(cells[0])) continue;
    rows.push({ id: cells[0], module: cells[2], path: cells[4] });
  }
  return rows;
}

function normalizeArtifactPath(p: string): string {
  return p
    .replace(/^\.\//, "")
    .replace(/^artifacts\//, "")
    .replaceAll("\\", "/");
}

/** Cross-check manifest, progress.json and the artifact index. */
export async function checkWorkspace(paths: TrackPaths): Promise<CheckResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const progress = await loadProgress(paths);

  // 1. Every repo key used in progress.json must be declared in manifest.yaml.
  const manifestPath = join(paths.harenDir, "manifest.yaml");
  const manifest = existsSync(manifestPath)
    ? parseManifest(await readFile(manifestPath, "utf-8"))
    : {};
  const declared = new Set(Object.keys(normalizeRepos(manifest.repos)));
  for (const [name, mod] of Object.entries(progress.modules)) {
    const used = new Set([...(mod.repos ?? []), ...Object.keys(mod.lastCommit ?? {})]);
    for (const key of used) {
      if (!declared.has(key)) {
        errors.push(
          `module '${name}' uses repo '${key}', but manifest.yaml has no repos.${key} entry`,
        );
      }
    }
  }

  // 1b. Migration workspaces: legacy repo, unit ids, and adapter gates.
  let mig: MigrationConfig | null = null;
  try {
    mig = readMigrationConfig(manifest);
  } catch (e) {
    errors.push((e as Error).message);
  }
  if (manifest.mode === "migration" && mig) {
    try {
      if (!legacyRepo(manifest)) {
        errors.push(
          "mode: migration needs one repo with role: legacy in manifest.yaml. Add it under repos, for example: legacy_src: { path: ../legacy_src, role: legacy, readOnly: true }",
        );
      }
    } catch (e) {
      errors.push((e as Error).message);
    }
    if (mig.adapter) {
      try {
        if (!(await readAdapter(paths.harenDir, mig.adapter))) {
          errors.push(adapterMissingMessage(mig.adapter));
        }
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    for (const [name, mod] of Object.entries(progress.modules)) {
      for (const [unit, status] of Object.entries(mod.units ?? {})) {
        if (!mig.unitId.test(unit)) {
          errors.push(`module '${name}' unit '${unit}' does not match migration.unitId`);
        }
        // A blocked unit is skipped: progress.json does not keep the status it had before
        // the block, so haren cannot tell if it passed the gate. The gate is checked again
        // when the unit leaves blocked at spec-approved or later.
        if (mig.adapter && unitAtLeast(status, "spec-approved")) {
          const gate = join(
            paths.harenDir,
            "artifacts",
            "02-discovery",
            "units",
            unit,
            "gate.json",
          );
          let ok = false;
          try {
            ok = JSON.parse(await readFile(gate, "utf-8")).pass === true;
          } catch {
            ok = false;
          }
          if (!ok) {
            errors.push(
              `unit '${unit}' is ${status} but artifacts/02-discovery/units/${unit}/gate.json is missing or not pass`,
            );
          }
        }
      }
    }
  }

  // 2. Every artifact file on disk must have an index row, and every row must point to a file.
  const registryText = existsSync(paths.registry) ? await readFile(paths.registry, "utf-8") : "";
  const rows = parseRegistryRows(registryText);
  const indexed = new Set(rows.map((r) => normalizeArtifactPath(r.path)));
  const artifactsDir = join(paths.harenDir, "artifacts");
  for (const file of await listArtifactFiles(artifactsDir)) {
    const rel = relative(artifactsDir, file).split(sep).join("/");
    if (!indexed.has(rel)) {
      errors.push(`artifacts/${rel} has no row in artifact-index.md (run haren track artifact)`);
    }
  }
  for (const row of rows) {
    const rel = normalizeArtifactPath(row.path);
    if (!existsSync(join(artifactsDir, rel))) {
      errors.push(`index row ${row.id} points to missing file artifacts/${rel}`);
    }
  }

  // 3. A module past 'decomposed' with no index row is suspicious.
  const modulesWithRows = new Set(rows.map((r) => r.module));
  for (const [name, mod] of Object.entries(progress.modules)) {
    if (mod.status !== "discovered" && !modulesWithRows.has(name)) {
      warnings.push(`module '${name}' (${mod.status}) has no artifact in the index`);
    }
  }
  return { errors, warnings };
}

async function trackCheck(paths: TrackPaths): Promise<void> {
  const { errors, warnings } = await checkWorkspace(paths);
  for (const w of warnings) console.log(`  warn: ${w}`);
  if (errors.length) {
    throw new Error(`Workspace check FAIL:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  console.log("  Workspace check PASS");
}
