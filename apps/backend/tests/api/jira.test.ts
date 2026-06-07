import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import type { Database } from "../../src/db/schema";
import { runMigrations } from "../../src/db/migrate";

const { Pool } = pg;
const DB_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/haren";
const BASE = `http://localhost:${process.env.TEST_PORT ?? 3001}`;

describe("jira routes", () => {
  let db: Kysely<Database>;
  let teamId: string;

  beforeAll(async () => {
    db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: DB_URL, max: 2 }),
      }),
    });
    await runMigrations(db);
    await sql`TRUNCATE teams, users, team_members, projects CASCADE`.execute(db);
    await sql`DROP TABLE IF EXISTS jira_configs CASCADE`.execute(db);

    const res = await fetch(`${BASE}/api/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Jira Team", userName: "PM" }),
    });
    const body = await res.json();
    teamId = body.team.id;
  });

  afterAll(async () => {
    await sql`DROP TABLE IF EXISTS jira_configs CASCADE`.execute(db);
    await db.destroy();
  });

  test("GET /api/jira/config returns null when no config", async () => {
    const res = await fetch(`${BASE}/api/jira/config?teamId=${teamId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.config).toBeNull();
  });

  test("POST /api/jira/config saves config", async () => {
    const res = await fetch(`${BASE}/api/jira/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId,
        baseUrl: "https://mycompany.atlassian.net",
        email: "pm@company.com",
        apiToken: "token123",
        projectKey: "HAREN",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("GET /api/jira/config returns saved config", async () => {
    const res = await fetch(`${BASE}/api/jira/config?teamId=${teamId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.config).toBeDefined();
    expect(body.config.base_url).toBe("https://mycompany.atlassian.net");
    expect(body.config.project_key).toBe("HAREN");
  });
});
