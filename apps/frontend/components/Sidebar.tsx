import React from "react";

const VIEWS = [
  { id: "progress", label: "Progress" },
  { id: "artifacts", label: "Artifacts" },
  { id: "activity", label: "Activity" },
  { id: "tasks", label: "Tasks" },
  { id: "iterations", label: "Iterations" },
  { id: "agent", label: "Agent" },
] as const;

export type ViewId = (typeof VIEWS)[number]["id"];

interface SidebarProps {
  projects: { id: string; name: string }[];
  activeProjectId: string | null;
  activeView: ViewId;
  onSelectProject: (id: string) => void;
  onSelectView: (view: ViewId) => void;
}

export function Sidebar({
  projects,
  activeProjectId,
  activeView,
  onSelectProject,
  onSelectView,
}: SidebarProps) {
  return (
    <aside
      style={{
        width: 220,
        borderRight: "1px solid var(--border)",
        padding: 16,
        background: "var(--bg-secondary)",
        fontSize: 13,
        overflowY: "auto",
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: 11,
            textTransform: "uppercase",
            marginBottom: 8,
            letterSpacing: 0.5,
          }}
        >
          Projects
        </div>
        {projects.map((p) => (
          <div
            key={p.id}
            onClick={() => onSelectProject(p.id)}
            style={{
              padding: "6px 8px",
              borderRadius: 6,
              cursor: "pointer",
              marginBottom: 2,
              background: p.id === activeProjectId ? "var(--bg-tertiary)" : "transparent",
              color: p.id === activeProjectId ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            {p.name}
          </div>
        ))}
        {projects.length === 0 && (
          <div
            style={{
              color: "var(--text-muted)",
              fontStyle: "italic",
            }}
          >
            No projects yet
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: "1px solid var(--border)",
          paddingTop: 16,
        }}
      >
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: 11,
            textTransform: "uppercase",
            marginBottom: 8,
            letterSpacing: 0.5,
          }}
        >
          Views
        </div>
        {VIEWS.map((v) => (
          <div
            key={v.id}
            onClick={() => onSelectView(v.id)}
            style={{
              padding: "6px 8px",
              borderRadius: 6,
              cursor: "pointer",
              marginBottom: 2,
              background: v.id === activeView ? "var(--bg-tertiary)" : "transparent",
              color: v.id === activeView ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            {v.label}
          </div>
        ))}
      </div>
    </aside>
  );
}
