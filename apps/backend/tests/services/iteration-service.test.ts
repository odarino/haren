import { test, expect, beforeAll, afterAll } from "bun:test";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { createDb } from "../../src/db/connection";
import { runMigrations } from "../../src/db/migrate";
import type { Database } from "../../src/db/schema";
import {
  listIterations,
  getIteration,
  createIteration,
  updateIteration,
  deleteIteration,
  getBurnup,
  recordSnapshot,
} from "../../src/services/iteration-service";

const { Pool } = pg;
const DB_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/haren";

let db: Kysely<Database>;
let projectId: string;
let iterationId: string;

beforeAll(async () => {
  db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: DB_URL, max: 2 }),
    }),
  });
  await runMigrations(db);
  await sql`TRUNCATE velocity_snapshots, iterations, modules, projects, teams, users, team_members CASCADE`.execute(db);

  // Seed user
  const user = await db
    .insertInto("users")
    .values({ name: "Iter Test User" })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Seed team with unique code
  const team = await db
    .insertInto("teams")
    .values({ name: "Iter Test Team", code: "ITER-TEST-14", created_by: user.id })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Seed project
  const project = await db
    .insertInto("projects")
    .values({
      team_id: team.id,
      git_remote_url: "git@github.com:test/iter-test.git",
      name: "iter-test",
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  projectId = project.id;
});

afterAll(async () => {
  await db.destroy();
});

test("createIteration creates an iteration with code IT-14", async () => {
  const iteration = await createIteration(db, projectId, {
    code: "IT-14",
    label: "Artifacts α",
    start_date: "2025-01-01",
    end_date: "2025-01-14",
    state: "planned",
    scope: 52,
    velocity: 0,
    notes: null,
  });

  expect(iteration.code).toBe("IT-14");
  expect(iteration.label).toBe("Artifacts α");
  expect(iteration.state).toBe("planned");
  expect(iteration.scope).toBe(52);
  expect(iteration.project_id).toBe(projectId);

  iterationId = iteration.id;
});

test("listIterations returns the created iteration", async () => {
  const iterations = await listIterations(db, projectId);

  expect(iterations.length).toBeGreaterThanOrEqual(1);
  const found = iterations.find((i) => i.code === "IT-14");
  expect(found).toBeDefined();
  expect(found?.label).toBe("Artifacts α");
});

test("updateIteration updates state to active", async () => {
  const updated = await updateIteration(db, iterationId, { state: "active" });

  expect(updated.id).toBe(iterationId);
  expect(updated.state).toBe("active");
});

test("getIteration returns iteration with id", async () => {
  const iteration = await getIteration(db, iterationId);

  expect(iteration.id).toBe(iterationId);
  expect(iteration.code).toBe("IT-14");
});

test("recordSnapshot upserts a velocity_snapshots row", async () => {
  const snapshot = await recordSnapshot(db, iterationId, "2025-01-05", 10, 52);

  expect(snapshot.iteration_id).toBe(iterationId);
  expect(snapshot.points_done).toBe(10);
  expect(snapshot.scope).toBe(52);

  // Upsert same date with updated values
  const updated = await recordSnapshot(db, iterationId, "2025-01-05", 20, 55);
  expect(updated.points_done).toBe(20);
  expect(updated.scope).toBe(55);
});

test("getBurnup returns snapshots ordered by date", async () => {
  await recordSnapshot(db, iterationId, "2025-01-03", 5, 52);
  await recordSnapshot(db, iterationId, "2025-01-07", 30, 52);

  const burnup = await getBurnup(db, iterationId);

  expect(burnup.length).toBeGreaterThanOrEqual(2);
  // Verify ordering: dates should be ascending
  for (let i = 1; i < burnup.length; i++) {
    expect(new Date(burnup[i].snapshot_date) >= new Date(burnup[i - 1].snapshot_date)).toBe(true);
  }
});

test("deleteIteration removes it from list", async () => {
  await deleteIteration(db, iterationId);

  const iterations = await listIterations(db, projectId);
  const found = iterations.find((i) => i.id === iterationId);
  expect(found).toBeUndefined();
});
