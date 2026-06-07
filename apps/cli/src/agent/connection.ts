import { join } from "path";
import type { AgentMessage, ServerToAgentMessage } from "@haren/shared";

export interface ConnectionConfig {
  portalUrl: string;
  teamCode: string;
  userId: string;
  gitRemoteUrl: string;
  projectName: string;
  harenDir: string;
  availableCLIs: string[];
}

export function buildWsUrl(portalUrl: string): string {
  return portalUrl.replace(/^https/, "wss").replace(/^http/, "ws") + "/ws/agent";
}

export function buildAuthMessage(opts: {
  teamCode: string;
  gitRemoteUrl: string;
  projectName: string;
  userId: string;
}): AgentMessage {
  return {
    type: "auth",
    teamCode: opts.teamCode,
    gitRemoteUrl: opts.gitRemoteUrl,
    projectName: opts.projectName,
    userId: opts.userId,
  };
}

export async function connectToPortal(config: ConnectionConfig): Promise<void> {
  await Bun.write(join(config.harenDir, ".agent.pid"), process.pid.toString());
  setupCleanup(config.harenDir);

  try {
    await connectWebSocket(config);
    return;
  } catch {
    console.log("WebSocket failed, trying SSE...");
  }

  try {
    await connectSSE(config);
    return;
  } catch {
    console.log("SSE failed, trying polling...");
  }

  await connectPolling(config);
}

async function connectWebSocket(config: ConnectionConfig): Promise<void> {
  const wsUrl = buildWsUrl(config.portalUrl);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket connection timeout"));
    }, 10_000);

    ws.onopen = () => {
      clearTimeout(timeout);
      const authMsg = buildAuthMessage(config);
      ws.send(JSON.stringify(authMsg));
    };

    ws.onmessage = async (event) => {
      const msg: ServerToAgentMessage = JSON.parse(event.data as string);

      if (msg.type === "auth-ok") {
        console.log(`Connected! Session: ${msg.sessionId}`);
        startHeartbeat(ws);

        const { handleServerMessage } = await import("./request-handler");
        ws.onmessage = (event) => {
          const innerMsg: ServerToAgentMessage = JSON.parse(event.data as string);
          handleServerMessage(innerMsg, config, (response) => {
            ws.send(JSON.stringify(response));
          });
        };

        resolve();
      } else if (msg.type === "auth-fail") {
        clearTimeout(timeout);
        console.error(`Auth failed: ${msg.reason}`);
        ws.close();
        reject(new Error(msg.reason));
      }
    };

    let retryCount = 0;
    ws.onclose = () => {
      if (retryCount >= 10) {
        console.error("Max reconnection attempts reached. Run 'haren agent start' to retry.");
        return;
      }
      retryCount++;
      const delay = Math.min(1000 * 2 ** (retryCount - 1), 30_000);
      console.log(`Disconnected. Reconnecting in ${delay / 1000}s...`);
      setTimeout(() => connectToPortal(config).catch(() => {}), delay);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("WebSocket error"));
    };
  });
}

function startHeartbeat(ws: WebSocket): void {
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "heartbeat" }));
    } else {
      clearInterval(interval);
    }
  }, 30_000);
}

async function connectSSE(config: ConnectionConfig): Promise<void> {
  const authRes = await fetch(`${config.portalUrl}/sse/agent/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      teamCode: config.teamCode,
      gitRemoteUrl: config.gitRemoteUrl,
      projectName: config.projectName,
      userId: config.userId,
    }),
  });

  if (!authRes.ok) throw new Error("SSE auth failed");
  const { sessionId } = await authRes.json();
  console.log(`Connected via SSE! Session: ${sessionId}`);

  const { handleServerMessage } = await import("./request-handler");

  const streamRes = await fetch(`${config.portalUrl}/sse/agent/stream?sessionId=${sessionId}`);
  const reader = streamRes.body?.getReader();
  if (!reader) throw new Error("No SSE stream");

  const decoder = new TextDecoder();
  const sendResponse = async (response: AgentMessage) => {
    await fetch(`${config.portalUrl}/sse/agent/send?sessionId=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    });
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        try {
          const msg: ServerToAgentMessage = JSON.parse(data);
          handleServerMessage(msg, config, sendResponse);
        } catch {}
      }
    }
  }
}

async function connectPolling(config: ConnectionConfig): Promise<void> {
  const authRes = await fetch(`${config.portalUrl}/poll/agent/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      teamCode: config.teamCode,
      gitRemoteUrl: config.gitRemoteUrl,
      projectName: config.projectName,
      userId: config.userId,
    }),
  });

  if (!authRes.ok) throw new Error("Polling auth failed");
  const { sessionId } = await authRes.json();
  console.log(`Connected via polling! Session: ${sessionId}`);

  const { handleServerMessage } = await import("./request-handler");

  const sendResponse = async (response: AgentMessage) => {
    await fetch(`${config.portalUrl}/poll/agent/send?sessionId=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    });
  };

  while (true) {
    try {
      const res = await fetch(`${config.portalUrl}/poll/agent/messages?sessionId=${sessionId}`);
      const { messages } = await res.json();
      for (const msg of messages) {
        handleServerMessage(msg as ServerToAgentMessage, config, sendResponse);
      }
    } catch {}
    await Bun.sleep(2000);
  }
}

function setupCleanup(harenDir: string): void {
  const pidPath = join(harenDir, ".agent.pid");
  const cleanup = async () => {
    console.log("Agent shutting down...");
    const { unlink } = await import("fs/promises");
    await unlink(pidPath).catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
}
