import React from "react";
import { Avatar } from "../../shared/Avatar";
import { MarkdownRenderer } from "../../shared/MarkdownRenderer";
import { ToolCallChip } from "./ToolCallChip";

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  status: "running" | "done";
  result?: string;
}

export interface AgentMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: Date;
  toolCalls?: ToolCallRecord[];
  userName?: string;
}

interface MessageProps {
  message: AgentMessage;
  streaming?: boolean;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function Message({ message, streaming = false }: MessageProps) {
  const isUser = message.role === "user";
  const displayName = isUser ? (message.userName ?? "You") : "Haren Agent";

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "10px 0",
        alignItems: "flex-start",
        flexDirection: isUser ? "row-reverse" : "row",
      }}
    >
      {/* Avatar */}
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        {isUser ? (
          <Avatar name={displayName} hue={210} size="sm" />
        ) : (
          <span
            title="Haren Agent"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "linear-gradient(135deg, hsl(256 65% 48%), hsl(200 70% 38%))",
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              flexShrink: 0,
            }}
          >
            HA
          </span>
        )}
      </div>

      {/* Bubble */}
      <div
        style={{
          maxWidth: "75%",
          minWidth: 0,
        }}
      >
        {/* Meta row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 4,
            flexDirection: isUser ? "row-reverse" : "row",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            {displayName}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {formatTime(message.timestamp)}
          </span>
        </div>

        {/* Tool-call chips (agent only) */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {message.toolCalls.map((tc, i) => (
              <ToolCallChip
                key={`${tc.name}-${i}`}
                name={tc.name}
                args={tc.args}
                status={tc.status}
                result={tc.result}
              />
            ))}
          </div>
        )}

        {/* Text content */}
        {message.text && (
          <div
            style={{
              background: isUser ? "var(--accent, #3b82f6)" : "var(--bg-secondary)",
              color: isUser ? "#fff" : "var(--text-primary)",
              borderRadius: isUser ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
              padding: "8px 12px",
              fontSize: 13,
              lineHeight: 1.6,
              position: "relative",
            }}
          >
            {isUser ? (
              <span style={{ whiteSpace: "pre-wrap" }}>{message.text}</span>
            ) : (
              <MarkdownRenderer content={message.text} />
            )}

            {/* Streaming cursor */}
            {streaming && !isUser && (
              <span
                style={{
                  display: "inline-block",
                  width: 2,
                  height: "1em",
                  background: "var(--accent)",
                  marginLeft: 2,
                  verticalAlign: "text-bottom",
                  animation: "cursor-blink 1s step-end infinite",
                }}
              />
            )}
            <style>{`
              @keyframes cursor-blink {
                0%, 100% { opacity: 1; }
                50% { opacity: 0; }
              }
            `}</style>
          </div>
        )}
      </div>
    </div>
  );
}
