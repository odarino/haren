import { readFile } from "fs/promises";
import { join } from "path";
import { HOOK_NAMES, type HookName, readInstalledManifest } from "../plugins/manifest";
import {
  installPlugin,
  removeEditorCopies,
  removePlugin,
  type InstallContext,
} from "../plugins/install";
import { checkRequirement } from "../plugins/requires";
import { runHookAndApply } from "../plugins/runner";
import { pluginDir, readPlugins } from "../plugins/state";
import { parseManifest } from "../workspace/manifest";
import { detectEditor, pluginFiles, writeRootFiles } from "../workspace/root-files";
import { harenDirFlag, MultipleHarenDirsError, resolveHarenDir } from "../workspace/resolve";

export type PluginSub = "add" | "remove" | "list" | "run" | "doctor";
const SUBS: PluginSub[] = ["add", "remove", "list", "run", "doctor"];

export interface PluginArgs {
  sub: PluginSub;
  target?: string;
  payload: Record<string, unknown>;
  yes: boolean;
}

const USAGE =
  "Usage: haren plugin add <name|source> | remove <name> | list | run <hook> [--payload <json>] | doctor";

export function parsePluginArgs(args: string[]): PluginArgs {
  const sub = args[0] as PluginSub;
  if (!SUBS.includes(sub)) throw new Error(USAGE);
  const yes = args.includes("--yes") || args.includes("-y");
  const target = args[1] && !args[1].startsWith("-") ? args[1] : undefined;
  if ((sub === "add" || sub === "remove") && !target)
    throw new Error(`haren plugin ${sub} needs a plugin`);
  if (sub === "run" && !(HOOK_NAMES as readonly string[]).includes(target ?? "")) {
    throw new Error(`Unknown hook: ${target ?? ""}. Hooks: ${HOOK_NAMES.join(", ")}`);
  }
  let payload: Record<string, unknown> = {};
  const i = args.indexOf("--payload");
  if (i >= 0) {
    try {
      payload = JSON.parse(args[i + 1] ?? "");
    } catch {
      throw new Error("--payload must be JSON");
    }
  }
  return { sub, target, payload, yes };
}

async function confirm(question: string, yes: boolean): Promise<boolean> {
  if (yes) return true;
  if (!process.stdin.isTTY) return false;
  process.stdout.write(`  \x1b[36m?\x1b[0m ${question} (y/N) `);
  const answer = await new Promise<string>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", (d) => {
      process.stdin.pause();
      resolve(d.toString().trim());
    });
  });
  return /^y(es)?$/i.test(answer);
}

export async function plugin(args: string[]): Promise<void> {
  let opts: PluginArgs;
  try {
    opts = parsePluginArgs(args);
  } catch (err) {
    console.error(`  ${(err as Error).message}`);
    process.exit(1);
  }
  if (opts.sub === "run") {
    // run never fails the caller: any setup problem becomes a warning.
    try {
      const loc = await resolveHarenDir(process.cwd(), {
        harenDir: harenDirFlag(args),
        env: process.env,
      });
      if (!loc) throw new Error("No haren folder found");
      for (const line of await runHookAndApply(opts.target as HookName, opts.payload, {
        workspaceDir: loc.workspaceDir,
        harenDir: loc.harenDir,
      })) {
        console.log(`  ${line}`);
      }
    } catch (err) {
      console.log(`  warning: plugin hook ${opts.target} skipped: ${(err as Error).message}`);
    }
    return;
  }
  let location;
  try {
    location = await resolveHarenDir(process.cwd(), {
      harenDir: harenDirFlag(args),
      env: process.env,
    });
  } catch (err) {
    console.error(`  ${err instanceof MultipleHarenDirsError ? err.message : String(err)}`);
    process.exit(1);
  }
  if (!location) {
    console.error("  No haren folder found. Run 'haren init' first.");
    process.exit(1);
  }
  const { workspaceDir, harenDir } = location;
  const manifest = parseManifest(await readFile(join(harenDir, "manifest.yaml"), "utf-8"));
  const ctx: InstallContext = {
    workspaceDir,
    harenDir,
    project: String(manifest.project ?? ""),
    io: { confirm: (q) => confirm(q, opts.yes), log: (l) => console.log(`  ${l}`) },
  };
  const syncEditors = () =>
    writeRootFiles({ workspaceDir, harenDir, editor: detectEditor(workspaceDir) ?? "claude-code" });

  switch (opts.sub) {
    case "add":
      try {
        await installPlugin(opts.target!, ctx);
      } catch (err) {
        console.error(`  ${(err as Error).message}`);
        process.exit(1);
      }
      await syncEditors();
      return;
    case "remove":
      try {
        const copies = await pluginFiles(harenDir, opts.target!);
        await removePlugin(opts.target!, ctx);
        await removeEditorCopies(workspaceDir, copies);
      } catch (err) {
        console.error(`  ${(err as Error).message}`);
        process.exit(1);
      }
      await syncEditors();
      console.log(`  Removed plugin ${opts.target}. Tool data in the project stays.`);
      return;
    case "list": {
      const state = await readPlugins(harenDir);
      const rows = Object.entries(state.plugins);
      if (rows.length === 0) console.log("  No plugins installed.");
      for (const [name, e] of rows) {
        console.log(`  ${name}  ${e.version}  ${e.enabled ? "enabled" : "disabled"}  ${e.source}`);
      }
      return;
    }
    case "doctor": {
      const state = await readPlugins(harenDir);
      for (const name of Object.keys(state.plugins)) {
        const dir = pluginDir(harenDir, name);
        try {
          const m = await readInstalledManifest(dir);
          console.log(`  ${name}: manifest ok (${m.version})`);
          for (const req of m.requires) {
            const s = await checkRequirement(req);
            console.log(
              `    ${req.bin}: ${s.ok ? `ok ${s.version ?? ""}` : s.reason}${!s.ok && req.install ? ` — run: ${req.install}` : ""}`,
            );
          }
        } catch (err) {
          console.log(`  ${name}: ${(err as Error).message}`);
        }
        const log = Bun.file(join(dir, "errors.log"));
        if (await log.exists()) {
          const last = (await log.text()).trim().split("\n").slice(-3);
          for (const l of last) console.log(`    last error: ${l}`);
        }
      }
      return;
    }
  }
}
