interface EmptyStateProps {
  children: React.ReactNode;
}

export function EmptyState({ children }: EmptyStateProps) {
  return (
    <div
      style={{
        padding: "var(--s-8)",
        color: "var(--fg-4)",
        textAlign: "center",
        fontFamily: "var(--font-mono)",
        fontSize: 11.5,
      }}
    >
      {children}
    </div>
  );
}
