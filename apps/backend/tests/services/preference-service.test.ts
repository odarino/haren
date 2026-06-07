import { test, expect, beforeAll, afterAll } from "bun:test";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { runMigrations } from "../../src/db/migrate";
import type { Database } from "../../src/db/schema";
import { getPreferences, upsertPreferences } from "../../src/services/preference-service";

const { Pool } = pg;
const DB_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/haren";

let db: Kysely<Database>;
let userId: string;
let projectId: string;

beforeAll(async () => {
  db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: DB_URL, max: 2 }),
    }),
  });
  await runMigrations(db);
  await sql`TRUNCATE user_preferences, projects, teams, users, team_members CASCADE`.execute(db);

  // Seed user
  const user = await db
    .insertInto("users")
    .values({ name: "Pref Test User" })
    .returningAll()
    .executeTakeFirstOrThrow();

  userId = user.id;

  // Seed team
  const team = await db
    .insertInto("teams")
    .values({ name: "Pref Test Team", code: "PREF-TEST-25", created_by: user.id })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Seed project
  const project = await db
    .insertInto("projects")
    .values({
      team_id: team.id,
      git_remote_url: "git@github.com:test/pref-test.git",
      name: "pref-test",
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  projectId = project.id;
});

afterAll(async () => {
  await db.destroy();
});

test("getPreferences returns defaults when no row exists", async () => {
  const prefs = await getPreferences(db, userId);

  expect(prefs.user_id).toBe(userId);
  expect(prefs.project_id).toBeNull();
  expect(prefs.theme).toBe("light");
  expect(prefs.accent).toBe("blue-yellow-green-purple");
  expect(prefs.density).toBe("comfy");
  expect(prefs.sidebar_collapsed).toBe(false);
  expect(Array.isArray(prefs.pinned_items)).toBe(true);
});

test("upsertPreferences creates a new row", async () => {
  const prefs = await upsertPreferences(db, userId, {
    theme: "dark",
    accent: "violet",
    density: "compact",
    sidebar_collapsed: true,
    pinned_items: [{ view: "tasks", target: "HRN-1", label: "My Task" }],
  });

  expect(prefs.user_id).toBe(userId);
  expect(prefs.theme).toBe("dark");
  expect(prefs.accent).toBe("violet");
  expect(prefs.density).toBe("compact");
  expect(prefs.sidebar_collapsed).toBe(true);
  expect(prefs.id).toBeDefined();
});

test("upsertPreferences updates an existing row", async () => {
  const updated = await upsertPreferences(db, userId, {
    theme: "light",
    accent: "emerald",
    density: "comfy",
    sidebar_collapsed: false,
    pinned_items: [],
  });

  expect(updated.theme).toBe("light");
  expect(updated.accent).toBe("emerald");
  expect(updated.density).toBe("comfy");
  expect(updated.sidebar_collapsed).toBe(false);
});

test("getPreferences returns updated values after upsert", async () => {
  const prefs = await getPreferences(db, userId);

  expect(prefs.theme).toBe("light");
  expect(prefs.accent).toBe("emerald");
});

test("getPreferences with projectId returns defaults when no row exists", async () => {
  const prefs = await getPreferences(db, userId, projectId);

  expect(prefs.user_id).toBe(userId);
  expect(prefs.project_id).toBe(projectId);
  expect(prefs.theme).toBe("light");
  expect(prefs.accent).toBe("blue-yellow-green-purple");
});

test("upsertPreferences with projectId creates project-scoped row", async () => {
  const prefs = await upsertPreferences(db, userId, {
    project_id: projectId,
    theme: "dark",
    accent: "rose",
    density: "compact",
    sidebar_collapsed: false,
    pinned_items: [],
  });

  expect(prefs.user_id).toBe(userId);
  expect(prefs.project_id).toBe(projectId);
  expect(prefs.theme).toBe("dark");
  expect(prefs.accent).toBe("rose");
});

test("getPreferences with projectId returns the project-scoped row", async () => {
  const prefs = await getPreferences(db, userId, projectId);

  expect(prefs.theme).toBe("dark");
  expect(prefs.accent).toBe("rose");
  expect(prefs.project_id).toBe(projectId);
});
