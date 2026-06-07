import React from "react";
import { Avatar } from "../../shared/Avatar";
import { Chip } from "../../shared/Chip";
import { Bar } from "../../shared/Bar";
import { Sparkline } from "../../shared/Sparkline";

interface ModuleCardProps {
  id: string;
  code: string;
  name: string;
  status: string;
  totalTasks: number;
  doneTasks: number;
  blockers: number;
  progress: number;
  eta: string | null;
  owner_user_id: string | null;
  tags: string[];
}

type ChipTone = "ok" | "warn" | "bad" | "info" | "ai" | "default";

const STATUS_TONE: Record<string, ChipTone> = {
  active: "ok",
  planned: "info",
  blocked: "bad",
  completed: "ok",
  paused: "warn",
  archived: "default",
};

/** Deterministic pseudo-random sparkline from a string seed */
function seededSparkline(seed: string, length = 8): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  const data: number[] = [];
  let cur = Math.abs(h % 40) + 20;
  for (let i = 0; i < length; i++) {
    h = (Math.imul(1664525, h) + 1013904223) | 0;
    cur = Math.max(0, Math.min(100, cur + ((h & 0xff) - 128) / 10));
    data.push(cur);
  }
  return data;
}

export function ModuleCard({
  code,
  name,
  status,
  totalTasks,
  doneTasks,
  blockers,
  progress,
  eta,
  owner_user_id,
  tags,
}: ModuleCardProps) {
  const sparkData = seededSparkline(code);
  const tone = STATUS_TONE[status] ?? "default";
  const barTone = blockers > 0 ? "bad" : progress >= 80 ? "ok" : "info";

  // Derive owner initials and hue from owner_user_id for deterministic avatar
  const ownerName = owner_user_id ? owner_user_id.slice(0, 8) : null;
  let ownerHue = 200;
  if (owner_user_id) {
    let h = 0;
    for (let i = 0; i < owner_user_id.length; i++) {
      h = (Math.imul(31, h) + owner_user_id.charCodeAt(i)) | 0;
    }
    ownerHue = Math.abs(h % 360);
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Header */}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--fg-4)", marginBottom: 2 }}>
            {code}
          </div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
        </div>
        <Chip tone={tone}>{status}</Chip>
      </div>

      {/* Progress bar + sparkline */}
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <Bar value={progress} tone={barTone} />
          <div
            className="mono"
            style={{ fontSize: 10.5, color: "var(--fg-4)", marginTop: 3 }}
          >
            {doneTasks}/{totalTasks} tasks &nbsp;·&nbsp; {Math.round(progress)}%
          </div>
        </div>
        <Sparkline data={sparkData} tone={barTone === "ok" ? "ok" : barTone === "bad" ? "warn" : "info"} />
      </div>

      {/* Footer row: owner avatar, blockers chip, eta */}
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <div className="row" style={{ gap: 6 }}>
          {ownerName && <Avatar name={ownerName} hue={ownerHue} size="xs" />}
          {blockers > 0 && (
            <Chip tone="bad">
              {blockers} blocker{blockers !== 1 ? "s" : ""}
            </Chip>
          )}
          {tags.slice(0, 2).map((tag) => (
            <Chip key={tag} tone="default">
              {tag}
            </Chip>
          ))}
        </div>
        {eta && (
          <span className="mono muted" style={{ fontSize: 10.5 }}>
            ETA {eta}
          </span>
        )}
      </div>
    </div>
  );
}
