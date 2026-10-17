import { existsSync } from "fs";
import { appendFile, mkdir, readFile } from "fs/promises";
import { isAbsolute, join } from "path";
import { readProgress, writeProgress } from "../workspace/progress";
import { type HookName, validateManifest } from "./manifest";
import { pluginDataDir, pluginDir, readPlugins } from "./state";
import { type PlannedTask, alignTaskKeys, parseTasksFile } from "./tasks";
import { applyUpdates } from "./updates";

export interface HookOutcome {
  plugin: string;
  ok: boolean;
  messages: string[];
  updates: unknown[];
  error?: string;
}

export interface RunHookOptions {
  workspaceDir: string;
  harenDir: string;
  timeoutMs?: number;
}

function tasksPath(input: Record<string, unknown>, harenDir: string): string | undefined {
  if (typeof input.tasksFile !== "string") return undefined;
  return isAbsolute(input.tasksFile) ? input.tasksFile : join(harenDir, input.tasksFile);
}

/** Parse the planned tasks and align their keys with the features already in progress.json. */
async function loadPlannedTasks(
  input: Record<string, unknown>,
  harenDir: string,
): Promise<PlannedTask[]> {
  const path = tasksPath(input, harenDir);
  if (!path || !existsSync(path)) return [];
  const tasks = parseTasksFile(await readFile(path, "utf-8"));
  const progressPath = join(harenDir, "progress.json");
  if (typeof input.module !== "string" || !existsSync(progressPath)) return tasks;
  const mod = (await readProgress(progressPath)).modules[input.module];
  return mod ? alignTaskKeys(tasks, Object.keys(mod.features)) : tasks;
}

export async function buildPayload(
  hook: HookName,
  input: Record<string, unknown>,
  harenDir: string,
): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = { ...input, hook };
  const path = tasksPath(input, harenDir);
  if (hook === "after-plan" && path) {
    payload.tasksFile = path;
    payload.tasks = await loadPlannedTasks(input, harenDir);
  }
  return payload;
}

/** Add planned tasks that have no feature yet to progress.json as pending. Never creates a module. */
async function addPlannedFeatures(input: Record<string, unknown>, harenDir: string): Promise<void> {
  const progressPath = join(harenDir, "progress.json");
  if (typeof input.module !== "string" || !existsSync(progressPath)) return;
  const tasks = await loadPlannedTasks(input, harenDir);
  const progress = await readProgress(progressPath);
  const mod = progress.modules[input.module];
  if (!mod) return;
  let changed = false;
  for (const t of tasks) {
    if (!(t.key in mod.features)) {
      mod.features[t.key] = "pending";
      changed = true;
    }
  }
  if (changed) await writeProgress(progressPath, progress);
}

async function logError(dir: string, hook: HookName, error: string): Promise<void> {
  await appendFile(
    join(dir, "errors.log"),
    `${new Date().toISOString()} ${hook}: ${error}\n`,
  ).catch(() => {});
}

export async function runHook(
  hook: HookName,
  input: Record<string, unknown>,
  o: RunHookOptions,
): Promise<HookOutcome[]> {
  const state = await readPlugins(o.harenDir);
  const payload = JSON.stringify(await buildPayload(hook, input, o.harenDir));
  const outcomes: HookOutcome[] = [];

  for (const [name, entry] of Object.entries(state.plugins)) {
    if (!entry.enabled) continue;
    const dir = pluginDir(o.harenDir, name);
    const fail = async (error: string): Promise<void> => {
      outcomes.push({ plugin: name, ok: false, messages: [], updates: [], error });
      await logError(dir, hook, error);
    };

    let command: string | undefined;
    let config: Record<string, unknown> = {};
    try {
      const manifest = validateManifest(
        JSON.parse(await readFile(join(dir, "haren-plugin.json"), "utf-8")),
      );
      command = manifest.hooks[hook];
      config = { ...manifest.config, ...entry.config };
    } catch (err) {
      await fail(`manifest unreadable: ${(err as Error).message}. Run 'haren plugin doctor'.`);
      continue;
    }
    if (!command) continue;

    const limit = o.timeoutMs ?? 30_000;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stdout: string;
    let stderr: string;
    let code: number;
    try {
      const dataDir = pluginDataDir(o.harenDir, name);
      await mkdir(dataDir, { recursive: true });
      const proc = Bun.spawn(["sh", "-c", command], {
        cwd: dir,
        stdin: new Blob([payload]),
        stdout: "pipe",
        stderr: "pipe",
        detached: true,
        env: {
          ...process.env,
          HAREN_ROOT: o.workspaceDir,
          HAREN_DIR: o.harenDir,
          HAREN_PLUGIN_DIR: dir,
          HAREN_PLUGIN_DATA: dataDir,
          HAREN_PLUGIN_CONFIG: JSON.stringify(config),
        },
      });
      const collected = Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      collected.catch(() => {});
      const expired = new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          // Kill the whole process group so grandchildren release the pipes.
          try {
            process.kill(-proc.pid, "SIGKILL");
          } catch {
            try {
              proc.kill("SIGKILL");
            } catch {}
          }
          // Do not wait for pipes that a stray descendant may still hold open.
          setTimeout(() => resolve(null), 500);
        }, limit);
      });
      const res = await Promise.race([collected, expired]);
      clearTimeout(timer);
      if (res === null) {
        await fail(`timed out after ${limit} ms`);
        continue;
      }
      [stdout, stderr, code] = res;
    } catch (err) {
      clearTimeout(timer);
      await fail(`could not start hook: ${(err as Error).message}`);
      continue;
    }

    if (timedOut) {
      await fail(`timed out after ${limit} ms`);
      continue;
    }
    if (code !== 0) {
      await fail(`exit ${code}: ${stderr.trim().split("\n").pop() ?? ""}`);
      continue;
    }
    let result: { messages?: unknown; updates?: unknown };
    try {
      result = stdout.trim() ? JSON.parse(stdout) : {};
    } catch {
      await fail("invalid JSON on stdout");
      continue;
    }
    outcomes.push({
      plugin: name,
      ok: true,
      messages: Array.isArray(result.messages) ? result.messages.map(String) : [],
      updates: Array.isArray(result.updates) ? result.updates : [],
    });
  }
  return outcomes;
}

/** Run a hook, apply valid updates to progress.json, and return lines to print. Never throws for plugin errors. */
export async function runHookAndApply(
  hook: HookName,
  input: Record<string, unknown>,
  o: RunHookOptions,
): Promise<string[]> {
  const lines: string[] = [];
  let outcomes: HookOutcome[];
  if (hook === "after-plan") {
    try {
      await addPlannedFeatures(input, o.harenDir);
    } catch (err) {
      lines.push(`warning: could not add planned features: ${(err as Error).message}`);
    }
  }
  try {
    outcomes = await runHook(hook, input, o);
  } catch (err) {
    return [`warning: could not run ${hook} hooks: ${(err as Error).message}`];
  }
  const updates: unknown[] = [];
  for (const out of outcomes) {
    for (const m of out.messages) lines.push(`[${out.plugin}] ${m}`);
    if (!out.ok) lines.push(`[${out.plugin}] warning: ${hook} failed: ${out.error}`);
    updates.push(...out.updates);
  }
  try {
    const progressPath = join(o.harenDir, "progress.json");
    if (updates.length > 0 && existsSync(progressPath)) {
      const result = applyUpdates(await readProgress(progressPath), updates);
      if (result.applied.length > 0) await writeProgress(progressPath, result.progress);
      for (const u of result.applied) lines.push(`updated ${u.module}/${u.feature} → ${u.status}`);
      for (const s of result.skipped)
        lines.push(`skipped update ${JSON.stringify(s.update)}: ${s.reason}`);
    }
  } catch (err) {
    lines.push(`warning: could not apply plugin updates: ${(err as Error).message}`);
  }
  return lines;
}
