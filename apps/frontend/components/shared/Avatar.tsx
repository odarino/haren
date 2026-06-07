interface AvatarProps {
  name: string;
  hue?: number;
  size?: "xs" | "sm" | "md";
}

const SIZES = { xs: 18, sm: 20, md: 24 };

export function Avatar({ name, hue = 200, size = "sm" }: AvatarProps) {
  const dim = SIZES[size];
  const initials = name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  return (
    <span
      title={name}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: dim,
        height: dim,
        borderRadius: "50%",
        background: `linear-gradient(135deg, hsl(${hue} 65% 48%), hsl(${(hue + 30) % 360} 70% 38%))`,
        color: "#fff",
        fontSize: dim * 0.42,
        fontWeight: 600,
        fontFamily: "var(--font-mono)",
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}
