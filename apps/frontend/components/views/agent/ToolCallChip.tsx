import React from "react";
import { IconTerminal2, IconCheck, IconLoader2 } from "@tabler/icons-react";

interface ToolCallChipProps {
  name: string;
  args: Record<string, unknown>;
  status: "running" | "done";
  result?: string;
}

export function ToolCallChip({ name, args, status, result }: ToolCallChipProps) {
  const isRunning = status === "running";

  return (
    <div
      style={{
        border: "1px solid var(--accent-4, #818cf8)",
        borderRadius: 8,
        background: "var(--accent-4-tint, rgba(129,140,248,0.08))",
        padding: "8px 12px",
        fontSize: 12,
        fontFamily: "var(--font-mono)",
        marginBottom: 6,
        animation: isRunning ? "tool-pulse 1.8s ease-in-out infinite" : "none",
      }}
    >
      <style>{`
        @keyframes tool-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>

      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: args && Object.keys(args).length > 0 ? 6 : 0,
        }}
      >
        {isRunning ? (
          <IconLoader2
            size={13}
            style={{
              color: "var(--accent-4, #818cf8)",
              animation: "spin 0.8s linear infinite",
            }}
          />
        ) : (
          <IconCheck size={13} style={{ color: "var(--success, #10b981)" }} />
        )}
        <IconTerminal2 size={13} style={{ color: "var(--accent-4, #818cf8)" }} />
        <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{name}</span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            color: isRunning ? "var(--accent-4, #818cf8)" : "var(--success, #10b981)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {isRunning ? "running" : "done"}
        </span>
      </div>

      {/* Args */}
      {Object.keys(args).length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "2px 12px",
            marginBottom: result ? 6 : 0,
          }}
        >
          {Object.entries(args).map(([key, val]) => (
            <span key={key} style={{ color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--accent-4, #818cf8)" }}>{key}</span>
              <span style={{ color: "var(--text-muted)" }}>:</span>
              <span style={{ color: "var(--text-primary)", marginLeft: 3 }}>
                {typeof val === "string"
                  ? val.length > 60
                    ? val.slice(0, 60) + "…"
                    : val
                  : JSON.stringify(val).slice(0, 60)}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Result */}
      {result && (
        <div
          style={{
            borderTop: "1px solid var(--accent-4, #818cf8)",
            paddingTop: 6,
            color: "var(--text-muted)",
            fontSize: 11,
            whiteSpace: "pre-wrap",
            maxHeight: 80,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {result.length > 200 ? result.slice(0, 200) + "…" : result}
        </div>
      )}
    </div>
  );
}
