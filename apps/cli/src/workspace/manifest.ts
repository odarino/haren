import { basename } from "path";

export type Layout = "monorepo" | "workspace";

export type RepoRole = "frontend" | "backend" | "e2e" | "legacy" | "other";

export interface RepoEntry {
  path: string;
  remote?: string;
  default_branch?: string;
  role?: RepoRole;
  stack?: string;
  test_cmd?: string;
  readOnly?: boolean;
}

export interface Manifest {
  haren?: { version?: unknown };
  layout?: Layout;
  project?: string;
  mode?: string;
  language?: string;
  repos?: unknown;
  [key: string]: unknown;
}

const REPO_FIELDS = [
  "path",
  "remote",
  "default_branch",
  "role",
  "stack",
  "test_cmd",
  "readOnly",
] as const;

export function parseManifest(text: string): Manifest {
  const data = Bun.YAML.parse(text);
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Manifest) : {};
}

export function hasMarker(m: Manifest): boolean {
  if (typeof m.haren !== "object" || m.haren === null) return false;
  const v = m.haren.version;
  return (typeof v === "string" && v !== "") || typeof v === "number";
}

export function normalizeRepos(repos: unknown): Record<string, RepoEntry> {
  const out: Record<string, RepoEntry> = {};
  if (Array.isArray(repos)) {
    for (const item of repos) {
      const path = typeof item === "string" ? item : (item as { path?: unknown })?.path;
      if (typeof path === "string" && path) out[basename(path)] = { path };
    }
    return out;
  }
  if (repos && typeof repos === "object") {
    for (const [key, value] of Object.entries(repos as Record<string, unknown>)) {
      if (typeof value === "string") {
        out[key] = { path: value };
      } else if (
        value &&
        typeof value === "object" &&
        typeof (value as RepoEntry).path === "string"
      ) {
        out[key] = value as RepoEntry;
      }
    }
  }
  return out;
}

const YAML_KEYWORDS = /^(true|false|null|yes|no|on|off|~)$/i;
const YAML_SPECIAL_FLOAT = /^[-+]?\.(inf|nan)$/i;

// Quote anything that YAML could read as a number, a keyword, or a non-string,
// plus values with spaces, ":" or "#". Plain paths such as "../backend" stay plain.
function yamlScalar(value: string): string {
  const plain =
    /^[A-Za-z_.\/-][\w.\/@-]*$/.test(value) &&
    !YAML_KEYWORDS.test(value) &&
    !YAML_SPECIAL_FLOAT.test(value) &&
    !/^[-+]?\.?\d/.test(value) &&
    value !== "-";
  return plain ? value : JSON.stringify(value);
}

export function renderReposBlock(repos: Record<string, RepoEntry>): string {
  const keys = Object.keys(repos);
  if (keys.length === 0) {
    return "repos:\n  # Add repos here. Paths are relative to this folder.\n  # backend:\n  #   path: ../backend\n";
  }
  let out = "repos:\n";
  for (const key of keys) {
    out += `  ${yamlScalar(key)}:\n`;
    for (const field of REPO_FIELDS) {
      const value = repos[key][field];
      if (typeof value === "boolean") {
        if (value) out += `    ${field}: true\n`;
      } else if (value) {
        out += `    ${field}: ${yamlScalar(value)}\n`;
      }
    }
  }
  return out;
}

function eolOf(text: string): "\r\n" | "\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function toLf(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/**
 * Replace the top-level YAML block `key:` (its line plus all indented or blank
 * lines after it) with `block`. Blank lines that end the old block stay. If the
 * key is missing, append the block. Text outside the block is not changed.
 * If the file has any CRLF, all line endings in the result are CRLF (mixed
 * endings are normalized to CRLF).
 */
export function replaceTopLevelBlock(text: string, key: string, block: string): string {
  const eol = eolOf(text);
  const out = replaceTopLevelBlockLf(toLf(text), key, toLf(block));
  return eol === "\n" ? out : out.replace(/\n/g, "\r\n");
}

function replaceTopLevelBlockLf(text: string, key: string, block: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex(
    (line) => line === `${key}:` || line.startsWith(`${key}: `) || line.startsWith(`${key}:\t`),
  );
  if (start === -1) {
    const body = text.endsWith("\n") ? text : `${text}\n`;
    return `${body}\n${block}`;
  }
  let end = start + 1;
  while (end < lines.length && (lines[end] === "" || /^\s/.test(lines[end]))) end++;
  while (end > start + 1 && lines[end - 1] === "") end--;
  lines.splice(start, end - start, ...block.replace(/\n$/, "").split("\n"));
  return lines.join("\n");
}

export interface ManifestMigration {
  version: string;
  layout: Layout;
  repos?: Record<string, RepoEntry>;
}

export function migrateManifestText(text: string, mig: ManifestMigration): string {
  const eol = eolOf(text);
  const lf = toLf(text);
  const m = parseManifest(lf);
  const validLayout = m.layout === "monorepo" || m.layout === "workspace";
  const hasLayoutLine = /^layout:/m.test(lf);
  const head =
    `haren:\n  version: ${JSON.stringify(mig.version)}\n` +
    (hasLayoutLine ? "" : `layout: ${mig.layout}\n`);
  let out = /^haren:/m.test(lf) ? replaceTopLevelBlockLf(lf, "haren", head) : head + lf;
  if (hasLayoutLine && !validLayout) {
    out = replaceTopLevelBlockLf(out, "layout", `layout: ${mig.layout}\n`);
  }
  if (mig.repos) out = replaceTopLevelBlockLf(out, "repos", renderReposBlock(mig.repos));
  return eol === "\n" ? out : out.replace(/\n/g, "\r\n");
}

export interface NewManifestOptions {
  version: string;
  layout: Layout;
  project: string;
  mode: string;
  language: string;
  repos: Record<string, RepoEntry>;
  iterations?: { duration: string; startDate: string; demoDay: string };
}

export function buildManifestText(o: NewManifestOptions): string {
  let text = `haren:
  version: ${JSON.stringify(o.version)}
layout: ${o.layout}
project: ${yamlScalar(o.project)}
mode: ${yamlScalar(o.mode)}
language: ${yamlScalar(o.language)}

${renderReposBlock(o.repos)}
sources:
  # Mode-specific inputs
  # docs: ./artifacts/00-baseline/requirements.pdf

hooks:
  # on-phase-complete:
  #   - echo "Module \${MODULE} completed \${PHASE}"
`;
  if (o.iterations) {
    text += `
iterations:
  enabled: true
  duration: ${yamlScalar(o.iterations.duration)}
  start_date: ${yamlScalar(o.iterations.startDate)}
  demo_day: ${yamlScalar(o.iterations.demoDay)}
`;
  }
  return text;
}

export interface MigrationConfig {
  adapter?: string;
  unitId: RegExp;
  parentOf?: RegExp;
  acceptance: "parity" | "parity-with-approved-deviations";
  liveLegacy: boolean;
}

function regex(value: unknown, field: string): RegExp {
  if (typeof value !== "string" || !value) {
    throw new Error(`manifest migration.${field} must be a regex string`);
  }
  try {
    return new RegExp(value);
  } catch {
    throw new Error(`manifest migration.${field} is not a valid regex: ${value}`);
  }
}

export function readMigrationConfig(m: Manifest): MigrationConfig | null {
  if (m.mode !== "migration") return null;
  const b = m.migration as Record<string, unknown> | undefined;
  if (!b || typeof b !== "object") {
    throw new Error("mode: migration needs a migration block in manifest.yaml");
  }
  if (Array.isArray(b)) throw new Error("manifest migration block must be a mapping");
  if (b.adapter !== undefined && b.adapter !== null && typeof b.adapter !== "string") {
    throw new Error("manifest migration.adapter must be a plugin name string");
  }
  if (b.liveLegacy !== undefined && b.liveLegacy !== null && typeof b.liveLegacy !== "boolean") {
    throw new Error("manifest migration.liveLegacy must be true or false");
  }
  const acceptance = (b.acceptance ?? "parity") as MigrationConfig["acceptance"];
  if (acceptance !== "parity" && acceptance !== "parity-with-approved-deviations") {
    throw new Error(
      "manifest migration.acceptance must be parity or parity-with-approved-deviations",
    );
  }
  return {
    adapter: typeof b.adapter === "string" && b.adapter ? b.adapter : undefined,
    unitId: regex(b.unitId, "unitId"),
    parentOf: b.parentOf === undefined ? undefined : regex(b.parentOf, "parentOf"),
    acceptance,
    liveLegacy: b.liveLegacy === true,
  };
}

/** The one repo with role: legacy; null when none. Throws when there is more than one. */
export function legacyRepo(m: Manifest): [string, RepoEntry] | null {
  const found = Object.entries(normalizeRepos(m.repos)).filter(([, r]) => r.role === "legacy");
  if (found.length > 1) {
    throw new Error(
      `manifest.yaml has more than one repo with role: legacy (${found.map(([k]) => k).join(", ")}); keep one`,
    );
  }
  return found[0] ?? null;
}
