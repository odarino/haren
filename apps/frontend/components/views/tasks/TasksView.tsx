import React, { useState, useEffect, useRef } from "react";
import { IconPlus, IconFilter, IconLayoutKanban, IconTable } from "@tabler/icons-react";
import { EmptyState } from "../../shared/EmptyState";
import { useTasks } from "../../../hooks/use-tasks";
import { useModules } from "../../../hooks/use-modules";
import { TaskCard } from "./TaskCard";
import { TaskTable } from "./TaskTable";
import { QuickAddBar } from "./QuickAddBar";
import type { Task } from "../../../hooks/use-tasks";

interface TasksViewProps {
  projectId: string;
}

type Layout = "board" | "table";

const BOARD_COLUMNS: { status: Task["status"]; label: string }[] = [
  { status: "planned", label: "Planned" },
  { status: "doing", label: "Doing" },
  { status: "review", label: "Review" },
  { status: "blocked", label: "Blocked" },
];

const HIGHLIGHT_DURATION = 2400;

export function TasksView({ projectId }: TasksViewProps) {
  const [layout, setLayout] = useState<Layout>("board");
  const [moduleFilter, setModuleFilter] = useState<string>("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filters = moduleFilter ? { module: moduleFilter } : undefined;
  const { data: tasks = [], isLoading, error } = useTasks(projectId, filters);
  const { data: modules = [] } = useModules(projectId);

  // Build next task code
  const nextId = `T-${String((tasks.length ?? 0) + 1).padStart(3, "0")}`;

  const moduleMap = new Map(modules.map((m) => [m.id, m]));

  const handleCommit = (task: Task) => {
    setQuickOpen(false);
    setHighlightId(task.id);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightId(null), HIGHLIGHT_DURATION);
  };

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* View header */}
      <div className="view-head">
        <h1>Tasks</h1>
        <span className="mono dim" style={{ fontSize: 11 }}>
          {tasks.length} task{tasks.length !== 1 ? "s" : ""}
        </span>

        <div className="spacer" />

        {/* Module filter */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
          <IconFilter size={13} style={{ color: "var(--fg-4)" }} />
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            style={{
              background: "var(--bg-2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-md)",
              color: moduleFilter ? "var(--fg-2)" : "var(--fg-4)",
              fontSize: 12,
              padding: "2px var(--s-3)",
              height: 28,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            <option value="">All modules</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code}: {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Layout toggle */}
        <div
          style={{
            display: "flex",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            onClick={() => setLayout("board")}
            title="Board view"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--s-2)",
              padding: "0 var(--s-3)",
              height: 28,
              border: "none",
              borderRight: "1px solid var(--line)",
              background: layout === "board" ? "var(--bg-2)" : "transparent",
              color: layout === "board" ? "var(--fg)" : "var(--fg-4)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            <IconLayoutKanban size={13} />
            Board
          </button>
          <button
            type="button"
            onClick={() => setLayout("table")}
            title="Table view"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--s-2)",
              padding: "0 var(--s-3)",
              height: 28,
              border: "none",
              background: layout === "table" ? "var(--bg-2)" : "transparent",
              color: layout === "table" ? "var(--fg)" : "var(--fg-4)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            <IconTable size={13} />
            Table
          </button>
        </div>

        {/* New task */}
        <button
          type="button"
          className="btn"
          data-variant="primary"
          onClick={() => setQuickOpen((v) => !v)}
        >
          <IconPlus size={13} />
          New task
        </button>
      </div>

      {/* Quick add bar */}
      {quickOpen && (
        <div style={{ padding: "var(--s-4) var(--s-6)", borderBottom: "1px solid var(--line)" }}>
          <QuickAddBar
            projectId={projectId}
            onCommit={handleCommit}
            onCancel={() => setQuickOpen(false)}
            nextId={nextId}
          />
        </div>
      )}

      {/* Body */}
      <div className="view-body" style={{ flex: 1 }}>
        {isLoading && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 160,
            }}
          >
            <span className="mono muted" style={{ fontSize: 13 }}>
              Loading tasks…
            </span>
          </div>
        )}

        {error && !isLoading && (
          <EmptyState>Could not load tasks. Check that the backend is running.</EmptyState>
        )}

        {!isLoading && !error && tasks.length === 0 && (
          <EmptyState>
            No tasks yet. Click{" "}
            <strong style={{ color: "var(--fg-2)" }}>+ New task</strong> to add your first task.
          </EmptyState>
        )}

        {!isLoading && !error && tasks.length > 0 && layout === "table" && (
          <div className="panel" style={{ overflow: "auto" }}>
            <TaskTable tasks={tasks} modules={modules} highlightId={highlightId} />
          </div>
        )}

        {!isLoading && !error && layout === "board" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "var(--gap)",
              minHeight: 200,
            }}
          >
            {BOARD_COLUMNS.map((col) => {
              const colTasks = tasks
                .filter((t) => t.status === col.status)
                .sort((a, b) => {
                  // Highlighted task at top
                  if (a.id === highlightId) return -1;
                  if (b.id === highlightId) return 1;
                  return 0;
                });

              return (
                <div
                  key={col.status}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--s-3)",
                  }}
                >
                  {/* Column header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--s-3)",
                      paddingBottom: "var(--s-3)",
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    <i
                      className="dot"
                      data-s={col.status}
                    />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-2)" }}>
                      {col.label}
                    </span>
                    <span
                      className="mono dim"
                      style={{ fontSize: 10.5, marginLeft: "auto" }}
                    >
                      {colTasks.length}
                    </span>
                  </div>

                  {/* Cards */}
                  {colTasks.length === 0 ? (
                    <div
                      style={{
                        border: "1px dashed var(--line)",
                        borderRadius: "var(--r-md)",
                        padding: "var(--s-5)",
                        textAlign: "center",
                        color: "var(--fg-4)",
                        fontSize: 11.5,
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      empty
                    </div>
                  ) : (
                    colTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        moduleName={
                          task.module_id ? moduleMap.get(task.module_id)?.code : undefined
                        }
                        highlight={task.id === highlightId}
                      />
                    ))
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
