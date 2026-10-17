import { existsSync } from "fs";
import { readdir, rename, rm } from "fs/promises";
import { join } from "path";
import type { PluginManifest } from "./manifest";
import { resolvePluginRef } from "./registry";
import { checkRequirement } from "./requires";
import { fetchPlugin } from "./source";
import { pluginDir, readPlugins, writePlugins } from "./state";

export interface InstallIO {
  confirm(question: string): Promise<boolean>;
  log(line: string): void;
}

export interface InstallContext {
  workspaceDir: string;
  harenDir: string;
  project: string;
  io: InstallIO;
  env?: Record<string, string | undefined>;
}

async function sh(command: string, cwd: string): Promise<void> {
  const proc = Bun.spawn(["sh", "-c", command], { cwd, stdout: "inherit", stderr: "pipe" });
  const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0)
    throw new Error(`"${command}" failed: ${stderr.trim().split("\n").pop() ?? `exit ${code}`}`);
}

async function fetchInto(source: string, ctx: InstallContext): Promise<PluginManifest> {
  const incoming = pluginDir(ctx.harenDir, ".incoming");
  try {
    const manifest = await fetchPlugin(source, incoming, ctx.workspaceDir);
    const dest = pluginDir(ctx.harenDir, manifest.name);
    await rm(dest, { recursive: true, force: true });
    await rename(incoming, dest);
    return manifest;
  } finally {
    await rm(incoming, { recursive: true, force: true });
  }
}

export async function installPlugin(ref: string, ctx: InstallContext): Promise<PluginManifest> {
  const { source, official } = resolvePluginRef(ref);
  if (!official) {
    ctx.io.log(
      "This plugin is not in the haren registry. Its hooks run as code with your user permissions.",
    );
    if (!(await ctx.io.confirm("Install it?"))) throw new Error("Plugin install cancelled");
  }
  const manifest = await fetchInto(source, ctx);

  for (const req of manifest.requires) {
    let status = await checkRequirement(req, ctx.env);
    if (!status.ok && req.install && (await ctx.io.confirm(`Run "${req.install}"?`))) {
      await sh(req.install, ctx.workspaceDir);
      status = await checkRequirement(req, ctx.env);
    }
    if (!status.ok) throw new Error(`${req.bin} is required: ${status.reason}`);
  }

  for (const command of manifest.setup) {
    await sh(command.replaceAll("{{project}}", ctx.project), ctx.workspaceDir);
  }

  const state = await readPlugins(ctx.harenDir);
  state.plugins[manifest.name] = {
    source,
    version: manifest.version,
    enabled: true,
    config: state.plugins[manifest.name]?.config ?? {},
  };
  await writePlugins(ctx.harenDir, state);
  ctx.io.log(`Installed plugin ${manifest.name} ${manifest.version}`);
  return manifest;
}

export async function removePlugin(name: string, ctx: InstallContext): Promise<void> {
  const state = await readPlugins(ctx.harenDir);
  if (!state.plugins[name]) throw new Error(`Plugin ${name} is not installed`);
  delete state.plugins[name];
  await writePlugins(ctx.harenDir, state);
  await rm(pluginDir(ctx.harenDir, name), { recursive: true, force: true });
}

/** Delete editor copies of a removed plugin's skills and agents. */
export async function removeEditorCopies(workspaceDir: string, name: string): Promise<void> {
  for (const editor of [".claude", ".cursor"]) {
    for (const group of ["skills", "agents"]) {
      const dir = join(workspaceDir, editor, group);
      if (!existsSync(dir)) continue;
      for (const entry of await readdir(dir)) {
        if (entry.startsWith(`${name}-`))
          await rm(join(dir, entry), { recursive: true, force: true });
      }
    }
  }
}

export async function refreshPlugins(ctx: InstallContext): Promise<string[]> {
  const warnings: string[] = [];
  const state = await readPlugins(ctx.harenDir);
  for (const [name, entry] of Object.entries(state.plugins)) {
    if (!entry.enabled) continue;
    try {
      const manifest = await fetchInto(entry.source, ctx);
      entry.version = manifest.version;
    } catch (err) {
      warnings.push(`plugin ${name}: kept ${entry.version}: ${(err as Error).message}`);
    }
  }
  await writePlugins(ctx.harenDir, state);
  return warnings;
}
