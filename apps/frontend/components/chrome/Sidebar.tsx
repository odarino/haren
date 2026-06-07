import React, { useEffect } from "react";
import {
  IconChartBar,
  IconRepeat,
  IconChecklist,
  IconFiles,
  IconActivity,
  IconRobot,
  IconPin,
  IconUser,
} from "@tabler/icons-react";
import { useSidebarStore } from "../../stores/sidebar-store";

const VIEWS = [
  { id: "progress", label: "Progress", icon: IconChartBar },
  { id: "iterations", label: "Iterations", icon: IconRepeat },
  { id: "tasks", label: "Tasks", icon: IconChecklist },
  { id: "artifacts", label: "Artifacts", icon: IconFiles },
  { id: "activity", label: "Activity", icon: IconActivity },
  { id: "agent", label: "Agent", icon: IconRobot },
] as const;

export type ChromeViewId = (typeof VIEWS)[number]["id"];

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  onNavigate: (view: string, target: string) => void;
  projectName?: string;
  badgeCounts?: Partial<Record<ChromeViewId, number>>;
}

export function ChromeSidebar({
  activeView,
  onViewChange,
  onNavigate,
  projectName,
  badgeCounts = {},
}: SidebarProps) {
  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed);
  const pinnedItems = useSidebarStore((s) => s.pinnedItems);

  // Cmd+B shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleCollapsed]);

  const width = collapsed ? 48 : 220;

  return (
    <aside
      data-collapsed={collapsed}
      style={{
        width,
        minWidth: width,
        borderRight: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "width 0.15s ease, min-width 0.15s ease",
        flexShrink: 0,
      }}
    >
      {/* Workspace section */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
        {!collapsed && (
          <div style={sectionHeaderStyle}>workspace</div>
        )}

        {VIEWS.map((v) => {
          const Icon = v.icon;
          const isActive = v.id === activeView;
          const badge = badgeCounts[v.id];
          return (
            <button
              key={v.id}
              type="button"
              title={collapsed ? v.label : undefined}
              onClick={() => onViewChange(v.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: collapsed ? 0 : 8,
                width: "100%",
                padding: collapsed ? "8px 14px" : "7px 12px",
                border: "none",
                borderRadius: 0,
                background: isActive ? "var(--bg-tertiary)" : "transparent",
                color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                cursor: "pointer",
                fontSize: 13,
                textAlign: "left",
                fontWeight: isActive ? 600 : 400,
                transition: "background 0.1s, color 0.1s",
                justifyContent: collapsed ? "center" : "flex-start",
              }}
            >
              <Icon size={16} style={{ flexShrink: 0 }} />
              {!collapsed && (
                <>
                  <span style={{ flex: 1 }}>{v.label}</span>
                  {badge !== undefined && badge > 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 8,
                        background: isActive ? "var(--accent)" : "var(--bg-tertiary)",
                        color: isActive ? "#fff" : "var(--text-muted)",
                        minWidth: 16,
                        textAlign: "center",
                      }}
                    >
                      {badge}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}

        {/* Pinned section */}
        {pinnedItems.length > 0 && (
          <>
            {!collapsed && (
              <div style={{ ...sectionHeaderStyle, marginTop: 16 }}>pinned</div>
            )}
            {pinnedItems.map((item) => (
              <button
                key={`${item.view}:${item.target}`}
                type="button"
                title={collapsed ? item.label : undefined}
                onClick={() => onNavigate(item.view, item.target)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: collapsed ? 0 : 8,
                  width: "100%",
                  padding: collapsed ? "8px 14px" : "7px 12px",
                  border: "none",
                  borderRadius: 0,
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 12,
                  textAlign: "left",
                  transition: "color 0.1s",
                  justifyContent: collapsed ? "center" : "flex-start",
                }}
              >
                <IconPin size={14} style={{ flexShrink: 0 }} />
                {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
              </button>
            ))}
          </>
        )}
      </div>

      {/* User avatar footer */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: collapsed ? "10px 14px" : "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: collapsed ? 0 : 8,
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--bg-tertiary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: "var(--text-muted)",
          }}
        >
          <IconUser size={14} />
        </div>
        {!collapsed && projectName && (
          <span
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {projectName}
          </span>
        )}
      </div>
    </aside>
  );
}

const sectionHeaderStyle: React.CSSProperties = {
  padding: "0 12px",
  marginBottom: 4,
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.8,
  color: "var(--text-muted)",
};
