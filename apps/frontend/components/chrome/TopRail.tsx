import React, { useEffect } from "react";
import {
  IconSearch,
  IconBell,
  IconSun,
  IconMoon,
  IconLayoutSidebar,
  IconGitBranch,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { useThemeStore } from "../../stores/theme-store";
import { useSidebarStore } from "../../stores/sidebar-store";

interface TopRailProps {
  viewLabel: string;
  projectName?: string;
  agentStatus?: "online" | "offline" | "reconnecting";
  currentIteration?: string;
  branch?: string;
}

export function TopRail({
  viewLabel,
  projectName,
  agentStatus = "offline",
  currentIteration,
  branch,
}: TopRailProps) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed);

  // Cmd+K listener (hint only — actual handler wired externally)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // Dispatch a custom event so consumers can open a command palette
        window.dispatchEvent(new CustomEvent("haren:cmd-k"));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 48,
        padding: "0 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        flexShrink: 0,
      }}
    >
      {/* Brand mark */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontWeight: 700,
          fontSize: 15,
          color: "var(--text-primary)",
          marginRight: 4,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 6,
            background: "var(--accent)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          H
        </span>
        Haren
      </div>

      {/* Breadcrumbs */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 13,
          color: "var(--text-muted)",
        }}
      >
        {projectName && (
          <>
            <span>/</span>
            <span style={{ color: "var(--text-secondary)" }}>{projectName}</span>
          </>
        )}
        <span>/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{viewLabel}</span>
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Status pills */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* Agent status */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 600,
            background:
              agentStatus === "online"
                ? "rgba(34,197,94,0.15)"
                : agentStatus === "reconnecting"
                  ? "rgba(234,179,8,0.15)"
                  : "rgba(100,116,139,0.15)",
            color:
              agentStatus === "online"
                ? "var(--success)"
                : agentStatus === "reconnecting"
                  ? "var(--warning)"
                  : "var(--text-muted)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background:
                agentStatus === "online"
                  ? "var(--success)"
                  : agentStatus === "reconnecting"
                    ? "var(--warning)"
                    : "var(--text-muted)",
              display: "inline-block",
            }}
          />
          {agentStatus === "online" ? "Agent online" : agentStatus === "reconnecting" ? "Reconnecting" : "Agent offline"}
        </span>

        {/* Current iteration */}
        {currentIteration && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 600,
              background: "rgba(99,102,241,0.15)",
              color: "#818cf8",
            }}
          >
            <IconPlayerPlay size={10} />
            {currentIteration}
          </span>
        )}

        {/* Branch */}
        {branch && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 600,
              background: "rgba(100,116,139,0.12)",
              color: "var(--text-secondary)",
            }}
          >
            <IconGitBranch size={10} />
            {branch}
          </span>
        )}
      </div>

      {/* Icon buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 4 }}>
        {/* Search with Cmd+K hint */}
        <button
          type="button"
          title="Search (Cmd+K)"
          onClick={() => window.dispatchEvent(new CustomEvent("haren:cmd-k"))}
          style={iconButtonStyle}
        >
          <IconSearch size={16} />
          <kbd
            style={{
              fontSize: 10,
              padding: "1px 4px",
              borderRadius: 4,
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              background: "transparent",
              fontFamily: "inherit",
              lineHeight: 1.4,
            }}
          >
            ⌘K
          </kbd>
        </button>

        <button type="button" title="Notifications" style={iconButtonStyle}>
          <IconBell size={16} />
        </button>

        {/* Theme toggle */}
        <button
          type="button"
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          style={iconButtonStyle}
        >
          {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
        </button>

        {/* Sidebar toggle */}
        <button
          type="button"
          title="Toggle sidebar (Cmd+B)"
          onClick={toggleCollapsed}
          style={iconButtonStyle}
        >
          <IconLayoutSidebar size={16} />
        </button>
      </div>
    </header>
  );
}

const iconButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 6px",
  borderRadius: 6,
  border: "none",
  background: "transparent",
  color: "var(--text-secondary)",
  cursor: "pointer",
  transition: "background 0.1s, color 0.1s",
};
