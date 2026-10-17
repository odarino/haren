#!/usr/bin/env bun

interface ParsedCommand {
  command: "init" | "upgrade" | "agent" | "plugin" | "help" | "unknown";
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
    case "help":
      console.log("Usage:");
      console.log("  haren init      Set up haren (detects monorepo or multi-repo workspace)");
      console.log(
        "                  --dir <path>  --layout monorepo|workspace  --haren-dir <name>",
      );
      console.log("                  --yes|-y  --dry-run  --force");
      console.log("                  --plugin <name|source>  (repeatable)");
      console.log(
        "  haren upgrade   Upgrade framework files and migrate manifest/progress (--dry-run)",
      );
      console.log("  haren agent     Manage local agent (start, stop, status)");
      console.log("  haren plugin    Manage plugins (add, remove, list, run, doctor)");
      break;
    case "unknown":
      console.error(`Unknown command: ${parsed.args[0]}`);
      console.log("Usage: haren init | haren upgrade");
      process.exit(1);
  }
}

main().catch((err) => {
  const debug = process.env.HAREN_DEBUG === "1";
  const message = err instanceof Error ? (debug && err.stack) || err.message : String(err);
  console.error(`  ${message}`);
  process.exit(1);
});
