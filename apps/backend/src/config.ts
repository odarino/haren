export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || "postgres://localhost:5432/haren",
  cors: { origin: process.env.CORS_ORIGIN || "*" },
  agent: {
    staleTimeoutMs: Number(process.env.AGENT_STALE_TIMEOUT_MS || 90_000),
    sweepIntervalMs: Number(process.env.AGENT_SWEEP_INTERVAL_MS || 30_000),
  },
} as const;
