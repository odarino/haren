// Structured agent event types (enhanced command-output)
export type AgentEventType =
  | { type: "thinking" }
  | {
      type: "tool-call";
      name: string;
      args: Record<string, unknown>;
      status: "running" | "done";
      result?: string;
    }
  | { type: "text-chunk"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

// Agent → Server
export type AgentMessage =
  | {
      type: "auth";
      teamCode: string;
      gitRemoteUrl: string;
      projectName: string;
      userId: string;
    }
  | { type: "heartbeat" }
  | { type: "data-response"; requestId: string; data: unknown }
  | {
      type: "command-output";
      commandId: string;
      chunk: string;
      done: boolean;
    }
  | { type: "command-event"; commandId: string; event: AgentEventType };

// Server → Agent
export type ServerToAgentMessage =
  | { type: "auth-ok"; sessionId: string }
  | { type: "auth-fail"; reason: string }
  | { type: "data-request"; requestId: string; path: string }
  | { type: "command"; commandId: string; prompt: string; cli: string };

// Browser → Server
export type BrowserMessage =
  | { type: "subscribe"; teamId: string; userId: string }
  | {
      type: "data-request";
      projectId: string;
      userId: string;
      path: string;
    }
  | {
      type: "command";
      projectId: string;
      userId: string;
      prompt: string;
      cli: string;
    };

// Server → Browser
export type ServerToBrowserMessage =
  | {
      type: "subscribed";
      projects: { id: string; name: string; agentOnline: boolean }[];
    }
  | { type: "data-response"; requestId: string; data: unknown }
  | {
      type: "command-output";
      commandId: string;
      chunk: string;
      done: boolean;
    }
  | { type: "agent-status"; projectId: string; online: boolean }
  | { type: "command-event"; commandId: string; event: AgentEventType };
