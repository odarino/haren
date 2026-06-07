import { Bar } from "./Bar";

interface KPIProps {
  label: string;
  value: string | number;
  sub: string;
  tone: "ok" | "warn" | "bad" | "info";
  bar?: number;
}

const TONE_STATUS: Record<string, string> = {
  ok: "on-track",
  warn: "at-risk",
  bad: "blocked",
  info: "doing",
};

export function KPI({ label, value, sub, tone, bar }: KPIProps) {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span
          className="mono"
          style={{
            fontSize: 10.5,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: "var(--fg-4)",
          }}
        >
          {label}
        </span>
        <span className="dot" data-s={TONE_STATUS[tone]} />
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 600,
          marginTop: 4,
          letterSpacing: "-.01em",
          fontVariantNumeric: "tabular-nums",
          fontFamily: "var(--font-mono)",
        }}
      >
        {value}
      </div>
      <div className="muted mono" style={{ fontSize: 11, marginTop: 4 }}>
        {sub}
      </div>
      {bar !== undefined && (
        <div style={{ marginTop: 10 }}>
          <Bar value={bar} tone={tone} />
        </div>
      )}
    </div>
  );
}
