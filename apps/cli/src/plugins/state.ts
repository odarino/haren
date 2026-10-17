import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

export interface PluginEntry {
  source: string;
  version: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface PluginsFile {
  version: 1;
  plugins: Record<string, PluginEntry>;
}

export function pluginsPath(harenDir: string): string {
  return join(harenDir, "plugins.json");
}

export function pluginDir(harenDir: string, name: string): string {
  return join(harenDir, ".plugins", name);
}

export async function readPlugins(harenDir: string): Promise<PluginsFile> {
  const path = pluginsPath(harenDir);
  if (!existsSync(path)) return { version: 1, plugins: {} };
  const data = JSON.parse(await readFile(path, "utf-8")) as Partial<PluginsFile>;
  return { version: 1, plugins: data.plugins ?? {} };
}

export async function writePlugins(harenDir: string, data: PluginsFile): Promise<void> {
  await mkdir(harenDir, { recursive: true });
  await writeFile(pluginsPath(harenDir), `${JSON.stringify(data, null, 2)}\n`);
}
