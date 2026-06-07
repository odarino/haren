#!/usr/bin/env bun

interface ParsedCommand {
  command: "init" | "upgrade" | "agent" | "help" | "unknown";
  args: string[];
}

export function parseArgs(args: string[]): ParsedCommand {
  if (args.length === 0) {
    return { command: "help", args: [] };
  }

  const command = args[0];
  const rest = args.slice(1);

  switch (command) {
    case "init":
    case "upgrade":
    case "agent":
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
    case "help":
      console.log("Usage:");
      console.log("  haren init      Create a new Haren workspace");
      console.log("  haren upgrade   Upgrade framework files (agents, skills, templates)");
      console.log("  haren agent     Manage local agent (start, stop, status)");
      break;
    case "unknown":
      console.error(`Unknown command: ${parsed.args[0]}`);
      console.log("Usage: haren init | haren upgrade");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
