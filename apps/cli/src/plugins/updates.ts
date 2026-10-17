import { type FeatureStatus, type Progress, updateFeatureStatus } from "../workspace/progress";

export interface Update {
  module: string;
  feature: string;
  status: FeatureStatus;
}

export interface ApplyResult {
  progress: Progress;
  applied: Update[];
  skipped: { update: unknown; reason: string }[];
}

const STATUSES: FeatureStatus[] = [
  "pending",
  "in-progress",
  "evaluating",
  "passing",
  "fixing",
  "blocked",
];
const KEYS = ["module", "feature", "status"];

/** Validate updates from plugins and apply the valid ones. Plugins never write progress.json. */
export function applyUpdates(progress: Progress, updates: unknown[]): ApplyResult {
  let current = progress;
  const applied: Update[] = [];
  const skipped: ApplyResult["skipped"] = [];
  for (const u of updates) {
    if (!u || typeof u !== "object") {
      skipped.push({ update: u, reason: "Update must be an object" });
      continue;
    }
    const extra = Object.keys(u).filter((k) => !KEYS.includes(k));
    if (extra.length > 0) {
      skipped.push({ update: u, reason: `Unknown field: ${extra.join(", ")}` });
      continue;
    }
    const { module, feature, status } = u as Record<string, unknown>;
    if (typeof module !== "string" || typeof feature !== "string") {
      skipped.push({ update: u, reason: "module and feature must be strings" });
      continue;
    }
    if (!STATUSES.includes(status as FeatureStatus)) {
      skipped.push({ update: u, reason: `Unknown status: ${String(status)}` });
      continue;
    }
    if (!Object.hasOwn(current.modules, module)) {
      skipped.push({ update: u, reason: `Unknown module: ${module}` });
      continue;
    }
    const mod = current.modules[module]!;
    if (!Object.hasOwn(mod.features, feature)) {
      skipped.push({ update: u, reason: `Unknown feature: ${module}/${feature}` });
      continue;
    }
    if (mod.features[feature] === status) continue;
    try {
      current = updateFeatureStatus(current, module, feature, status as FeatureStatus);
      applied.push({ module, feature, status: status as FeatureStatus });
    } catch (err) {
      skipped.push({ update: u, reason: (err as Error).message });
    }
  }
  return { progress: current, applied, skipped };
}
