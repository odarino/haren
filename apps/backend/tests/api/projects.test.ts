import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import type { Database } from "../../src/db/schema";
import { runMigrations } from "../../src/db/migrate";

const { Pool } = pg;
const DB_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/haren";
const BASE = `http://localhost:${process.env.TEST_PORT ?? 3001}`;

describe("project routes", () => {
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

    const res = await fetch(`${BASE}/api/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Project Team", userName: "Dev" }),
    });
    const body = await res.json();
    teamId = body.team.id;
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("POST /api/projects/register registers a project", async () => {
    const res = await fetch(`${BASE}/api/projects/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId,
        gitRemoteUrl: "git@github.com:example-org/my-app.git",
        name: "my-app",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.project.name).toBe("my-app");
    expect(body.project.git_remote_url).toBe("git@github.com:example-org/my-app.git");
  });

  test("POST /api/projects/register rejects duplicate git URL per team", async () => {
    const res = await fetch(`${BASE}/api/projects/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId,
        gitRemoteUrl: "git@github.com:example-org/my-app.git",
        name: "my-app-dupe",
      }),
    });
    expect(res.status).toBe(409);
  });

  test("GET /api/projects?teamId= lists projects for a team", async () => {
    const res = await fetch(`${BASE}/api/projects?teamId=${teamId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects.length).toBeGreaterThanOrEqual(1);
    expect(body.projects[0].name).toBe("my-app");
  });
});
