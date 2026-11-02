import { existsSync } from "fs";
import { join } from "path";
import type { AdapterSpec } from "./adapter-spec";
import { readInstalledManifest } from "./manifest";
import { pluginDir, readPlugins } from "./state";

/** The message for a manifest that names an adapter haren cannot load. */
export function adapterMissingMessage(name: string): string {
  return `Adapter '${name}' is named in manifest.yaml but not installed. Run \`haren plugin add <source>\`, or remove migration.adapter to work by hand.`;
}

/** The adapter block of an installed plugin; null when not installed or it has none. */
export async function readAdapter(harenDir: string, name: string): Promise<AdapterSpec | null> {
  const { plugins } = await readPlugins(harenDir);
  if (!plugins[name]) return null;
  const dir = pluginDir(harenDir, name);
  if (!existsSync(join(dir, "haren-plugin.json"))) return null;
  try {
    return (await readInstalledManifest(dir)).adapter ?? null;
  } catch (e) {
    throw new Error(`Adapter plugin '${name}': ${e instanceof Error ? e.message : String(e)}`);
  }
}
