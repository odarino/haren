import { type Kysely, sql } from "kysely";
import type { Database } from "./schema";

export async function runMigrations(db: Kysely<Database>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS teams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS team_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(team_id, user_id)
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      git_remote_url TEXT NOT NULL,
      name TEXT NOT NULL,
      registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(team_id, git_remote_url)
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS modules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      eta DATE,
      tags TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(project_id, code)
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS iterations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      label TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      state TEXT NOT NULL,
      scope INTEGER NOT NULL DEFAULT 0,
      velocity INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(project_id, code)
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      iteration_id UUID REFERENCES iterations(id) ON DELETE SET NULL,
      module_id UUID REFERENCES modules(id) ON DELETE SET NULL,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      assignee_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      opened_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(project_id, code)
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS artifacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      kind TEXT NOT NULL,
      body TEXT NOT NULL,
      updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(project_id, path)
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS activity_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      actor_type TEXT NOT NULL,
      kind TEXT NOT NULL,
      ref TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS user_preferences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      theme TEXT NOT NULL DEFAULT 'system',
      accent TEXT NOT NULL DEFAULT 'blue',
      density TEXT NOT NULL DEFAULT 'comfortable',
      sidebar_collapsed BOOLEAN NOT NULL DEFAULT false,
      pinned_items JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE NULLS NOT DISTINCT (user_id, project_id)
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS velocity_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      iteration_id UUID NOT NULL REFERENCES iterations(id) ON DELETE CASCADE,
      snapshot_date DATE NOT NULL,
      points_done INTEGER NOT NULL DEFAULT 0,
      scope INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(iteration_id, snapshot_date)
    )
  `.execute(db);
}

if (import.meta.main) {
  const { createDb } = await import("./connection");
  const db = createDb();
  await runMigrations(db);
  console.log("Migrations complete");
  await db.destroy();
}
