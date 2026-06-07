import React, { useState, useRef, useEffect } from "react";
import {
  IconRobot,
  IconCircle,
  IconCircleCheck,
  IconHash,
  IconClock,
  IconCoins,
  IconRepeat,
  IconTools,
  IconFiles,
  IconChevronDown,
} from "@tabler/icons-react";
import { StatusPill } from "../../shared/StatusPill";
import { Message } from "./Message";
import { Composer } from "./Composer";
import type { AgentMessage, ToolCallRecord } from "./Message";
import type { AgentEventType } from "@haren/shared";

// ---------------- Types ----------------

interface AgentViewProps {
  projectId: string;
  agentOnline: boolean;
  availableCLIs?: string[];
  onSendCommand: (prompt: string, cli: string) => void;
  onClearChat: () => void;
  /** Structured command events streamed from the relay */
  commandEvents?: { commandId: string; event: AgentEventType }[];
  /** Legacy raw-chunk output (backward compat) */
  commandOutput?: { commandId: string; chunks: string[]; done: boolean }[];
  userName?: string;
}

const AVAILABLE_TOOLS = [
  "read_file",
  "write_file",
  "query_tasks",
  "list_artifacts",
  "run_command",
  "git_status",
  "git_commit",
];

// Derive a stable session id from projectId for display
function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

// Build AgentMessage history from command events
function buildMessagesFromEvents(
  events: { commandId: string; event: AgentEventType }[],
  commandOutput: { commandId: string; chunks: string[]; done: boolean }[],
): AgentMessage[] {
  if (events.length === 0) {
    // Fall back to legacy chunk output
    return commandOutput.map((cmd) => ({
      id: cmd.commandId,
      role: "agent" as const,
      text: cmd.chunks.join(""),
      timestamp: new Date(),
      toolCalls: [],
    }));
  }

  // Group events by commandId
  const byCommand = new Map<
    string,
    {
      text: string;
      toolCalls: ToolCallRecord[];
      lastTs: Date;
      done: boolean;
    }
  >();

  for (const { commandId, event } of events) {
    if (!byCommand.has(commandId)) {
      byCommand.set(commandId, { text: "", toolCalls: [], lastTs: new Date(), done: false });
    }
    const entry = byCommand.get(commandId)!;

    if (event.type === "text-chunk") {
      entry.text += event.text;
      entry.lastTs = new Date();
    } else if (event.type === "tool-call") {
      const existing = entry.toolCalls.find((tc) => tc.name === event.name);
      if (existing) {
        existing.status = event.status;
        if (event.result !== undefined) existing.result = event.result;
      } else {
        entry.toolCalls.push({
          name: event.name,
          args: event.args,
          status: event.status,
          result: event.result,
        });
      }
    } else if (event.type === "done") {
      entry.done = true;
    }
  }

  return Array.from(byCommand.entries()).map(([commandId, entry]) => ({
    id: commandId,
    role: "agent" as const,
    text: entry.text,
    timestamp: entry.lastTs,
    toolCalls: entry.toolCalls,
  }));
}

// -------- Context Rail --------

interface ContextRailProps {
  agentOnline: boolean;
  projectId: string;
  streaming: boolean;
  totalTurns: number;
}

function ContextRail({ agentOnline, projectId, streaming, totalTurns }: ContextRailProps) {
  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        overflowY: "auto",
        background: "var(--bg-secondary)",
      }}
    >
      {/* Session */}
      <RailSection title="session">
        <KV label="id" value={shortId(projectId)} mono />
        <KV
          label="status"
          value={
            streaming ? (
              <span style={{ color: "var(--warning)" }}>working</span>
            ) : agentOnline ? (
              <span style={{ color: "var(--success)" }}>online</span>
            ) : (
              <span style={{ color: "var(--text-muted)" }}>offline</span>
            )
          }
        />
        <KV label="turns" value={String(totalTurns)} />
        <KV label="started" value={new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
      </RailSection>

      {/* Tools available */}
      <RailSection title="tools available">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {AVAILABLE_TOOLS.map((tool) => (
            <span
              key={tool}
              style={{
                padding: "2px 8px",
                borderRadius: 99,
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                background: "var(--bg-tertiary, #374151)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              {tool}
            </span>
          ))}
        </div>
      </RailSection>

      {/* Context */}
      <RailSection title="context">
        <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
          No artifacts attached yet.
        </div>
      </RailSection>
    </div>
  );
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function KV({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 12,
        marginBottom: 4,
      }}
    >
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span
        style={{
          color: "var(--text-secondary)",
          fontFamily: mono ? "var(--font-mono)" : "inherit",
          fontSize: mono ? 11 : 12,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// -------- Main AgentView --------

export function AgentView({
  projectId,
  agentOnline,
  availableCLIs = ["claude", "cursor", "github-copilot-cli"],
  onSendCommand,
  onClearChat,
  commandEvents = [],
  commandOutput = [],
  userName,
}: AgentViewProps) {
  const [selectedCLI, setSelectedCLI] = useState(availableCLIs[0] ?? "claude");
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState<AgentMessage[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // Derive agent messages from structured events (or fallback to raw chunks)
  const agentMessages = buildMessagesFromEvents(commandEvents, commandOutput);

  // Merge user messages (local) with agent replies
  const allMessages: AgentMessage[] = [...localMessages, ...agentMessages].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );

  const streaming =
    commandOutput.some((c) => !c.done) ||
    commandEvents.some((e) => e.event.type !== "done" && e.event.type !== "error");

  // Auto-scroll on new content
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [allMessages.length, streaming]);

  const handleSend = (text: string) => {
    // Add user message to local history
    const userMsg: AgentMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
      timestamp: new Date(),
      userName,
    };
    setLocalMessages((prev) => [...prev, userMsg]);
    onSendCommand(text, selectedCLI);
  };

  const handleClear = () => {
    setLocalMessages([]);
    onClearChat();
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 60px)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 0 12px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <IconRobot size={18} style={{ color: "var(--accent)" }} />
        <span style={{ fontWeight: 600, fontSize: 15, color: "var(--text-primary)" }}>
          Agent
        </span>

        {/* Status pill */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: 99,
            fontSize: 11,
            fontWeight: 600,
            background: agentOnline
              ? "rgba(16,185,129,0.12)"
              : "rgba(107,114,128,0.15)",
            color: agentOnline ? "var(--success, #10b981)" : "var(--text-muted)",
            border: `1px solid ${agentOnline ? "rgba(16,185,129,0.3)" : "var(--border)"}`,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: agentOnline ? "var(--success, #10b981)" : "var(--text-muted)",
              display: "inline-block",
              animation: agentOnline && streaming ? "pulse 1.2s ease-in-out infinite" : "none",
            }}
          />
          {streaming ? "working" : agentOnline ? "online" : "offline"}
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.5; transform: scale(1.4); }
            }
          `}</style>
        </span>

        {/* CLI selector */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {allMessages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              New Chat
            </button>
          )}

          <div
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <select
              value={selectedCLI}
              onChange={(e) => setSelectedCLI(e.target.value)}
              style={{
                padding: "4px 28px 4px 10px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                fontSize: 12,
                appearance: "none",
                cursor: "pointer",
                paddingRight: 28,
              }}
            >
              {availableCLIs.map((cli) => (
                <option key={cli} value={cli}>
                  {cli}
                </option>
              ))}
            </select>
            <IconChevronDown
              size={12}
              style={{
                position: "absolute",
                right: 8,
                pointerEvents: "none",
                color: "var(--text-muted)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Body: message list + context rail */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Message list + composer */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          {/* Messages */}
          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "8px 0",
            }}
          >
            {allMessages.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  gap: 12,
                  color: "var(--text-muted)",
                }}
              >
                <IconRobot size={40} style={{ opacity: 0.3 }} />
                <div style={{ fontSize: 14 }}>
                  {agentOnline
                    ? "Send a message to start working with the agent."
                    : "Agent is offline. Run 'haren agent start' to connect."}
                </div>
              </div>
            ) : (
              allMessages.map((msg, i) => (
                <Message
                  key={msg.id}
                  message={msg}
                  streaming={streaming && i === allMessages.length - 1 && msg.role === "agent"}
                />
              ))
            )}
          </div>

          {/* Composer */}
          <div
            style={{
              flexShrink: 0,
              padding: "12px 0 4px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <Composer
              onSend={handleSend}
              streaming={streaming}
              disabled={!agentOnline}
              draft={draft}
              onDraftChange={setDraft}
            />
          </div>
        </div>

        {/* Context rail */}
        <ContextRail
          agentOnline={agentOnline}
          projectId={projectId}
          streaming={streaming}
          totalTurns={allMessages.filter((m) => m.role === "user").length}
        />
      </div>
    </div>
  );
}
