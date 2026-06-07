import { readFile, writeFile } from "fs/promises";

export type ModuleStatus =
  | "discovered"
  | "decomposed"
  | "planned"
  | "implementing"
  | "evaluating"
  | "completed"
  | "blocked";

export type FeatureStatus =
  | "pending"
  | "in-progress"
  | "evaluating"
  | "passing"
  | "fixing"
  | "blocked";

export interface ModuleProgress {
  status: ModuleStatus;
  currentPhase: string;
  features: Record<string, FeatureStatus>;
  lastCommit: string | null;
  lastUpdated: string;
}

export interface Progress {
  project: string;
  version: number;
  modules: Record<string, ModuleProgress>;
  dependencies: Record<string, string[]>;
}

const VALID_MODULE_TRANSITIONS: Record<ModuleStatus, ModuleStatus[]> = {
  discovered: ["decomposed"],
  decomposed: ["planned"],
  planned: ["implementing"],
  implementing: ["evaluating", "blocked"],
  evaluating: ["implementing", "completed", "blocked"],
  completed: [],
  blocked: ["implementing", "planned"],
};

const STATUS_TO_PHASE: Record<ModuleStatus, string> = {
  discovered: "discover",
  decomposed: "decompose",
  planned: "plan",
  implementing: "implement",
  evaluating: "evaluate",
  completed: "evaluate",
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
  return JSON.parse(raw) as Progress;
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
