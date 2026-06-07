import { join } from "path";
import { readAgentConfig, writeAgentConfig, type AgentConfig } from "../agent/config";
import { detectCLIs } from "../agent/cli-detector";

async function findHarenDir(): Promise<string | null> {
  const cwd = process.cwd();
  const harenDir = join(cwd, "haren");
  const manifestFile = Bun.file(join(harenDir, "manifest.yaml"));
  if (await manifestFile.exists()) return harenDir;
  return null;
}

async function getGitRemoteUrl(): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "remote", "get-url", "origin"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const text = await new Response(proc.stdout).text();
    return text.trim() || null;
  } catch {
    return null;
  }
}

function readLine(question: string): Promise<string> {
  process.stdout.write(question);
  return new Promise((resolve) => {
    let data = "";
    process.stdin.resume();
    process.stdin.once("data", (chunk) => {
      data = chunk.toString().trim();
      process.stdin.pause();
      resolve(data);
    });
  });
}

export async function agent(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === "help") {
    console.log("Usage:");
    console.log("  haren agent start    Start the local agent");
    console.log("  haren agent stop     Stop the local agent");
    console.log("  haren agent status   Show agent connection status");
    return;
  }

  const harenDir = await findHarenDir();
  if (!harenDir) {
    console.error("No haren/ directory found. Run 'haren init' first.");
    process.exit(1);
  }

  switch (subcommand) {
    case "start":
      await startAgent(harenDir);
      break;
    case "stop":
      await stopAgent(harenDir);
      break;
    case "status":
      await showStatus(harenDir);
      break;
    default:
      console.error(`Unknown agent subcommand: ${subcommand}`);
      process.exit(1);
  }
}

async function startAgent(harenDir: string): Promise<void> {
  let config = await readAgentConfig(harenDir);

  if (!config) {
    console.log("First-time agent setup\n");

    const portalUrl =
      (await readLine("Portal URL (default: https://portal.example.com): ")) ||
      "https://portal.example.com";

    const teamCode = await readLine("Team code: ");
    if (!teamCode) {
      console.error("Team code is required.");
      process.exit(1);
    }

    const userName = await readLine("Your name: ");
    if (!userName) {
      console.error("Name is required.");
      process.exit(1);
    }

    const userId = crypto.randomUUID();
    config = { portalUrl, teamCode, userId, userName };
    await writeAgentConfig(harenDir, config);
    console.log("\nConfig saved to haren/.agent.json");
  }

  const gitRemoteUrl = await getGitRemoteUrl();
  if (!gitRemoteUrl) {
    console.error("Could not detect git remote URL. Is this a git repository?");
    process.exit(1);
  }

  const projectName = gitRemoteUrl.split("/").pop()?.replace(".git", "") ?? "unknown";

  const clis = await detectCLIs();
  console.log(`Available CLIs: ${clis.length > 0 ? clis.join(", ") : "none"}`);

  const { connectToPortal } = await import("../agent/connection");
  console.log(`Connecting to ${config.portalUrl}...`);

  await connectToPortal({
    portalUrl: config.portalUrl,
    teamCode: config.teamCode,
    userId: config.userId,
    gitRemoteUrl,
    projectName,
    harenDir,
    availableCLIs: clis,
  });
}

async function stopAgent(harenDir: string): Promise<void> {
  const pidFile = Bun.file(join(harenDir, ".agent.pid"));
  if (!(await pidFile.exists())) {
    console.log("Agent is not running.");
    return;
  }

  const pid = Number.parseInt(await pidFile.text(), 10);
  try {
    process.kill(pid, "SIGTERM");
    console.log(`Agent (PID ${pid}) stopped.`);
  } catch {
    console.log("Agent process not found. Cleaning up.");
  }

  const { unlink } = await import("fs/promises");
  await unlink(join(harenDir, ".agent.pid")).catch(() => {});
}

async function showStatus(harenDir: string): Promise<void> {
  const config = await readAgentConfig(harenDir);
  if (!config) {
    console.log("Agent is not configured. Run 'haren agent start' first.");
    return;
  }

  const pidFile = Bun.file(join(harenDir, ".agent.pid"));
  const isRunning = await pidFile.exists();

  console.log(`Portal:  ${config.portalUrl}`);
  console.log(`Team:    ${config.teamCode}`);
  console.log(`User:    ${config.userName}`);
  console.log(`Status:  ${isRunning ? "Running" : "Stopped"}`);

  if (isRunning) {
    const pid = Number.parseInt(await pidFile.text(), 10);
    console.log(`PID:     ${pid}`);
  }
}
