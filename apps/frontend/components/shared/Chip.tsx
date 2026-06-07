import type { ReactNode, HTMLAttributes } from "react";

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "ok" | "warn" | "bad" | "info" | "ai" | "default";
  children: ReactNode;
}

export function Chip({ tone, children, ...rest }: ChipProps) {
  return (
    <span className="chip" data-tone={tone} {...rest}>
      {children}
    </span>
  );
}
