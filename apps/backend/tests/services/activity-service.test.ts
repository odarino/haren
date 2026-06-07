import { test, expect, beforeAll, afterAll } from "bun:test";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { runMigrations } from "../../src/db/migrate";
import type { Database } from "../../src/db/schema";
import { listActivity, createActivity } from "../../src/services/activity-service";

const { Pool } = pg;
const DB_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/haren";

let db: Kysely<Database>;
let projectId: string;
let userId: string;

beforeAll(async () => {
  db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: DB_URL, max: 2 }),
    }),
  });
  await runMigrations(db);
  await sql`TRUNCATE activity_events, projects, teams, users, team_members CASCADE`.execute(db);

  // Seed user
  const user = await db
    .insertInto("users")
    .values({ name: "Activity Test User" })
    .returningAll()
    .executeTakeFirstOrThrow();

  userId = user.id;

  // Seed team
  const team = await db
    .insertInto("teams")
    .values({ name: "Activity Test Team", code: "ACT-TEST-21", created_by: user.id })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Seed project
  const project = await db
    .insertInto("projects")
    .values({
      team_id: team.id,
      git_remote_url: "git@github.com:test/activity-test.git",
      name: "activity-test",
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  projectId = project.id;

  // Seed 3 events: commit, merge, agent
  await createActivity(db, projectId, {
    actor_user_id: userId,
    actor_type: "user",
    kind: "commit",
    ref: "abc1234",
    message: "feat: add login page",
  });

  await createActivity(db, projectId, {
    actor_user_id: userId,
    actor_type: "user",
    kind: "merge",
    ref: "pr-42",
    message: "Merge pull request #42",
  });

  await createActivity(db, projectId, {
    actor_user_id: null,
    actor_type: "agent",
    kind: "agent",
    ref: "agent-session-1",
    message: "Agent ran discovery scan",
  });
});

afterAll(async () => {
  await db.destroy();
});

test("listActivity returns all 3 seeded events", async () => {
  const events = await listActivity(db, projectId, { limit: 50, offset: 0 });
  expect(events.length).toBe(3);
});

test("listActivity filters by kind=commit returns 1", async () => {
  const events = await listActivity(db, projectId, {
    kind: "commit",
    limit: 50,
    offset: 0,
  });
  expect(events.length).toBe(1);
  expect(events[0].kind).toBe("commit");
  expect(events[0].ref).toBe("abc1234");
});

test("listActivity filters by since date in the future returns 0", async () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const events = await listActivity(db, projectId, {
    since: future,
    limit: 50,
    offset: 0,
  });
  expect(events.length).toBe(0);
});

test("listActivity filters by since date in the past returns all", async () => {
  const past = new Date(Date.now() - 60_000).toISOString();
  const events = await listActivity(db, projectId, {
    since: past,
    limit: 50,
    offset: 0,
  });
  expect(events.length).toBe(3);
});

test("listActivity pagination with limit=1 returns 1 result", async () => {
  const events = await listActivity(db, projectId, { limit: 1, offset: 0 });
  expect(events.length).toBe(1);
});

test("listActivity pagination with offset=2 returns 1 result", async () => {
  const events = await listActivity(db, projectId, { limit: 50, offset: 2 });
  expect(events.length).toBe(1);
});

test("createActivity inserts and returns the event", async () => {
  const event = await createActivity(db, projectId, {
    actor_user_id: userId,
    actor_type: "user",
    kind: "comment",
    ref: "task-99",
    message: "Looks good to me!",
  });

  expect(event.kind).toBe("comment");
  expect(event.message).toBe("Looks good to me!");
  expect(event.project_id).toBe(projectId);
  expect(event.actor_user_id).toBe(userId);
  expect(event.id).toBeDefined();
  expect(event.created_at).toBeDefined();
});
