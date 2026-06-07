import { test, expect, beforeAll, afterAll } from "bun:test";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { createDb } from "../../src/db/connection";
import { runMigrations } from "../../src/db/migrate";
import type { Database } from "../../src/db/schema";
import {
  listArtifacts,
  getArtifact,
  createArtifact,
  updateArtifact,
  deleteArtifact,
} from "../../src/services/artifact-service";

const { Pool } = pg;
const DB_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/haren";

let db: Kysely<Database>;
let projectId: string;
let artifactId: string;

beforeAll(async () => {
  db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: DB_URL, max: 2 }),
    }),
  });
  await runMigrations(db);
  await sql`TRUNCATE artifacts, projects, teams, users, team_members CASCADE`.execute(db);

  // Seed user
  const user = await db
    .insertInto("users")
    .values({ name: "ART-TEST-19 User" })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Seed team
  const team = await db
    .insertInto("teams")
    .values({ name: "ART-TEST-19 Team", code: "ART-TEST-19", created_by: user.id })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Seed project
  const project = await db
    .insertInto("projects")
    .values({
      team_id: team.id,
      git_remote_url: "git@github.com:test/artifact-test.git",
      name: "artifact-test",
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  projectId = project.id;
});

afterAll(async () => {
  await db.destroy();
});

test("createArtifact creates an artifact with correct fields", async () => {
  const artifact = await createArtifact(db, projectId, {
    path: "rfcs/0008.md",
    kind: "rfc",
    body: "# RFC",
  });

  expect(artifact.path).toBe("rfcs/0008.md");
  expect(artifact.kind).toBe("rfc");
  expect(artifact.body).toBe("# RFC");
  expect(artifact.project_id).toBe(projectId);
  expect(artifact.size_bytes).toBe(Buffer.byteLength("# RFC", "utf8"));
  expect(artifact.updated_at).toBeInstanceOf(Date);

  artifactId = artifact.id;
});

test("listArtifacts returns the created artifact without body", async () => {
  const artifacts = await listArtifacts(db, projectId);

  expect(artifacts.length).toBeGreaterThanOrEqual(1);
  const found = artifacts.find((a) => a.id === artifactId);
  expect(found).toBeDefined();
  expect(found?.path).toBe("rfcs/0008.md");
  expect(found?.kind).toBe("rfc");
  // listArtifacts does not return body
  expect((found as any).body).toBeUndefined();
});

test("getArtifact returns full artifact including body", async () => {
  const artifact = await getArtifact(db, artifactId);

  expect(artifact.id).toBe(artifactId);
  expect(artifact.body).toBe("# RFC");
});

test("updateArtifact updates body and recalculates size_bytes", async () => {
  const newBody = "# RFC\n\nUpdated content.";
  const updated = await updateArtifact(db, artifactId, { body: newBody });

  expect(updated.id).toBe(artifactId);
  expect(updated.body).toBe(newBody);
  expect(updated.size_bytes).toBe(Buffer.byteLength(newBody, "utf8"));
  expect(updated.updated_at).toBeInstanceOf(Date);
});

test("deleteArtifact removes it from list", async () => {
  await deleteArtifact(db, artifactId);

  const artifacts = await listArtifacts(db, projectId);
  const found = artifacts.find((a) => a.id === artifactId);
  expect(found).toBeUndefined();
});
