import { type Kysely, sql } from "kysely";
import type { Database } from "../db/schema";

export interface ProgressResult {
  totalTasks: number;
  doneTasks: number;
  blockedTasks: number;
  overallPercent: number;
  activeIteration: {
    id: string;
    code: string;
    label: string;
    scope: number;
    velocity: number;
    start_date: string;
    end_date: string;
  } | null;
  moduleStats: {
    id: string;
    code: string;
    name: string;
    status: string;
    totalTasks: number;
    doneTasks: number;
    blockers: number;
    progress: number;
    eta: string | null;
    owner_user_id: string | null;
    tags: string[];
  }[];
}

export async function getProgress(
  db: Kysely<Database>,
  projectId: string,
): Promise<ProgressResult> {
  // Query task counts for the project
  const taskCounts = await db
    .selectFrom("tasks")
    .select([
      sql<number>`count(*)::int`.as("totalTasks"),
      sql<number>`count(*) filter (where status = 'done')::int`.as("doneTasks"),
      sql<number>`count(*) filter (where status = 'blocked')::int`.as("blockedTasks"),
    ])
    .where("project_id", "=", projectId)
    .executeTakeFirstOrThrow();

  const totalTasks = taskCounts.totalTasks;
  const doneTasks = taskCounts.doneTasks;
  const blockedTasks = taskCounts.blockedTasks;

  const overallPercent =
    totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Query active iteration
  const activeIteration = await db
    .selectFrom("iterations")
    .select(["id", "code", "label", "scope", "velocity", "start_date", "end_date"])
    .where("project_id", "=", projectId)
    .where("state", "=", "active")
    .executeTakeFirst();

  // Query per-module stats
  const moduleRows = await db
    .selectFrom("modules")
    .leftJoin("tasks", (join) =>
      join
        .onRef("tasks.module_id", "=", "modules.id")
        .on("tasks.project_id", "=", projectId),
    )
    .select([
      "modules.id",
      "modules.code",
      "modules.name",
      "modules.status",
      "modules.eta",
      "modules.owner_user_id",
      "modules.tags",
      sql<number>`count(tasks.id)::int`.as("totalTasks"),
      sql<number>`count(tasks.id) filter (where tasks.status = 'done')::int`.as("doneTasks"),
      sql<number>`count(tasks.id) filter (where tasks.status = 'blocked')::int`.as("blockers"),
    ])
    .where("modules.project_id", "=", projectId)
    .groupBy([
      "modules.id",
      "modules.code",
      "modules.name",
      "modules.status",
      "modules.eta",
      "modules.owner_user_id",
      "modules.tags",
    ])
    .orderBy("modules.code", "asc")
    .execute();

  const moduleStats = moduleRows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    totalTasks: row.totalTasks,
    doneTasks: row.doneTasks,
    blockers: row.blockers,
    progress:
      row.totalTasks > 0 ? Math.round((row.doneTasks / row.totalTasks) * 100) : 0,
    eta: row.eta ? (row.eta as Date).toISOString() : null,
    owner_user_id: row.owner_user_id,
    tags: row.tags,
  }));

  return {
    totalTasks,
    doneTasks,
    blockedTasks,
    overallPercent,
    activeIteration: activeIteration
      ? {
          id: activeIteration.id,
          code: activeIteration.code,
          label: activeIteration.label,
          scope: activeIteration.scope,
          velocity: activeIteration.velocity,
          start_date: (activeIteration.start_date as Date).toISOString(),
          end_date: (activeIteration.end_date as Date).toISOString(),
        }
      : null,
    moduleStats,
  };
}
