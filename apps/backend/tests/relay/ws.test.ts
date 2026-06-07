import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import type { Database } from "../../src/db/schema";
import { runMigrations } from "../../src/db/migrate";

const { Pool } = pg;
const DB_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/haren";
const BASE = "http://localhost:3001";
const WS_BASE = "ws://localhost:3001";

describe("WebSocket relay", () => {
  let db: Kysely<Database>;
  let teamCode: string;
  let teamId: string;
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
      body: JSON.stringify({ name: "WS Team", userName: "Agent User" }),
    });
    const teamBody = await teamRes.json();
    teamCode = teamBody.team.code;
    teamId = teamBody.team.id;
    userId = teamBody.user.id;

    await fetch(`${BASE}/api/projects/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId,
        gitRemoteUrl: "git@github.com:test/ws-test.git",
        name: "ws-test",
      }),
    });
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("agent connects and authenticates via WebSocket", async () => {
    const ws = new WebSocket(`${WS_BASE}/ws/agent`);

    const result = await new Promise<any>((resolve, reject) => {
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "auth",
            teamCode,
            gitRemoteUrl: "git@github.com:test/ws-test.git",
            projectName: "ws-test",
            userId,
          }),
        );
      };
      ws.onmessage = (event) => {
        resolve(JSON.parse(event.data as string));
        ws.close();
      };
      ws.onerror = reject;
      setTimeout(() => reject(new Error("Timeout")), 5000);
    });

    expect(result.type).toBe("auth-ok");
    expect(result.sessionId).toBeDefined();
  });

  test("agent with invalid team code gets auth-fail", async () => {
    const ws = new WebSocket(`${WS_BASE}/ws/agent`);

    const result = await new Promise<any>((resolve, reject) => {
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "auth",
            teamCode: "BADCODE",
            gitRemoteUrl: "git@github.com:test/ws-test.git",
            projectName: "ws-test",
            userId: "fake",
          }),
        );
      };
      ws.onmessage = (event) => {
        resolve(JSON.parse(event.data as string));
        ws.close();
      };
      ws.onerror = reject;
      setTimeout(() => reject(new Error("Timeout")), 5000);
    });

    expect(result.type).toBe("auth-fail");
  });
});
