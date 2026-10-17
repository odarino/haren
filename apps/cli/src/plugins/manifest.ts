import { isAbsolute } from "path";

export const HAREN_API = "1";
export const HOOK_NAMES = ["session-start", "after-plan", "on-task-status"] as const;
export type HookName = (typeof HOOK_NAMES)[number];

export interface Requirement {
  bin: string;
  version?: string;
  install?: string;
}

export interface PluginManifest {
  name: string;
  version: string;
  harenApi: string;
  description?: string;
  requires: Requirement[];
  setup: string[];
  hooks: Partial<Record<HookName, string>>;
  config: Record<string, unknown>;
  skills: string[];
  agents: string[];
}

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function stringList(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new Error(`Plugin manifest: ${field} must be a list of strings`);
  }
  return value;
}

function relativePathList(value: unknown, field: string): string[] {
  const list = stringList(value, field);
  for (const p of list) {
    if (
      isAbsolute(p) ||
      p.startsWith("/") ||
      /^[A-Za-z]:/.test(p) ||
      p.split(/[\\/]/).includes("..")
    ) {
      throw new Error(`Plugin manifest: ${field} path must stay inside the plugin: ${p}`);
    }
  }
  return list;
}

/** Validate a parsed haren-plugin.json. `packageVersion` comes from the plugin's package.json (npm source). */
export function validateManifest(raw: unknown, packageVersion?: string): PluginManifest {
  if (!raw || typeof raw !== "object") throw new Error("Plugin manifest must be a JSON object");
  const m = raw as Record<string, unknown>;

  if (typeof m.name !== "string" || !m.name) throw new Error("Plugin manifest: name is required");
  if (!NAME.test(m.name)) throw new Error(`Plugin manifest: name must be kebab-case: ${m.name}`);

  if (m.harenApi !== HAREN_API) {
    throw new Error(
      `Plugin manifest: this haren supports harenApi "${HAREN_API}", got ${JSON.stringify(m.harenApi)}`,
    );
  }

  let version: string;
  if (packageVersion !== undefined) {
    if (m.version !== undefined && m.version !== packageVersion) {
      throw new Error(
        `Plugin manifest: version ${m.version} differs from package.json ${packageVersion}`,
      );
    }
    version = packageVersion;
  } else {
    if (typeof m.version !== "string" || !m.version)
      throw new Error("Plugin manifest: version is required");
    version = m.version;
  }

  const hooks: Partial<Record<HookName, string>> = {};
  if (m.hooks !== undefined) {
    if (!m.hooks || typeof m.hooks !== "object")
      throw new Error("Plugin manifest: hooks must be an object");
    for (const [name, command] of Object.entries(m.hooks)) {
      if (!(HOOK_NAMES as readonly string[]).includes(name))
        throw new Error(`Plugin manifest: Unknown hook: ${name}`);
      if (typeof command !== "string" || !command)
        throw new Error(`Plugin manifest: hook ${name} needs a command`);
      hooks[name as HookName] = command;
    }
  }

  const requires: Requirement[] = [];
  if (m.requires !== undefined) {
    if (!Array.isArray(m.requires)) throw new Error("Plugin manifest: requires must be a list");
    for (const r of m.requires as Record<string, unknown>[]) {
      if (!r || typeof r.bin !== "string" || !r.bin)
        throw new Error("Plugin manifest: each requirement needs a bin");
      if (r.version !== undefined && typeof r.version !== "string") {
        throw new Error(`Plugin manifest: requirement ${r.bin} version must be a string`);
      }
      if (r.install !== undefined && typeof r.install !== "string") {
        throw new Error(`Plugin manifest: requirement ${r.bin} install must be a string`);
      }
      requires.push({
        bin: r.bin,
        version: r.version as string | undefined,
        install: r.install as string | undefined,
      });
    }
  }

  const config = m.config ?? {};
  if (typeof config !== "object" || Array.isArray(config))
    throw new Error("Plugin manifest: config must be an object");

  return {
    name: m.name,
    version,
    harenApi: HAREN_API,
    description: typeof m.description === "string" ? m.description : undefined,
    requires,
    setup: stringList(m.setup, "setup"),
    hooks,
    config: config as Record<string, unknown>,
    skills: relativePathList(m.skills, "skills"),
    agents: relativePathList(m.agents, "agents"),
  };
}
