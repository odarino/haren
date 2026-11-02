import { assertInsidePlugin } from "./paths";

export const ADAPTER_COMMANDS = ["inventory", "extract", "gate"] as const;
export type AdapterCommand = (typeof ADAPTER_COMMANDS)[number];

export interface AdapterSpec {
  unitKind: string;
  commands: Partial<Record<AdapterCommand, string>>;
  skills: { spec?: string };
  semantics?: string; // path inside the plugin
}

const PLACEHOLDERS = ["legacyRoot", "unit", "unitDir", "specPath"];

export function validateAdapter(raw: unknown): AdapterSpec {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Plugin manifest: adapter must be an object");
  }
  const a = raw as Record<string, unknown>;
  if (typeof a.unitKind !== "string" || !a.unitKind) {
    throw new Error("Plugin manifest: adapter.unitKind is required");
  }

  const commands: Partial<Record<AdapterCommand, string>> = {};
  if (a.commands !== undefined) {
    if (!a.commands || typeof a.commands !== "object" || Array.isArray(a.commands)) {
      throw new Error("Plugin manifest: adapter.commands must be an object");
    }
    for (const [name, command] of Object.entries(a.commands)) {
      if (!(ADAPTER_COMMANDS as readonly string[]).includes(name)) {
        throw new Error(`Plugin manifest: Unknown adapter command: ${name}`);
      }
      if (typeof command !== "string" || !command) {
        throw new Error(`Plugin manifest: adapter command ${name} needs a command string`);
      }
      for (const [, key] of command.matchAll(/\{([^{}]*)\}/g)) {
        if (!PLACEHOLDERS.includes(key)) {
          throw new Error(
            `Plugin manifest: adapter command ${name} has unknown placeholder {${key}}`,
          );
        }
      }
      commands[name as AdapterCommand] = command;
    }
  }

  const skills: { spec?: string } = {};
  if (a.skills !== undefined) {
    if (!a.skills || typeof a.skills !== "object" || Array.isArray(a.skills)) {
      throw new Error("Plugin manifest: adapter.skills must be an object");
    }
    const spec = (a.skills as Record<string, unknown>).spec;
    if (spec !== undefined) {
      if (typeof spec !== "string" || !spec) {
        throw new Error("Plugin manifest: adapter.skills.spec must be a string");
      }
      skills.spec = spec;
    }
  }

  let semantics: string | undefined;
  if (a.semantics !== undefined) {
    if (typeof a.semantics !== "string" || !a.semantics) {
      throw new Error("Plugin manifest: adapter.semantics must be a path string");
    }
    assertInsidePlugin(a.semantics, "adapter.semantics");
    semantics = a.semantics;
  }

  return { unitKind: a.unitKind, commands, skills, semantics };
}
