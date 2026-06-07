import React, { useMemo } from "react";
import type { ActivityEvent } from "../../../hooks/use-activity";
import { Avatar } from "../../shared/Avatar";

interface HeatmapProps {
  events: ActivityEvent[];
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getLast14Days(): Date[] {
  const days: Date[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function hashHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash) % 360;
}

export function Heatmap({ events }: HeatmapProps) {
  const days = useMemo(() => getLast14Days(), []);

  // Collect unique actors (by actor_user_id or "agent" label)
  const actorMap = useMemo(() => {
    const map = new Map<string, string>(); // key -> label
    for (const ev of events) {
      const key = ev.actor_user_id ?? `agent:${ev.ref}`;
      if (!map.has(key)) {
        map.set(key, ev.actor_type === "agent" ? "Agent" : ev.actor_user_id ?? "Unknown");
      }
    }
    return map;
  }, [events]);

  // Count events per (actor, day)
  const counts = useMemo(() => {
    const map = new Map<string, number>(); // `${actor}::${dateKey}` -> count
    for (const ev of events) {
      const actor = ev.actor_user_id ?? `agent:${ev.ref}`;
      const dateKey = toDateKey(new Date(ev.created_at));
      const k = `${actor}::${dateKey}`;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [events]);

  const maxCount = useMemo(() => {
    let max = 0;
    for (const v of counts.values()) {
      if (v > max) max = v;
    }
    return max || 1;
  }, [counts]);

  const actors = Array.from(actorMap.entries());

  if (actors.length === 0) {
    return null;
  }

  const cellSize = 28;
  const labelWidth = 120;

  return (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          display: "inline-flex",
          flexDirection: "column",
          gap: 2,
          minWidth: labelWidth + days.length * (cellSize + 2),
        }}
      >
        {/* Date header row */}
        <div style={{ display: "flex", gap: 2, paddingLeft: labelWidth }}>
          {days.map((d) => (
            <div
              key={toDateKey(d)}
              style={{
                width: cellSize,
                fontSize: 9,
                color: "var(--text-muted)",
                textAlign: "center",
                transform: "rotate(-45deg)",
                transformOrigin: "bottom left",
                whiteSpace: "nowrap",
                height: 32,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
              }}
            >
              {formatDateLabel(d)}
            </div>
          ))}
        </div>

        {/* Actor rows */}
        {actors.map(([actorKey, label]) => {
          const hue = hashHue(actorKey);
          return (
            <div
              key={actorKey}
              style={{ display: "flex", alignItems: "center", gap: 2 }}
            >
              {/* Actor label */}
              <div
                style={{
                  width: labelWidth,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  paddingRight: 8,
                  flexShrink: 0,
                }}
              >
                <Avatar name={label} hue={hue} size="xs" />
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label.length > 10 ? label.slice(0, 8) + "…" : label}
                </span>
              </div>

              {/* Day cells */}
              {days.map((d) => {
                const dateKey = toDateKey(d);
                const count = counts.get(`${actorKey}::${dateKey}`) ?? 0;
                const intensity = count === 0 ? 0 : 0.15 + 0.85 * (count / maxCount);
                return (
                  <div
                    key={dateKey}
                    title={count > 0 ? `${count} event${count !== 1 ? "s" : ""} on ${formatDateLabel(d)}` : undefined}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      borderRadius: 4,
                      background:
                        count === 0
                          ? "var(--bg-secondary)"
                          : `hsla(var(--accent-1-hue, 210) 70% 50% / ${intensity})`,
                      border: "1px solid var(--border)",
                      flexShrink: 0,
                      cursor: count > 0 ? "default" : undefined,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      color: count > 0 ? "var(--text-primary)" : "transparent",
                    }}
                  >
                    {count > 0 ? count : ""}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
