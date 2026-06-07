import { test, expect, beforeAll, afterAll } from "bun:test";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { createDb } from "../../src/db/connection";
import { runMigrations } from "../../src/db/migrate";
import type { Database } from "../../src/db/schema";
import {
  listModules,
  getModule,
  createModule,
  updateModule,
  deleteModule,
} from "../../src/services/module-service";

const { Pool } = pg;
const DB_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/haren";

let db: Kysely<Database>;
let projectId: string;
let moduleId: string;

beforeAll(async () => {
  db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: DB_URL, max: 2 }),
    }),
  });
  await runMigrations(db);
  await sql`TRUNCATE modules, projects, teams, users, team_members CASCADE`.execute(db);

  // Seed user
  const user = await db
    .insertInto("users")
    .values({ name: "Test User" })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Seed team
  const team = await db
    .insertInto("teams")
    .values({ name: "Test Team", code: "TST-001", created_by: user.id })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Seed project
  const project = await db
    .insertInto("projects")
    .values({
      team_id: team.id,
      git_remote_url: "git@github.com:test/module-test.git",
      name: "module-test",
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  projectId = project.id;
});

afterAll(async () => {
  await db.destroy();
});

test("createModule creates a module with code M-01", async () => {
  const module = await createModule(db, projectId, {
    code: "M-01",
    name: "Identity",
    status: "active",
    tags: ["security"],
  });

  expect(module.code).toBe("M-01");
  expect(module.name).toBe("Identity");
  expect(module.status).toBe("active");
  expect(module.tags).toEqual(["security"]);
  expect(module.project_id).toBe(projectId);

  moduleId = module.id;
});

test("listModules returns the created module", async () => {
  const modules = await listModules(db, projectId);

  expect(modules.length).toBeGreaterThanOrEqual(1);
  const found = modules.find((m) => m.code === "M-01");
  expect(found).toBeDefined();
  expect(found?.name).toBe("Identity");
});

test("updateModule updates status to at-risk", async () => {
  const updated = await updateModule(db, moduleId, { status: "paused" });

  expect(updated.id).toBe(moduleId);
  expect(updated.status).toBe("paused");
});

test("deleteModule removes it from list", async () => {
  await deleteModule(db, moduleId);

  const modules = await listModules(db, projectId);
  const found = modules.find((m) => m.id === moduleId);
  expect(found).toBeUndefined();
});
