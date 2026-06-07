import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import type { CreateActivity, ActivityFilters } from "../models/activity";

export async function listActivity(
  db: Kysely<Database>,
  projectId: string,
  filters: ActivityFilters,
) {
  let query = db
    .selectFrom("activity_events")
    .selectAll()
    .where("project_id", "=", projectId);

  if (filters.kind) {
    query = query.where("kind", "=", filters.kind);
  }

  if (filters.actor) {
    query = query.where("actor_user_id", "=", filters.actor);
  }

  if (filters.since) {
    query = query.where("created_at", ">=", new Date(filters.since));
  }

  return query
    .orderBy("created_at", "desc")
    .limit(filters.limit)
    .offset(filters.offset)
    .execute();
}

export async function createActivity(
  db: Kysely<Database>,
  projectId: string,
  input: CreateActivity,
) {
  return db
    .insertInto("activity_events")
    .values({
      project_id: projectId,
      actor_user_id: input.actor_user_id ?? null,
      actor_type: input.actor_type,
      kind: input.kind,
      ref: input.ref,
      message: input.message,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
