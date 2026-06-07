import React from "react";
import { Avatar } from "../../shared/Avatar";
import { Chip } from "../../shared/Chip";
import type { Task } from "../../../hooks/use-tasks";

interface TaskCardProps {
  task: Task;
  moduleName?: string;
  highlight?: boolean;
}

const PRIORITY_TONE: Record<string, "bad" | "warn" | "info" | "default"> = {
  p0: "bad",
  p1: "bad",
  p2: "warn",
  p3: "info",
};

export function TaskCard({ task, moduleName, highlight }: TaskCardProps) {
  return (
    <div
      data-task-id={task.id}
      style={{
        padding: "var(--s-4) var(--s-5)",
        background: "var(--bg-1)",
        border: `1px solid ${highlight ? "var(--accent-1)" : "var(--line)"}`,
        borderRadius: "var(--r-md)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-3)",
        boxShadow: highlight ? "0 0 0 2px color-mix(in srgb, var(--accent-1) 25%, transparent)" : "none",
        transition: "border-color 0.4s ease, box-shadow 0.4s ease",
        cursor: "default",
      }}
    >
      {/* Top row: code + priority */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
        <span
          className="mono dim"
          style={{ fontSize: 10.5, flexShrink: 0 }}
        >
          {task.code}
        </span>
        <Chip tone={PRIORITY_TONE[task.priority] ?? "default"}>
          {task.priority.toUpperCase()}
        </Chip>
      </div>

      {/* Title */}
      <span style={{ fontSize: 12.5, color: "var(--fg-2)", lineHeight: 1.4 }}>
        {task.title}
      </span>

      {/* Bottom row: module + points + assignee */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
        {moduleName && (
          <span
            className="mono"
            style={{ fontSize: 10.5, color: "var(--fg-4)", flexShrink: 0 }}
          >
            {moduleName}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {task.points > 0 && (
          <span
            className="mono dim"
            style={{ fontSize: 10.5 }}
          >
            {task.points}pt
          </span>
        )}
        {task.assignee_user_id && (
          <Avatar name={task.assignee_user_id} size="xs" />
        )}
      </div>
    </div>
  );
}
