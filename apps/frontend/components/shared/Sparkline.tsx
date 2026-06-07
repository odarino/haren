interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  tone?: "ok" | "warn" | "info" | "ai";
}

const TONE_COLORS = {
  ok: "var(--accent-3)",
  warn: "var(--accent-2)",
  info: "var(--accent-1)",
  ai: "var(--accent-4)",
};

export function Sparkline({ data, width = 80, height = 22, tone = "info" }: SparklineProps) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data
    .map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`)
    .join(" ");
  return (
    <svg width={width} height={height}>
      <polyline fill="none" stroke={TONE_COLORS[tone]} strokeWidth="1.4" points={pts} />
    </svg>
  );
}
