import { existsSync } from "fs";
import { appendFile, readFile } from "fs/promises";
import { isAbsolute, join } from "path";
import { readProgress, writeProgress } from "../workspace/progress";
import { type HookName, validateManifest } from "./manifest";
import { pluginDir, readPlugins } from "./state";
import { parseTasksFile } from "./tasks";
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

export async function buildPayload(
  hook: HookName,
  input: Record<string, unknown>,
  harenDir: string,
): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = { ...input, hook };
  if (hook === "after-plan" && typeof input.tasksFile === "string") {
    const path = isAbsolute(input.tasksFile) ? input.tasksFile : join(harenDir, input.tasksFile);
    payload.tasksFile = path;
    payload.tasks = existsSync(path) ? parseTasksFile(await readFile(path, "utf-8")) : [];
  }
  return payload;
}

async function logError(dir: string, hook: HookName, error: string): Promise<void> {
  await appendFile(join(dir, "errors.log"), `${new Date().toISOString()} ${hook}: ${error}\n`).catch(() => {});
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
      const manifest = validateManifest(JSON.parse(await readFile(join(dir, "haren-plugin.json"), "utf-8")));
      command = manifest.hooks[hook];
      config = { ...manifest.config, ...entry.config };
    } catch (err) {
      await fail(`manifest unreadable: ${(err as Error).message}. Run 'haren plugin doctor'.`);
      continue;
    }
    if (!command) continue;

    const proc = Bun.spawn(["sh", "-c", command], {
      cwd: dir,
      stdin: new Blob([payload]),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HAREN_ROOT: o.workspaceDir,
        HAREN_DIR: o.harenDir,
        HAREN_PLUGIN_DIR: dir,
        HAREN_PLUGIN_CONFIG: JSON.stringify(config),
      },
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, o.timeoutMs ?? 30_000);
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timer);

    if (timedOut) {
      await fail(`timed out after ${o.timeoutMs ?? 30_000} ms`);
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
  const outcomes = await runHook(hook, input, o);
  const lines: string[] = [];
  const updates: unknown[] = [];
  for (const out of outcomes) {
    for (const m of out.messages) lines.push(`[${out.plugin}] ${m}`);
    if (!out.ok) lines.push(`[${out.plugin}] warning: ${hook} failed: ${out.error}`);
    updates.push(...out.updates);
  }
  const progressPath = join(o.harenDir, "progress.json");
  if (updates.length > 0 && existsSync(progressPath)) {
    const result = applyUpdates(await readProgress(progressPath), updates);
    if (result.applied.length > 0) await writeProgress(progressPath, result.progress);
    for (const u of result.applied) lines.push(`updated ${u.module}/${u.feature} → ${u.status}`);
    for (const s of result.skipped) lines.push(`skipped update ${JSON.stringify(s.update)}: ${s.reason}`);
  }
  return lines;
}
