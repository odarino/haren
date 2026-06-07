import React from "react";
import type { Iteration } from "../../../hooks/use-iterations";

interface GanttProps {
  iterations: Iteration[];
  selected: string;
  onSelect: (id: string) => void;
}

const W = 600;
const ROW_H = 28;
const LABEL_W = 72;
const PAD_T = 24;
const PAD_B = 16;
const PAD_R = 16;
const BAR_H = 16;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function Gantt({ iterations, selected, onSelect }: GanttProps) {
  if (iterations.length === 0) {
    return (
      <div className="panel" style={{ padding: "var(--s-7)", textAlign: "center", color: "var(--fg-4)", fontSize: 13 }}>
        No iterations yet
      </div>
    );
  }

  const dates = iterations.flatMap((it) => [
    new Date(it.start_date).getTime(),
    new Date(it.end_date).getTime(),
  ]);
  const minT = Math.min(...dates);
  const maxT = Math.max(...dates);
  const spanMs = Math.max(maxT - minT, 1);
  const today = Date.now();

  const chartW = W - LABEL_W - PAD_R;
  const totalH = PAD_T + iterations.length * ROW_H + PAD_B;

  function xFor(ts: number): number {
    return LABEL_W + ((ts - minT) / spanMs) * chartW;
  }

  function fillForStatus(it: Iteration): number {
    if (it.status === "shipped") return 1;
    if (it.status === "planned") return 0;
    // active — proportional velocity/scope
    const scope = Math.max(it.scope, 1);
    return clamp(it.velocity / scope, 0, 1);
  }

  const todayX = xFor(today);
  const showToday = today >= minT && today <= maxT;

  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <div className="panel-h">
        <span className="ttl">Timeline</span>
        <span className="meta">{iterations.length} iterations</span>
      </div>
      <div style={{ padding: "var(--s-5)", overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${W} ${totalH}`}
          width="100%"
          style={{ maxWidth: W, display: "block", minWidth: 320 }}
          aria-label="Iteration Gantt chart"
        >
          {/* Column background */}
          <rect x={LABEL_W} y={0} width={chartW} height={totalH} fill="transparent" />

          {/* Today line */}
          {showToday && (
            <line
              x1={todayX}
              y1={PAD_T - 8}
              x2={todayX}
              y2={totalH - PAD_B + 4}
              stroke="var(--accent-2)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              opacity={0.8}
            />
          )}

          {iterations.map((it, i) => {
            const y = PAD_T + i * ROW_H;
            const barY = y + (ROW_H - BAR_H) / 2;
            const x0 = xFor(new Date(it.start_date).getTime());
            const x1 = xFor(new Date(it.end_date).getTime());
            const barW = Math.max(x1 - x0, 4);
            const fill = fillForStatus(it);
            const isSelected = it.id === selected;

            const statusColor =
              it.status === "shipped"
                ? "var(--accent-3)"
                : it.status === "active"
                  ? "var(--accent-1)"
                  : "var(--fg-4)";

            return (
              <g key={it.id} style={{ cursor: "pointer" }} onClick={() => onSelect(it.id)}>
                {/* Hover hit area */}
                <rect
                  x={0}
                  y={y}
                  width={W}
                  height={ROW_H}
                  fill={isSelected ? "color-mix(in srgb, var(--accent-1) 6%, transparent)" : "transparent"}
                />

                {/* Label */}
                <text
                  x={LABEL_W - 6}
                  y={barY + BAR_H / 2 + 4}
                  textAnchor="end"
                  fontSize={10}
                  fontFamily="var(--font-mono)"
                  fill={isSelected ? "var(--fg)" : "var(--fg-3)"}
                >
                  {it.code}
                </text>

                {/* Track */}
                <rect
                  x={x0}
                  y={barY}
                  width={barW}
                  height={BAR_H}
                  rx={3}
                  fill="var(--bg-2)"
                  stroke={isSelected ? "var(--accent-1)" : "var(--line)"}
                  strokeWidth={isSelected ? 1.5 : 1}
                />

                {/* Fill */}
                {fill > 0 && (
                  <rect
                    x={x0}
                    y={barY}
                    width={barW * fill}
                    height={BAR_H}
                    rx={3}
                    fill={statusColor}
                    opacity={0.7}
                  />
                )}
              </g>
            );
          })}

          {/* Today label */}
          {showToday && (
            <text
              x={todayX}
              y={PAD_T - 10}
              textAnchor="middle"
              fontSize={9}
              fontFamily="var(--font-mono)"
              fill="var(--accent-2)"
            >
              today
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}
