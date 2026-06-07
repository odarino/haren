import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import type { Database } from "../../src/db/schema";
import { runMigrations } from "../../src/db/migrate";

const { Pool } = pg;
const DB_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/haren";
const BASE = "http://localhost:3001";

describe("SSE fallback", () => {
  let db: Kysely<Database>;
  let teamCode: string;
  let userId: string;

  beforeAll(async () => {
    db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: DB_URL, max: 2 }),
      }),
    });
    await runMigrations(db);
    await sql`TRUNCATE teams, users, team_members, projects CASCADE`.execute(db);

    const teamRes = await fetch(`${BASE}/api/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "SSE Team", userName: "SSE User" }),
    });
    const body = await teamRes.json();
    teamCode = body.team.code;
    userId = body.user.id;
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("POST /sse/agent/auth authenticates and returns session", async () => {
    const res = await fetch(`${BASE}/sse/agent/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamCode,
        gitRemoteUrl: "git@github.com:test/sse-test.git",
        projectName: "sse-test",
        userId,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBeDefined();
  });

  test("GET /sse/agent/stream returns SSE content type", async () => {
    const authRes = await fetch(`${BASE}/sse/agent/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamCode,
        gitRemoteUrl: "git@github.com:test/sse-stream.git",
        projectName: "sse-stream",
        userId,
      }),
    });
    const { sessionId } = await authRes.json();

    const controller = new AbortController();
    const res = await fetch(`${BASE}/sse/agent/stream?sessionId=${sessionId}`, {
      signal: controller.signal,
    });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    controller.abort();
  });
});
