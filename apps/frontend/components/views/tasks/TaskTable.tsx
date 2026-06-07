import React, { useEffect, useRef } from "react";
import { Avatar } from "../../shared/Avatar";
import { Chip } from "../../shared/Chip";
import type { Task } from "../../../hooks/use-tasks";

interface Module {
  id: string;
  code: string;
  name: string;
}

interface TaskTableProps {
  tasks: Task[];
  modules: Module[];
  highlightId?: string | null;
}

const STATUS_DOT: Record<string, string> = {
  backlog: "todo",
  planned: "todo",
  todo: "todo",
  doing: "doing",
  review: "review",
  blocked: "blocked",
  done: "ok",
  cancelled: "bad",
};

const STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog",
  planned: "Planned",
  todo: "To Do",
  doing: "Doing",
  review: "Review",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

const PRIORITY_TONE: Record<string, "bad" | "warn" | "info" | "default"> = {
  p0: "bad",
  p1: "bad",
  p2: "warn",
  p3: "info",
};

export function TaskTable({ tasks, modules, highlightId }: TaskTableProps) {
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    if (!highlightId || !tableRef.current) return;
    const row = tableRef.current.querySelector(`[data-task-id="${highlightId}"]`);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [highlightId]);

  const moduleMap = new Map(modules.map((m) => [m.id, m]));

  return (
    <table className="tbl" ref={tableRef}>
      <thead>
        <tr>
          <th style={{ width: 90 }}>ID</th>
          <th>Title</th>
          <th style={{ width: 130 }}>Module</th>
          <th style={{ width: 140 }}>Assignee</th>
          <th style={{ width: 110 }}>Status</th>
          <th style={{ width: 90 }}>Priority</th>
          <th style={{ width: 60 }} className="num">Pts</th>
          <th style={{ width: 110 }}>Created</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => {
          const mod = task.module_id ? moduleMap.get(task.module_id) : null;
          const isHighlight = task.id === highlightId;
          return (
            <tr
              key={task.id}
              data-task-id={task.id}
              style={{
                background: isHighlight
                  ? "color-mix(in srgb, var(--accent-1) 8%, transparent)"
                  : undefined,
                transition: "background 0.4s ease",
              }}
            >
              <td>
                <span className="mono dim" style={{ fontSize: 10.5 }}>
                  {task.code}
                </span>
              </td>
              <td style={{ color: "var(--fg)" }}>{task.title}</td>
              <td>
                {mod ? (
                  <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
                    {mod.code}
                  </span>
                ) : (
                  <span style={{ color: "var(--fg-4)" }}>—</span>
                )}
              </td>
              <td>
                {task.assignee_user_id ? (
                  <span style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                    <Avatar name={task.assignee_user_id} size="xs" />
                    <span style={{ fontSize: 12, color: "var(--fg-3)" }}>
                      {task.assignee_user_id}
                    </span>
                  </span>
                ) : (
                  <span style={{ color: "var(--fg-4)" }}>—</span>
                )}
              </td>
              <td>
                <span style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                  <i
                    className="dot"
                    data-s={STATUS_DOT[task.status] ?? "todo"}
                  />
                  <span style={{ fontSize: 12, color: "var(--fg-3)" }}>
                    {STATUS_LABEL[task.status] ?? task.status}
                  </span>
                </span>
              </td>
              <td>
                <Chip tone={PRIORITY_TONE[task.priority] ?? "default"}>
                  {task.priority.toUpperCase()}
                </Chip>
              </td>
              <td className="num" style={{ color: "var(--fg-3)" }}>
                {task.points}
              </td>
              <td style={{ color: "var(--fg-4)", fontSize: 12 }}>
                {new Date(task.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
