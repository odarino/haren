import { existsSync } from "fs";
import { readFile, rename, rm } from "fs/promises";
import { join, relative, resolve, sep } from "path";
import type { PluginManifest } from "./manifest";
import { resolvePluginRef } from "./registry";
import { checkRequirement } from "./requires";
import { fetchPlugin } from "./source";
import { pluginDir, readPlugins, writePlugins } from "./state";
import { parseManifest } from "../workspace/manifest";

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

/** The haren manifest layout. Defaults to workspace, like the rest of the CLI. */
async function harenLayout(harenDir: string): Promise<string> {
  const path = join(harenDir, "manifest.yaml");
  if (!existsSync(path)) return "workspace";
  try {
    return parseManifest(await readFile(path, "utf-8")).layout ?? "workspace";
  } catch {
    return "workspace";
  }
}

const incomingDir = (ctx: InstallContext) => pluginDir(ctx.harenDir, ".incoming");

async function stage(source: string, ctx: InstallContext): Promise<PluginManifest> {
  await rm(incomingDir(ctx), { recursive: true, force: true });
  return fetchPlugin(source, incomingDir(ctx), ctx.workspaceDir);
}

async function commit(manifest: PluginManifest, ctx: InstallContext): Promise<void> {
  const dest = pluginDir(ctx.harenDir, manifest.name);
  await rm(dest, { recursive: true, force: true });
  await rename(incomingDir(ctx), dest);
}

export async function installPlugin(ref: string, ctx: InstallContext): Promise<PluginManifest> {
  const { source, official } = resolvePluginRef(ref);
  if (!official) {
    ctx.io.log(
      "This plugin is not in the haren registry. Its hooks run as code with your user permissions.",
    );
    if (!(await ctx.io.confirm("Install it?"))) throw new Error("Plugin install cancelled");
  }
  const manifest = await stage(source, ctx);
  try {
    for (const req of manifest.requires) {
      let status = await checkRequirement(req, ctx.env);
      if (!status.ok && req.install && (await ctx.io.confirm(`Run "${req.install}"?`))) {
        await sh(req.install, ctx.workspaceDir);
        status = await checkRequirement(req, ctx.env);
      }
      if (!status.ok) throw new Error(`${req.bin} is required: ${status.reason}`);
    }

    const harenRel = relative(ctx.workspaceDir, ctx.harenDir).split(sep).join("/");
    const layout = await harenLayout(ctx.harenDir);
    for (const command of manifest.setup) {
      await sh(
        command
          .replaceAll("{{project}}", ctx.project)
          .replaceAll("{{harenDir}}", harenRel)
          .replaceAll("{{layout}}", layout),
        ctx.workspaceDir,
      );
    }

    await commit(manifest, ctx);
  } finally {
    await rm(incomingDir(ctx), { recursive: true, force: true });
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

/** Delete exactly the editor copies that `files` (one plugin's pluginFiles) produced. */
export async function removeEditorCopies(
  workspaceDir: string,
  files: { path: string }[],
): Promise<void> {
  const targets = new Set<string>();
  for (const f of files) {
    const [group, name] = f.path.split("/");
    if (!name) continue;
    targets.add(`${group}/${group === "skills" ? name : f.path.slice(group!.length + 1)}`);
  }
  for (const editor of [".claude", ".cursor"]) {
    for (const t of targets) {
      const group = t.split("/")[0]!;
      const abs = resolve(workspaceDir, editor, t);
      if (!abs.startsWith(resolve(workspaceDir, editor, group) + sep)) continue;
      await rm(abs, { recursive: true, force: true });
    }
  }
}

/** Enabled plugins in plugins.json whose fetched code is missing (for example, after a clone). */
export async function missingPlugins(harenDir: string): Promise<string[]> {
  const state = await readPlugins(harenDir);
  return Object.entries(state.plugins)
    .filter(
      ([name, e]) => e.enabled && !existsSync(join(pluginDir(harenDir, name), "haren-plugin.json")),
    )
    .map(([name]) => name);
}

export interface RestoreReport {
  warn(line: string): void;
  error(line: string): void;
}

/**
 * Install every enabled plugin whose `.plugins/<name>/` folder is missing, from its
 * recorded source. A failure is reported and never thrown. Returns the restored names.
 */
export async function restorePlugins(
  ctx: InstallContext,
  report: RestoreReport,
): Promise<string[]> {
  const restored: string[] = [];
  const state = await readPlugins(ctx.harenDir);
  for (const name of await missingPlugins(ctx.harenDir)) {
    const source = state.plugins[name]!.source;
    ctx.io.log(`Restoring plugin ${name} from ${source}`);
    try {
      const manifest = await installPlugin(source, ctx);
      if (manifest.name !== name) {
        report.warn(`plugin ${name}: source now installs ${manifest.name}`);
      }
      restored.push(manifest.name);
    } catch (err) {
      const message = (err as Error).message;
      if (message === "Plugin install cancelled") {
        report.warn(`plugin ${name}: skipped, not confirmed. Run again with --yes to install it.`);
      } else {
        report.error(`plugin ${name}: ${message}`);
      }
    }
  }
  return restored;
}

export async function refreshPlugins(ctx: InstallContext, skip: string[] = []): Promise<string[]> {
  const warnings: string[] = [];
  const state = await readPlugins(ctx.harenDir);
  for (const [name, entry] of Object.entries(state.plugins)) {
    if (!entry.enabled || skip.includes(name)) continue;
    try {
      const manifest = await stage(entry.source, ctx);
      if (manifest.name !== name) {
        warnings.push(
          `plugin ${name}: kept ${entry.version}: manifest name changed to ${manifest.name}`,
        );
        continue;
      }
      await commit(manifest, ctx);
      entry.version = manifest.version;
    } catch (err) {
      warnings.push(`plugin ${name}: kept ${entry.version}: ${(err as Error).message}`);
    } finally {
      await rm(incomingDir(ctx), { recursive: true, force: true });
    }
  }
  await writePlugins(ctx.harenDir, state);
  return warnings;
}
