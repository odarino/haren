import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import { AppError } from "../shared/errors";
import type { CreateIteration, UpdateIteration } from "../models/iteration";

export async function listIterations(db: Kysely<Database>, projectId: string) {
  return db
    .selectFrom("iterations")
    .selectAll()
    .where("project_id", "=", projectId)
    .orderBy("start_date", "asc")
    .execute();
}

export async function getIteration(db: Kysely<Database>, id: string) {
  const iteration = await db
    .selectFrom("iterations")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!iteration) {
    throw new AppError("NOT_FOUND", `Iteration ${id} not found`);
  }

  return iteration;
}

export async function createIteration(
  db: Kysely<Database>,
  projectId: string,
  input: CreateIteration,
) {
  return db
    .insertInto("iterations")
    .values({ project_id: projectId, ...input })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateIteration(
  db: Kysely<Database>,
  id: string,
  input: UpdateIteration,
) {
  const iteration = await db
    .updateTable("iterations")
    .set(input)
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();

  if (!iteration) {
    throw new AppError("NOT_FOUND", `Iteration ${id} not found`);
  }

  return iteration;
}

export async function deleteIteration(db: Kysely<Database>, id: string) {
  const result = await db
    .deleteFrom("iterations")
    .where("id", "=", id)
    .executeTakeFirst();

  if (result.numDeletedRows === BigInt(0)) {
    throw new AppError("NOT_FOUND", `Iteration ${id} not found`);
  }
}

export async function getBurnup(db: Kysely<Database>, iterationId: string) {
  return db
    .selectFrom("velocity_snapshots")
    .selectAll()
    .where("iteration_id", "=", iterationId)
    .orderBy("snapshot_date", "asc")
    .execute();
}

export async function recordSnapshot(
  db: Kysely<Database>,
  iterationId: string,
  date: string,
  pointsDone: number,
  scope: number,
) {
  return db
    .insertInto("velocity_snapshots")
    .values({
      iteration_id: iterationId,
      snapshot_date: new Date(date),
      points_done: pointsDone,
      scope,
    })
    .onConflict((oc) =>
      oc.columns(["iteration_id", "snapshot_date"]).doUpdateSet({
        points_done: pointsDone,
        scope,
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}
