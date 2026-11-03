#!/usr/bin/env bun

import { ExitCode } from "./lib/exit-code";

interface ParsedCommand {
  command:
    | "init"
    | "upgrade"
    | "agent"
    | "plugin"
    | "track"
    | "migrate"
    | "companion"
    | "help"
    | "unknown";
  args: string[];
}

export function parseArgs(args: string[]): ParsedCommand {
  if (args.length === 0) {
    return { command: "help", args: [] };
  }

  const command = args[0];
  const rest = args.slice(1);
  if (rest.includes("--help") || rest.includes("-h")) {
    return { command: "help", args: [] };
  }

  switch (command) {
    case "--help":
    case "-h":
      return { command: "help", args: [] };
    case "init":
    case "upgrade":
    case "agent":
    case "plugin":
    case "track":
    case "migrate":
    case "companion":
      return { command, args: rest };
    default:
      return { command: "unknown", args };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  switch (parsed.command) {
    case "init": {
      const { init } = await import("./commands/init");
      await init(parsed.args);
      break;
    }
    case "upgrade": {
      const { upgrade } = await import("./commands/upgrade");
      await upgrade(parsed.args);
      break;
    }
    case "agent": {
      const { agent } = await import("./commands/agent");
      await agent(parsed.args);
      break;
    }
    case "plugin": {
      const { plugin } = await import("./commands/plugin");
      await plugin(parsed.args);
      break;
    }
    case "track": {
      const { track } = await import("./commands/track");
      await track(parsed.args);
      break;
    }
    case "migrate": {
      const { migrate } = await import("./commands/migrate");
      await migrate(parsed.args);
      break;
    }
    case "companion": {
      const { companion } = await import("./commands/companion");
      await companion(parsed.args);
      break;
    }
    case "help":
      console.log("Usage:");
      console.log("  haren init      Set up haren (detects monorepo or multi-repo workspace)");
      console.log(
        "                  --dir <path>  --layout monorepo|workspace  --haren-dir <name>",
      );
      console.log("                  --mode <undecided|explore|blueprint|inherit|migration>");
      console.log("                  --yes|-y  --dry-run  --force");
      console.log("                  --plugin <name|source>  (repeatable)");
      console.log(
        "  haren upgrade   Upgrade framework files and migrate manifest/progress (--dry-run, --yes)",
      );
      console.log("  haren agent     Manage local agent (start, stop, status)");
      console.log("  haren plugin    Manage plugins (add, remove, list, run, doctor)");
      console.log("  haren track     Record progress and events:");
      console.log(
        "                  status <module> <status> [--branch <name>] [--repos <key1,key2>]",
      );
      console.log("                  feature <module> <feature> [status]");
      console.log("                  commit <module> <repoKey> <sha>");
      console.log("                  depends <module> [dep ...]   (replace the dependency list)");
      console.log(
        "                  artifact <id> --type <type> --path <path> [--module <m>] [--status <s>]",
      );
      console.log(
        "                  event <type> [--module m] [--phase p] [--feature f] [--data '<json>']",
      );
      console.log("                  unit <module> <unit> <status>   (migration mode)");
      console.log("                  ui-mode <ask|ascii|browser>");
      console.log('                  override on --reason "<text>" [--hours <n>] | override off');
      console.log("  haren migrate   Run the migration adapter:");
      console.log(
        "                  inventory [--module <m>] | extract <unit> | gate <unit> [--approve]",
      );
      console.log(
        "                  gate exit codes: 0 approved, 1 failed, 3 PASS but not approved yet",
      );
      console.log(
        "  haren companion Visual companion server: start [--foreground] [--open] | status | stop",
      );
      break;
    case "unknown":
      console.error(`Unknown command: ${parsed.args[0]}`);
      console.log(
        "Usage: haren init | upgrade | agent | plugin | track | migrate | companion (haren --help)",
      );
      process.exit(1);
  }
}

main().catch((err) => {
  const debug = process.env.HAREN_DEBUG === "1";
  const message = err instanceof Error ? (debug && err.stack) || err.message : String(err);
  if (message) console.error(`  ${message}`);
  process.exit(err instanceof ExitCode ? err.code : 1);
});
