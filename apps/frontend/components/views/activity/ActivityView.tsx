import React, { useState } from "react";
import {
  IconGitCommit,
  IconGitMerge,
  IconMessage,
  IconEye,
  IconArrowsExchange,
  IconRobot,
  IconFilter,
} from "@tabler/icons-react";
import { useActivity } from "../../../hooks/use-activity";
import type { ActivityEvent } from "../../../hooks/use-activity";
import { Avatar } from "../../shared/Avatar";
import { EmptyState } from "../../shared/EmptyState";
import { Heatmap } from "./Heatmap";

type KindFilter =
  | "all"
  | "commit"
  | "comment"
  | "merge"
  | "review"
  | "status"
  | "agent";

const KIND_FILTERS: KindFilter[] = [
  "all",
  "commit",
  "comment",
  "merge",
  "review",
  "status",
  "agent",
];

function KindIcon({ kind }: { kind: string }) {
  const size = 15;
  switch (kind) {
    case "commit":
      return <IconGitCommit size={size} />;
    case "merge":
      return <IconGitMerge size={size} />;
    case "comment":
      return <IconMessage size={size} />;
    case "review":
      return <IconEye size={size} />;
    case "status":
      return <IconArrowsExchange size={size} />;
    case "agent":
      return <IconRobot size={size} />;
    default:
      return <IconGitCommit size={size} />;
  }
}

function kindColor(kind: string): string {
  switch (kind) {
    case "commit":
      return "#3b82f6";
    case "merge":
      return "#8b5cf6";
    case "comment":
      return "#10b981";
    case "review":
      return "#f59e0b";
    case "status":
      return "#6b7280";
    case "agent":
      return "#ec4899";
    default:
      return "var(--text-muted)";
  }
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function hashHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash) % 360;
}

function EventRow({ event }: { event: ActivityEvent }) {
  const actorLabel =
    event.actor_type === "agent"
      ? "Agent"
      : event.actor_user_id ?? "Unknown";
  const hue = hashHue(event.actor_user_id ?? event.ref);
  const color = kindColor(event.kind);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Kind icon */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: `${color}22`,
          color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <KindIcon kind={event.kind} />
      </div>

      {/* Avatar */}
      <div style={{ flexShrink: 0, marginTop: 4 }}>
        <Avatar name={actorLabel} hue={hue} size="xs" />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-primary)",
            lineHeight: 1.4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {event.message}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              color,
              fontWeight: 600,
              marginRight: 6,
            }}
          >
            {event.kind}
          </span>
          {actorLabel !== "Unknown" && (
            <>
              <span>{actorLabel}</span>
              <span style={{ margin: "0 4px" }}>&middot;</span>
            </>
          )}
          <span>{formatRelative(event.created_at)}</span>
          {event.ref && (
            <>
              <span style={{ margin: "0 4px" }}>&middot;</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>
                {event.ref.slice(0, 12)}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface ActivityViewProps {
  projectId: string;
}

export function ActivityView({ projectId }: ActivityViewProps) {
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");

  const filters =
    kindFilter === "all" ? { limit: 100, offset: 0 } : { kind: kindFilter, limit: 100, offset: 0 };

  const { data: events, isLoading } = useActivity(projectId, filters);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Project</span>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Activity
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {/* Filter chips */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <IconFilter size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          {KIND_FILTERS.map((k) => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              style={{
                padding: "3px 10px",
                borderRadius: 99,
                border: "1px solid",
                borderColor:
                  kindFilter === k ? "var(--accent-1, #3b82f6)" : "var(--border)",
                background:
                  kindFilter === k
                    ? "var(--accent-1, #3b82f6)"
                    : "var(--bg-secondary)",
                color:
                  kindFilter === k ? "#fff" : "var(--text-secondary)",
                fontSize: 11,
                fontWeight: kindFilter === k ? 600 : 400,
                cursor: "pointer",
                transition: "all 0.12s",
                textTransform: "capitalize",
              }}
            >
              {k}
            </button>
          ))}
        </div>

        {/* Loading */}
        {isLoading && (
          <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 14 }}>
            Loading activity...
          </div>
        )}

        {/* Empty */}
        {!isLoading && (!events || events.length === 0) && (
          <EmptyState message="No activity yet. Events will appear here as commits, merges, and agent actions occur." />
        )}

        {/* Event feed */}
        {!isLoading && events && events.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            {events.map((ev) => (
              <EventRow key={ev.id} event={ev} />
            ))}
          </div>
        )}

        {/* Heatmap section */}
        {!isLoading && events && events.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-muted)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              Actor Activity — Last 14 Days
            </div>
            <Heatmap events={events} />
          </div>
        )}
      </div>
    </div>
  );
}
