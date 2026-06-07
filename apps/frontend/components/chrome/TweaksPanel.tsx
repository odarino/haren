import React, { useState, useRef, useEffect } from "react";
import { IconAdjustments, IconX } from "@tabler/icons-react";
import { useThemeStore } from "../../stores/theme-store";
import { useSidebarStore } from "../../stores/sidebar-store";

type ThemeValue = "light" | "dark";
type DensityValue = "compact" | "comfy";

const ACCENT_ROWS: string[][] = [
  ["blue", "violet", "emerald", "rose"],
  ["amber", "cyan", "indigo", "fuchsia"],
];

const ACCENT_HEX: Record<string, string> = {
  blue: "#3b82f6",
  violet: "#8b5cf6",
  emerald: "#10b981",
  rose: "#f43f5e",
  amber: "#f59e0b",
  cyan: "#06b6d4",
  indigo: "#6366f1",
  fuchsia: "#d946ef",
};

interface TweaksPanelProps {
  userId?: string;
  onUpdatePreferences?: (patch: {
    theme?: ThemeValue;
    accent?: string;
    density?: DensityValue;
    sidebar_collapsed?: boolean;
  }) => void;
}

export function TweaksPanel({ onUpdatePreferences }: TweaksPanelProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const theme = useThemeStore((s) => s.theme);
  const accent = useThemeStore((s) => s.accent);
  const density = useThemeStore((s) => s.density);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setAccent = useThemeStore((s) => s.setAccent);
  const setDensity = useThemeStore((s) => s.setDensity);

  const collapsed = useSidebarStore((s) => s.collapsed);
  const setCollapsed = useSidebarStore((s) => s.setCollapsed);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleTheme = (t: ThemeValue) => {
    setTheme(t);
    onUpdatePreferences?.({ theme: t });
  };

  const handleAccent = (a: string) => {
    setAccent(a);
    onUpdatePreferences?.({ accent: a });
  };

  const handleDensity = (d: DensityValue) => {
    setDensity(d);
    onUpdatePreferences?.({ density: d });
  };

  const handleSidebarDefault = (v: boolean) => {
    setCollapsed(v);
    onUpdatePreferences?.({ sidebar_collapsed: v });
  };

  return (
    <div ref={panelRef} style={{ position: "relative", display: "inline-block" }}>
      {/* Trigger button */}
      <button
        type="button"
        title="Tweaks"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "5px 10px",
          borderRadius: 7,
          border: "1px solid var(--border)",
          background: open ? "var(--bg-tertiary)" : "transparent",
          color: "var(--text-secondary)",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 500,
          transition: "background 0.1s",
        }}
      >
        <IconAdjustments size={15} />
        Tweaks
      </button>

      {/* Floating panel */}
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 260,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            zIndex: 9999,
            overflow: "hidden",
          }}
        >
          {/* Panel header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Appearance
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: 2,
                display: "flex",
              }}
            >
              <IconX size={14} />
            </button>
          </div>

          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Theme radio */}
            <div>
              <div style={labelStyle}>Theme</div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                {(["light", "dark"] as ThemeValue[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTheme(t)}
                    style={{
                      flex: 1,
                      padding: "5px 0",
                      borderRadius: 6,
                      border: `1.5px solid ${theme === t ? "var(--accent)" : "var(--border)"}`,
                      background: theme === t ? "rgba(59,130,246,0.12)" : "var(--bg-tertiary)",
                      color: theme === t ? "var(--accent)" : "var(--text-secondary)",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: theme === t ? 600 : 400,
                      transition: "all 0.1s",
                      textTransform: "capitalize",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Accent palette */}
            <div>
              <div style={labelStyle}>Accent</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                {ACCENT_ROWS.map((row, ri) => (
                  <div key={ri} style={{ display: "flex", gap: 4 }}>
                    {row.map((a) => (
                      <button
                        key={a}
                        type="button"
                        title={a}
                        onClick={() => handleAccent(a)}
                        style={{
                          flex: 1,
                          height: 28,
                          borderRadius: 6,
                          border: `2px solid ${accent === a ? "#fff" : "transparent"}`,
                          background: ACCENT_HEX[a] ?? a,
                          cursor: "pointer",
                          outline: accent === a ? `2px solid ${ACCENT_HEX[a]}` : "none",
                          outlineOffset: 1,
                          transition: "outline 0.1s, border 0.1s",
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Density radio */}
            <div>
              <div style={labelStyle}>Density</div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                {(["compact", "comfy"] as DensityValue[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleDensity(d)}
                    style={{
                      flex: 1,
                      padding: "5px 0",
                      borderRadius: 6,
                      border: `1.5px solid ${density === d ? "var(--accent)" : "var(--border)"}`,
                      background: density === d ? "rgba(59,130,246,0.12)" : "var(--bg-tertiary)",
                      color: density === d ? "var(--accent)" : "var(--text-secondary)",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: density === d ? 600 : 400,
                      transition: "all 0.1s",
                      textTransform: "capitalize",
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Sidebar default toggle */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Sidebar collapsed by default
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={collapsed}
                onClick={() => handleSidebarDefault(!collapsed)}
                style={{
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  border: "none",
                  background: collapsed ? "var(--accent)" : "var(--bg-tertiary)",
                  cursor: "pointer",
                  position: "relative",
                  transition: "background 0.2s",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: collapsed ? 18 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  color: "var(--text-muted)",
};
