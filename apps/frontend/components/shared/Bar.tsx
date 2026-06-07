interface BarProps {
  value: number;
  tone?: "ok" | "warn" | "bad" | "info";
}

export function Bar({ value, tone }: BarProps) {
  return (
    <div className="bar" data-tone={tone}>
      <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
