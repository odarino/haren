import React from "react";

const STATUS_COLORS: Record<string, string> = {
  discovered: "var(--accent)",
  decomposed: "var(--accent)",
  specified: "#6366f1",
  planned: "var(--warning)",
  implementing: "var(--success)",
  evaluating: "var(--purple)",
  completed: "#10b981",
  blocked: "var(--danger)",
  pending: "var(--text-muted)",
  "in-progress": "var(--warning)",
  passing: "var(--success)",
  fixing: "var(--danger)",
  todo: "var(--text-muted)",
  review: "var(--purple)",
  done: "var(--success)",
};

export function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "var(--text-muted)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        color: "#fff",
        backgroundColor: color,
      }}
    >
      {status}
    </span>
  );
}
