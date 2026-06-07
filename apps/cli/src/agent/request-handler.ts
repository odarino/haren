import type { AgentMessage, ServerToAgentMessage } from "@haren/shared";
import type { ConnectionConfig } from "./connection";
import { readProgress, readArtifactTree, readArtifact, readGitLog } from "./artifact-reader";
import { executeCLI } from "./cli-executor";

type SendFn = (msg: AgentMessage) => void;

export function handleServerMessage(
  msg: ServerToAgentMessage,
  config: ConnectionConfig,
  send: SendFn,
): void {
  switch (msg.type) {
    case "data-request":
      handleDataRequest(msg.requestId, msg.path, config.harenDir, send);
      break;
    case "command":
      handleCommand(msg.commandId, msg.prompt, msg.cli, config, send);
      break;
    case "auth-ok":
    case "auth-fail":
      break;
  }
}

async function handleDataRequest(
  requestId: string,
  path: string,
  harenDir: string,
  send: SendFn,
): Promise<void> {
  let data: unknown;

  switch (path) {
    case "progress":
      data = await readProgress(harenDir);
      break;
    case "artifacts":
      data = await readArtifactTree(harenDir);
      break;
    case "git-log":
      data = await readGitLog();
      break;
    default:
      if (path.startsWith("artifacts/")) {
        data = await readArtifact(harenDir, path);
      } else {
        data = null;
      }
  }

  send({ type: "data-response", requestId, data });
}

async function handleCommand(
  commandId: string,
  prompt: string,
  cli: string,
  config: ConnectionConfig,
  send: SendFn,
): Promise<void> {
  const { mkdir } = await import("fs/promises");
  await mkdir(`${config.harenDir}/events`, { recursive: true });
  const { appendEvent } = await import("../workspace/events");
  const eventsPath = `${config.harenDir}/events/agent-commands.jsonl`;
  await appendEvent(eventsPath, {
    type: "agent-command",
    timestamp: new Date().toISOString(),
    cli,
    prompt,
    commandId,
  });

  await executeCLI(cli, prompt, (chunk, done) => {
    send({ type: "command-output", commandId, chunk, done });
  });
}
