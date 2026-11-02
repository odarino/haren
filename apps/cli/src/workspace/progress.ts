import { readFile, writeFile } from "fs/promises";

export type ModuleStatus =
  | "discovered"
  | "decomposed"
  | "planned"
  | "implementing"
  | "evaluating"
  | "completed"
  | "released"
  | "blocked";

export type FeatureStatus =
  | "pending"
  | "in-progress"
  | "evaluating"
  | "passing"
  | "fixing"
  | "blocked";

export type UnitStatus =
  | "inventoried"
  | "extracted"
  | "spec-draft"
  | "spec-approved"
  | "built"
  | "verified"
  | "parity-signed"
  | "blocked"
  | "static-review-only";

/** Main line, in order. Side statuses are handled in VALID_UNIT_TRANSITIONS. */
export const UNIT_LINE: UnitStatus[] = [
  "inventoried",
  "extracted",
  "spec-draft",
  "spec-approved",
  "built",
  "verified",
  "parity-signed",
];
export const UNIT_STATUSES: UnitStatus[] = [...UNIT_LINE, "blocked", "static-review-only"];

export interface ModuleProgress {
  status: ModuleStatus;
  currentPhase: string;
  features: Record<string, FeatureStatus>;
  /** Last known commit per repo key from manifest `repos`. */
  lastCommit: Record<string, string>;
  /** Branch used in every repo the module touches, e.g. `feat/checkout`. */
  branch?: string;
  /** Repo keys from manifest `repos` that this module touches. */
  repos?: string[];
  /** Per-unit lifecycle (migration mode). Keys are unit ids. */
  units?: Record<string, UnitStatus>;
  lastUpdated: string;
}

export interface GateOverride {
  reason: string;
  /** ISO time. The override is ignored after it. No value means no end. */
  until?: string;
}

export interface Progress {
  project: string;
  version: number;
  modules: Record<string, ModuleProgress>;
  dependencies: Record<string, string[]>;
  gateOverride?: GateOverride;
  /** Other top-level keys (phase, status, currentIteration, ...) are kept as is. */
  [key: string]: unknown;
}

export const MODULE_STATUSES: ModuleStatus[] = [
  "discovered",
  "decomposed",
  "planned",
  "implementing",
  "evaluating",
  "completed",
  "released",
  "blocked",
];

export const FEATURE_STATUSES: FeatureStatus[] = [
  "pending",
  "in-progress",
  "evaluating",
  "passing",
  "fixing",
  "blocked",
];

export function phaseForStatus(status: ModuleStatus): string {
  return STATUS_TO_PHASE[status];
}

const VALID_MODULE_TRANSITIONS: Record<ModuleStatus, ModuleStatus[]> = {
  discovered: ["decomposed"],
  decomposed: ["planned"],
  planned: ["implementing"],
  implementing: ["evaluating", "blocked"],
  evaluating: ["implementing", "completed", "blocked"],
  completed: ["released"],
  released: [],
  blocked: ["implementing", "planned"],
};

const STATUS_TO_PHASE: Record<ModuleStatus, string> = {
  discovered: "discover",
  decomposed: "decompose",
  planned: "plan",
  implementing: "implement",
  evaluating: "evaluate",
  completed: "evaluate",
  released: "release",
  blocked: "blocked",
};

const VALID_FEATURE_TRANSITIONS: Record<FeatureStatus, FeatureStatus[]> = {
  pending: ["in-progress"],
  "in-progress": ["evaluating"],
  evaluating: ["passing", "fixing", "blocked"],
  fixing: ["evaluating"],
  passing: [],
  blocked: ["in-progress"],
};

export async function readProgress(path: string): Promise<Progress> {
  const raw = await readFile(path, "utf-8");
  const progress = JSON.parse(raw) as Progress;
  progress.modules ??= {};
  // Agents write modules by hand, so fill the maps that callers index into.
  for (const mod of Object.values(progress.modules)) {
    if (!isObject(mod.features)) mod.features = {};
    if (!isObject(mod.lastCommit)) mod.lastCommit = {};
    if (!isObject(mod.units)) mod.units = {};
  }
  return progress;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function writeProgress(path: string, progress: Progress): Promise<void> {
  await writeFile(path, JSON.stringify(progress, null, 2));
}

export function updateModuleStatus(
  progress: Progress,
  moduleName: string,
  newStatus: ModuleStatus,
): Progress {
  const mod = progress.modules[moduleName];
  if (!mod) {
    throw new Error(`Module '${moduleName}' not found in progress`);
  }

  const allowed = VALID_MODULE_TRANSITIONS[mod.status];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid module transition: ${mod.status} → ${newStatus}. Allowed: ${allowed.join(", ")}`,
    );
  }

  return {
    ...progress,
    modules: {
      ...progress.modules,
      [moduleName]: {
        ...mod,
        status: newStatus,
        currentPhase: STATUS_TO_PHASE[newStatus],
        lastUpdated: new Date().toISOString(),
      },
    },
  };
}

export function updateFeatureStatus(
  progress: Progress,
  moduleName: string,
  featureName: string,
  newStatus: FeatureStatus,
): Progress {
  const mod = progress.modules[moduleName];
  if (!mod) {
    throw new Error(`Module '${moduleName}' not found`);
  }

  const currentStatus = mod.features[featureName];
  if (currentStatus === undefined) {
    throw new Error(`Feature '${featureName}' not found in module '${moduleName}'`);
  }

  const allowed = VALID_FEATURE_TRANSITIONS[currentStatus];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid feature transition: ${currentStatus} → ${newStatus}. Allowed: ${allowed.join(", ")}`,
    );
  }

  return {
    ...progress,
    modules: {
      ...progress.modules,
      [moduleName]: {
        ...mod,
        features: {
          ...mod.features,
          [featureName]: newStatus,
        },
        lastUpdated: new Date().toISOString(),
      },
    },
  };
}

const VALID_UNIT_TRANSITIONS: Record<UnitStatus, UnitStatus[]> = {
  inventoried: ["extracted", "blocked"],
  extracted: ["spec-draft", "blocked"],
  "spec-draft": ["spec-approved", "extracted", "blocked"],
  "spec-approved": ["built", "spec-draft", "blocked"],
  built: ["verified", "static-review-only", "blocked"],
  "static-review-only": ["verified", "built", "blocked"],
  verified: ["parity-signed", "built", "blocked"],
  "parity-signed": ["built"],
  blocked: [
    "inventoried",
    "extracted",
    "spec-draft",
    "spec-approved",
    "built",
    "static-review-only",
    "verified",
  ],
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

export function updateUnitStatus(
  progress: Progress,
  moduleName: string,
  unit: string,
  to: UnitStatus,
): Progress {
  const mod = progress.modules[moduleName];
  if (!mod) throw new Error(`Module '${moduleName}' not found`);
  const units = mod.units ?? {};
  const from = units[unit];
  if (from === undefined) {
    if (to !== "inventoried") {
      throw new Error(`A new unit can start only at 'inventoried' (got '${to}')`);
    }
  } else if (!VALID_UNIT_TRANSITIONS[from].includes(to)) {
    throw new Error(
      `Invalid unit transition: ${from} → ${to}. Allowed: ${VALID_UNIT_TRANSITIONS[from].join(", ")}`,
    );
  }
  return {
    ...progress,
    modules: {
      ...progress.modules,
      [moduleName]: {
        ...mod,
        units: { ...units, [unit]: to },
        lastUpdated: new Date().toISOString(),
      },
    },
  };
}

export const PROGRESS_VERSION = 3;

/**
 * Migrate a v1 progress.json (string `lastCommit`) to v2 (per-repo map).
 * `repoKeyFor` returns the repo key for a module; the fallback key is "default".
 */
export function migrateProgress(
  raw: unknown,
  repoKeyFor: (moduleName: string) => string | undefined,
): { progress: unknown; changed: boolean } {
  if (!raw || typeof raw !== "object") return { progress: raw, changed: false };
  const data = raw as { version?: number; modules?: Record<string, Record<string, unknown>> };
  const version = data.version ?? 1;
  if (version >= PROGRESS_VERSION) return { progress: raw, changed: false };

  const modules: Record<string, Record<string, unknown>> = {};
  for (const [name, mod] of Object.entries(data.modules ?? {})) {
    const old = mod?.lastCommit;
    let lastCommit: Record<string, string> = {};
    if (typeof old === "string" && old) lastCommit = { [repoKeyFor(name) || "default"]: old };
    else if (
      old &&
      typeof old === "object" &&
      !Array.isArray(old) &&
      Object.values(old).every((v) => typeof v === "string")
    ) {
      lastCommit = old as Record<string, string>;
    }
    const units =
      mod?.units && typeof mod.units === "object" && !Array.isArray(mod.units) ? mod.units : {};
    modules[name] = {
      ...mod,
      lastCommit: version >= 2 ? (mod.lastCommit ?? {}) : lastCommit,
      units,
    };
  }
  return { progress: { ...data, version: PROGRESS_VERSION, modules }, changed: true };
}
