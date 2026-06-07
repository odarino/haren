import { describe, test, expect, afterAll } from "bun:test";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import type { Database } from "../../src/db/schema";
import { runMigrations } from "../../src/db/migrate";

const { Pool } = pg;

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/haren";

describe("migrations", () => {
  let db: Kysely<Database>;

  afterAll(async () => {
    if (db) {
      await sql`DROP TABLE IF EXISTS velocity_snapshots, activity_events, user_preferences, artifacts, tasks, iterations, modules, team_members, projects, users, teams CASCADE`.execute(db);
      await db.destroy();
    }
  });

  test("creates all tables", async () => {
    db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: TEST_DB_URL, max: 2 }),
      }),
    });

    await runMigrations(db);

    const team = await db
      .insertInto("teams")
      .values({ name: "Test Team", code: "ABC123", created_by: "test-user" })
      .returningAll()
      .executeTakeFirstOrThrow();

    expect(team.name).toBe("Test Team");
    expect(team.code).toBe("ABC123");
    expect(team.id).toBeDefined();
    expect(team.created_at).toBeInstanceOf(Date);

    const user = await db
      .insertInto("users")
      .values({ name: "Alice" })
      .returningAll()
      .executeTakeFirstOrThrow();

    expect(user.name).toBe("Alice");

    const member = await db
      .insertInto("team_members")
      .values({ team_id: team.id, user_id: user.id })
      .returningAll()
      .executeTakeFirstOrThrow();

    expect(member.team_id).toBe(team.id);
    expect(member.user_id).toBe(user.id);

    const project = await db
      .insertInto("projects")
      .values({
        team_id: team.id,
        git_remote_url: "git@github.com:example/repo.git",
        name: "example-repo",
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    expect(project.git_remote_url).toBe("git@github.com:example/repo.git");
  });

  test("unique constraint on team code", async () => {
    await expect(
      db.insertInto("teams").values({ name: "Dupe", code: "ABC123", created_by: "x" }).execute(),
    ).rejects.toThrow();
  });

  test("unique constraint on git_remote_url per team", async () => {
    const team = await db
      .selectFrom("teams")
      .selectAll()
      .where("code", "=", "ABC123")
      .executeTakeFirstOrThrow();

    await expect(
      db
        .insertInto("projects")
        .values({
          team_id: team.id,
          git_remote_url: "git@github.com:example/repo.git",
          name: "dupe",
        })
        .execute(),
    ).rejects.toThrow();
  });

  test("migrations create all v2 tables", async () => {
    const result = await sql<{ tablename: string }>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `.execute(db);

    const tables = result.rows.map((r) => r.tablename);

    expect(tables).toContain("modules");
    expect(tables).toContain("iterations");
    expect(tables).toContain("tasks");
    expect(tables).toContain("artifacts");
    expect(tables).toContain("activity_events");
    expect(tables).toContain("user_preferences");
    expect(tables).toContain("velocity_snapshots");
  });
});
