import React from "react";

interface BurnupProps {
  scope: number;
  velocity: number;
  daysElapsed?: number;
  totalDays?: number;
}

const W = 480;
const H = 200;
const PAD = { top: 16, right: 24, bottom: 36, left: 44 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

function px(day: number, totalDays: number): number {
  return PAD.left + (day / totalDays) * INNER_W;
}

function py(tasks: number, scope: number): number {
  return PAD.top + INNER_H - (tasks / scope) * INNER_H;
}

export function Burnup({ scope, velocity, daysElapsed = 0, totalDays = 14 }: BurnupProps) {
  const safeTotalDays = Math.max(totalDays, 1);
  const safeScope = Math.max(scope, 1);

  // Grid line values at 0 / 25 / 50 / 75 / 100 % of scope
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * safeScope));

  // Ideal line: straight from (0, 0) to (totalDays, scope)
  const idealPoints = `${px(0, safeTotalDays)},${py(0, safeScope)} ${px(safeTotalDays, safeTotalDays)},${py(safeScope, safeScope)}`;

  // Actual line: from day 0 up to daysElapsed at velocity tasks/day
  const actualDays = Math.min(daysElapsed, safeTotalDays);
  const actualDone = Math.min(velocity * actualDays, safeScope);
  const actualPoints = `${px(0, safeTotalDays)},${py(0, safeScope)} ${px(actualDays, safeTotalDays)},${py(actualDone, safeScope)}`;

  // Forecast (carryover) line: from actualDone at daysElapsed to projected finish
  const forecastPoints =
    velocity > 0
      ? `${px(actualDays, safeTotalDays)},${py(actualDone, safeScope)} ${px(Math.min((safeScope - actualDone) / velocity + actualDays, safeTotalDays * 1.5), safeTotalDays)},${py(safeScope, safeScope)}`
      : null;

  const shipped = Math.round(actualDone);
  const carryover = safeScope - shipped;

  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <div className="panel-h">
        <span className="ttl">Burnup</span>
        <span className="meta">
          scope {safeScope} · velocity {velocity}/day
        </span>
      </div>
      <div style={{ padding: "var(--s-5)" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ maxWidth: W, display: "block" }}
          aria-label="Burnup chart"
        >
          {/* Grid lines */}
          {gridLines.map((v) => {
            const y = py(v, safeScope);
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

          {/* Day axis ticks */}
          {[0, Math.round(safeTotalDays / 2), safeTotalDays].map((d) => (
            <text
              key={d}
              x={px(d, safeTotalDays)}
              y={H - PAD.bottom + 14}
              textAnchor="middle"
              fontSize={9}
              fill="var(--fg-4)"
              fontFamily="var(--font-mono)"
            >
              d{d}
            </text>
          ))}

          {/* Ideal line */}
          <polyline
            fill="none"
            stroke="var(--accent-1)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            points={idealPoints}
          />

          {/* Forecast carryover line */}
          {forecastPoints && (
            <polyline
              fill="none"
              stroke="var(--accent-2)"
              strokeWidth={1}
              strokeDasharray="2 2"
              points={forecastPoints}
            />
          )}

          {/* Actual line (on top) */}
          <polyline
            fill="none"
            stroke="var(--accent-3)"
            strokeWidth={2}
            points={actualPoints}
          />

          {/* Current position dot */}
          <circle
            cx={px(actualDays, safeTotalDays)}
            cy={py(actualDone, safeScope)}
            r={3}
            fill="var(--accent-3)"
          />
        </svg>

        {/* Legend */}
        <div className="row" style={{ gap: 16, marginTop: 8, flexWrap: "wrap" }}>
          <LegendItem color="var(--accent-3)" label={`Shipped (${shipped})`} dashed={false} />
          <LegendItem color="var(--accent-1)" label="Ideal" dashed />
          <LegendItem
            color="var(--accent-2)"
            label={`Forecast carryover (${carryover > 0 ? carryover : 0})`}
            dashed
          />
        </div>
      </div>
    </div>
  );
}

function LegendItem({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed: boolean;
}) {
  return (
    <div className="row" style={{ gap: 5 }}>
      <svg width={22} height={10}>
        <line
          x1={0}
          y1={5}
          x2={22}
          y2={5}
          stroke={color}
          strokeWidth={dashed ? 1.5 : 2}
          strokeDasharray={dashed ? "4 3" : undefined}
        />
      </svg>
      <span className="mono muted" style={{ fontSize: 10.5 }}>
        {label}
      </span>
    </div>
  );
}
