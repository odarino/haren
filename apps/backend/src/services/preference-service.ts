import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import type { UpsertPreference } from "../models/preference";

const DEFAULTS = {
  theme: "light" as const,
  accent: "blue-yellow-green-purple" as const,
  density: "comfy" as const,
  sidebar_collapsed: false,
  pinned_items: [] as unknown[],
};

export async function getPreferences(
  db: Kysely<Database>,
  userId: string,
  projectId?: string | null,
) {
  let query = db
    .selectFrom("user_preferences")
    .selectAll()
    .where("user_id", "=", userId);

  if (projectId) {
    query = query.where("project_id", "=", projectId);
  } else {
    query = query.where("project_id", "is", null);
  }

  const row = await query.executeTakeFirst();

  if (!row) {
    return {
      user_id: userId,
      project_id: projectId ?? null,
      ...DEFAULTS,
    };
  }

  return row;
}

export async function upsertPreferences(
  db: Kysely<Database>,
  userId: string,
  input: UpsertPreference,
) {
  const now = new Date();
  const projectId = input.project_id ?? null;
  const pinnedItems = input.pinned_items ?? [];

  return db
    .insertInto("user_preferences")
    .values({
      user_id: userId,
      project_id: projectId,
      theme: input.theme,
      accent: input.accent,
      density: input.density,
      sidebar_collapsed: input.sidebar_collapsed,
      pinned_items: JSON.stringify(pinnedItems),
      updated_at: now,
    })
    .onConflict((oc) =>
      oc
        .columns(["user_id", "project_id"])
        .doUpdateSet({
          theme: input.theme,
          accent: input.accent,
          density: input.density,
          sidebar_collapsed: input.sidebar_collapsed,
          pinned_items: JSON.stringify(pinnedItems),
          updated_at: now,
        }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}
