import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import type { Database } from "../../src/db/schema";
import { runMigrations } from "../../src/db/migrate";

const { Pool } = pg;
const DB_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/haren";
const BASE = "http://localhost:3001";

describe("HTTP polling fallback", () => {
  let db: Kysely<Database>;
  let teamCode: string;
  let userId: string;
  let sessionId: string;

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
      body: JSON.stringify({ name: "Poll Team", userName: "Poll User" }),
    });
    const body = await teamRes.json();
    teamCode = body.team.code;
    userId = body.user.id;
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("POST /poll/agent/auth authenticates", async () => {
    const res = await fetch(`${BASE}/poll/agent/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamCode,
        gitRemoteUrl: "git@github.com:test/poll-test.git",
        projectName: "poll-test",
        userId,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    sessionId = body.sessionId;
    expect(sessionId).toBeDefined();
  });

  test("GET /poll/agent/messages returns pending messages", async () => {
    const res = await fetch(`${BASE}/poll/agent/messages?sessionId=${sessionId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toBeArray();
  });

  test("POST /poll/agent/send sends a message", async () => {
    const res = await fetch(`${BASE}/poll/agent/send?sessionId=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "heartbeat" }),
    });
    expect(res.status).toBe(200);
  });
});
