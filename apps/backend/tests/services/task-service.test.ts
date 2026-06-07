import { test, expect, beforeAll, afterAll } from "bun:test";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { runMigrations } from "../../src/db/migrate";
import type { Database } from "../../src/db/schema";
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  parseNaturalLanguage,
} from "../../src/services/task-service";

const { Pool } = pg;
const DB_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/haren";

let db: Kysely<Database>;
let projectId: string;
let taskId: string;

beforeAll(async () => {
  db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: DB_URL, max: 2 }),
    }),
  });
  await runMigrations(db);
  await sql`TRUNCATE tasks, modules, iterations, projects, teams, users, team_members CASCADE`.execute(
    db,
  );

  // Seed user
  const user = await db
    .insertInto("users")
    .values({ name: "Task Test User" })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Seed team
  const team = await db
    .insertInto("teams")
    .values({ name: "Task Test Team", code: "TASK-TEST-15", created_by: user.id })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Seed project
  const project = await db
    .insertInto("projects")
    .values({
      team_id: team.id,
      git_remote_url: "git@github.com:test/task-test.git",
      name: "task-test",
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  projectId = project.id;
});

afterAll(async () => {
  await db.destroy();
});

test("createTask creates a task with code HRN-451", async () => {
  const task = await createTask(db, projectId, {
    code: "HRN-451",
    title: "Optimistic write",
    status: "blocked",
    priority: "p1",
    points: 8,
  });

  expect(task.code).toBe("HRN-451");
  expect(task.title).toBe("Optimistic write");
  expect(task.status).toBe("blocked");
  expect(task.priority).toBe("p1");
  expect(task.points).toBe(8);
  expect(task.project_id).toBe(projectId);
  expect(task.opened_at).toBeDefined();

  taskId = task.id;
});

test("listTasks returns the created task", async () => {
  const tasks = await listTasks(db, projectId, {
    limit: 100,
    offset: 0,
  });

  expect(tasks.length).toBeGreaterThanOrEqual(1);
  const found = tasks.find((t) => t.code === "HRN-451");
  expect(found).toBeDefined();
  expect(found?.title).toBe("Optimistic write");
});

test("listTasks filters by status=blocked returns only blocked tasks", async () => {
  // Create a non-blocked task
  await createTask(db, projectId, {
    code: "HRN-452",
    title: "Another task",
    status: "todo",
    priority: "p2",
    points: 2,
  });

  const tasks = await listTasks(db, projectId, {
    status: "blocked",
    limit: 100,
    offset: 0,
  });

  expect(tasks.length).toBeGreaterThanOrEqual(1);
  for (const t of tasks) {
    expect(t.status).toBe("blocked");
  }
});

test("listTasks with limit=1 returns 1 result", async () => {
  const tasks = await listTasks(db, projectId, {
    limit: 1,
    offset: 0,
  });

  expect(tasks.length).toBe(1);
});

test("updateTask updates status to doing", async () => {
  const updated = await updateTask(db, taskId, { status: "doing" });

  expect(updated.id).toBe(taskId);
  expect(updated.status).toBe("doing");
});

test("deleteTask removes the task", async () => {
  await deleteTask(db, taskId);

  const tasks = await listTasks(db, projectId, { limit: 100, offset: 0 });
  const found = tasks.find((t) => t.id === taskId);
  expect(found).toBeUndefined();
});

test("parseNaturalLanguage extracts fields from NL input", () => {
  const input = "retry policy for stream cancel, M-04, p1, ~3pts, @r.chen";
  const result = parseNaturalLanguage(input, {
    modules: ["M-04"],
    assignees: ["r.chen"],
  });

  expect(result.priority).toBe("p1");
  expect(result.points).toBe(3);
  expect(result.module).toBe("M-04");
  expect(result.assignee).toBe("r.chen");
  expect(result.title).toContain("retry policy for stream cancel");
});
