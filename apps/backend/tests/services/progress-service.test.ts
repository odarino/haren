import { test, expect, beforeAll, afterAll } from "bun:test";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { runMigrations } from "../../src/db/migrate";
import type { Database } from "../../src/db/schema";
import { getProgress } from "../../src/services/progress-service";

const { Pool } = pg;
const DB_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/haren";

let db: Kysely<Database>;
let projectId: string;

beforeAll(async () => {
  db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: DB_URL, max: 2 }),
    }),
  });
  await runMigrations(db);

  // Seed user
  const user = await db
    .insertInto("users")
    .values({ name: "Progress Test User" })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Seed team with unique code to avoid conflicts
  const team = await db
    .insertInto("teams")
    .values({ name: "Progress Test Team", code: "PROG-TEST-11", created_by: user.id })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Seed project
  const project = await db
    .insertInto("projects")
    .values({
      team_id: team.id,
      git_remote_url: "git@github.com:test/progress-test.git",
      name: "progress-test",
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  projectId = project.id;

  // Seed a module
  const module = await db
    .insertInto("modules")
    .values({
      project_id: projectId,
      code: "M-01",
      name: "Test Module",
      status: "on-track",
      tags: [],
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Seed 3 tasks: one done (3pts), one blocked (5pts), one todo (2pts)
  await db
    .insertInto("tasks")
    .values([
      {
        project_id: projectId,
        module_id: module.id,
        code: "T-01",
        title: "Done Task",
        status: "done",
        priority: "medium",
        points: 3,
        opened_at: new Date(),
      },
      {
        project_id: projectId,
        module_id: module.id,
        code: "T-02",
        title: "Blocked Task",
        status: "blocked",
        priority: "high",
        points: 5,
        opened_at: new Date(),
      },
      {
        project_id: projectId,
        module_id: module.id,
        code: "T-03",
        title: "Todo Task",
        status: "todo",
        priority: "low",
        points: 2,
        opened_at: new Date(),
      },
    ])
    .execute();

  // Seed an active iteration
  await db
    .insertInto("iterations")
    .values({
      project_id: projectId,
      code: "IT-1",
      label: "Iteration 1",
      start_date: new Date("2025-01-01"),
      end_date: new Date("2025-01-14"),
      state: "active",
      scope: 10,
      velocity: 3,
    })
    .execute();
});

afterAll(async () => {
  // Clean up
  await db
    .deleteFrom("tasks")
    .where("project_id", "=", projectId)
    .execute();
  await db
    .deleteFrom("iterations")
    .where("project_id", "=", projectId)
    .execute();
  await db
    .deleteFrom("modules")
    .where("project_id", "=", projectId)
    .execute();
  await db
    .deleteFrom("projects")
    .where("id", "=", projectId)
    .execute();
  await db.destroy();
});

test("getProgress returns correct task counts", async () => {
  const result = await getProgress(db, projectId);

  expect(result.totalTasks).toBe(3);
  expect(result.doneTasks).toBe(1);
  expect(result.blockedTasks).toBe(1);
});

test("getProgress computes overallPercent > 0", async () => {
  const result = await getProgress(db, projectId);

  expect(result.overallPercent).toBeGreaterThan(0);
  expect(result.overallPercent).toBe(33);
});

test("getProgress returns active iteration with code IT-1", async () => {
  const result = await getProgress(db, projectId);

  expect(result.activeIteration).not.toBeNull();
  expect(result.activeIteration?.code).toBe("IT-1");
  expect(result.activeIteration?.scope).toBe(10);
  expect(result.activeIteration?.velocity).toBe(3);
});

test("getProgress returns moduleStats with at least 1 entry showing progress > 0", async () => {
  const result = await getProgress(db, projectId);

  expect(result.moduleStats.length).toBeGreaterThanOrEqual(1);

  const moduleStat = result.moduleStats.find((m) => m.code === "M-01");
  expect(moduleStat).toBeDefined();
  expect(moduleStat?.name).toBe("Test Module");
  expect(moduleStat?.totalTasks).toBe(3);
  expect(moduleStat?.doneTasks).toBe(1);
  expect(moduleStat?.blockers).toBe(1);
  expect(moduleStat?.progress).toBeGreaterThan(0);
});
