import React from "react";
import type { BurnupSnapshot, Iteration } from "../../../hooks/use-iterations";

interface IterBurnupProps {
  burnup: BurnupSnapshot[];
  iteration: Pick<Iteration, "scope" | "start_date" | "end_date">;
}

const W = 480;
const H = 200;
const PAD = { top: 16, right: 24, bottom: 36, left: 44 };
const IW = W - PAD.left - PAD.right;
const IH = H - PAD.top - PAD.bottom;

export function IterBurnup({ burnup, iteration }: IterBurnupProps) {
  const scope = Math.max(iteration.scope, 1);
  const startMs = new Date(iteration.start_date).getTime();
  const endMs = new Date(iteration.end_date).getTime();
  const spanMs = Math.max(endMs - startMs, 1);

  function xFor(dateStr: string): number {
    const t = new Date(dateStr).getTime();
    return PAD.left + ((t - startMs) / spanMs) * IW;
  }

  function yFor(points: number): number {
    return PAD.top + IH - (points / scope) * IH;
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * scope));

  // Date ticks: start, mid, end
  const midDate = new Date((startMs + endMs) / 2).toISOString().slice(0, 10);
  const startDate = iteration.start_date.slice(0, 10);
  const endDate = iteration.end_date.slice(0, 10);

  const scopeX1 = PAD.left;
  const scopeX2 = PAD.left + IW;
  const scopeY = yFor(scope);

  const hasData = burnup.length > 0;
  const actualPoints =
    hasData
      ? burnup
          .map((s) => `${xFor(s.snapshot_date)},${yFor(s.points_done)}`)
          .join(" ")
      : null;

  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <div className="panel-h">
        <span className="ttl">Burnup</span>
        <span className="meta">scope {scope} pts</span>
      </div>
      <div style={{ padding: "var(--s-5)" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ maxWidth: W, display: "block" }}
          aria-label="Iteration burnup chart"
        >
          {/* Grid lines */}
          {gridLines.map((v) => {
            const y = yFor(v);
            return (
              <g key={v}>
                <line
                  x1={PAD.left}
                  y1={y}
                  x2={W - PAD.right}
                  y2={y}
                  stroke="var(--line)"
                  strokeWidth={0.5}
                />
                <text
                  x={PAD.left - 6}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize={9}
                  fill="var(--fg-4)"
                  fontFamily="var(--font-mono)"
                >
                  {v}
                </text>
              </g>
            );
          })}

          {/* Date ticks */}
          {[
            { d: startDate, x: PAD.left },
            { d: midDate, x: PAD.left + IW / 2 },
            { d: endDate, x: PAD.left + IW },
          ].map(({ d, x }) => (
            <text
              key={d}
              x={x}
              y={H - PAD.bottom + 14}
              textAnchor="middle"
              fontSize={9}
              fill="var(--fg-4)"
              fontFamily="var(--font-mono)"
            >
              {d.slice(5)}
            </text>
          ))}

          {/* Scope line (dashed) */}
          <line
            x1={scopeX1}
            y1={scopeY}
            x2={scopeX2}
            y2={scopeY}
            stroke="var(--fg-3)"
            strokeWidth={1}
            strokeDasharray="6 3"
          />
          <text
            x={scopeX2 + 4}
            y={scopeY + 4}
            fontSize={9}
            fill="var(--fg-3)"
            fontFamily="var(--font-mono)"
          >
            target
          </text>

          {/* Actual line */}
          {actualPoints && (
            <polyline
              points={actualPoints}
              fill="none"
              stroke="var(--accent-3)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Dots */}
          {hasData &&
            burnup.map((s) => (
              <circle
                key={s.snapshot_date}
                cx={xFor(s.snapshot_date)}
                cy={yFor(s.points_done)}
                r={3}
                fill="var(--accent-3)"
              />
            ))}

          {!hasData && (
            <text
              x={W / 2}
              y={H / 2}
              textAnchor="middle"
              fontSize={11}
              fill="var(--fg-4)"
              fontFamily="var(--font-sans)"
            >
              No snapshots yet
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}
