import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import type { Database } from "../../src/db/schema";
import { runMigrations } from "../../src/db/migrate";

const { Pool } = pg;
const DB_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/haren";
const BASE = `http://localhost:${process.env.TEST_PORT ?? 3001}`;

describe("team routes", () => {
  let db: Kysely<Database>;

  beforeAll(async () => {
    db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: DB_URL, max: 2 }),
      }),
    });
    await runMigrations(db);
    await sql`TRUNCATE teams, users, team_members, projects CASCADE`.execute(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("POST /api/teams creates a team and returns code", async () => {
    const res = await fetch(`${BASE}/api/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "GS Garage", userName: "Phung" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.team.name).toBe("GS Garage");
    expect(body.team.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(body.user.name).toBe("Phung");
  });

  test("POST /api/teams/join joins a team by code", async () => {
    const createRes = await fetch(`${BASE}/api/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Join Test", userName: "Creator" }),
    });
    const { team } = await createRes.json();

    const joinRes = await fetch(`${BASE}/api/teams/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: team.code, userName: "Joiner" }),
    });
    expect(joinRes.status).toBe(200);
    const joinBody = await joinRes.json();
    expect(joinBody.team.id).toBe(team.id);
    expect(joinBody.user.name).toBe("Joiner");
  });

  test("POST /api/teams/join with invalid code returns 404", async () => {
    const res = await fetch(`${BASE}/api/teams/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ZZZZZZ", userName: "Nobody" }),
    });
    expect(res.status).toBe(404);
  });

  test("GET /api/teams/:id returns team with members", async () => {
    const createRes = await fetch(`${BASE}/api/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Detail Test", userName: "Admin" }),
    });
    const { team } = await createRes.json();

    const res = await fetch(`${BASE}/api/teams/${team.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.team.name).toBe("Detail Test");
    expect(body.members.length).toBe(1);
    expect(body.members[0].name).toBe("Admin");
  });
});
