import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import { AppError } from "../shared/errors";
import type { CreateModule, UpdateModule } from "../models/module";

export async function listModules(db: Kysely<Database>, projectId: string) {
  return db
    .selectFrom("modules")
    .selectAll()
    .where("project_id", "=", projectId)
    .orderBy("code", "asc")
    .execute();
}

export async function getModule(db: Kysely<Database>, id: string) {
  const module = await db
    .selectFrom("modules")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!module) {
    throw new AppError("NOT_FOUND", `Module ${id} not found`);
  }

  return module;
}

export async function createModule(
  db: Kysely<Database>,
  projectId: string,
  input: CreateModule,
) {
  return db
    .insertInto("modules")
    .values({ project_id: projectId, ...input })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateModule(
  db: Kysely<Database>,
  id: string,
  input: UpdateModule,
) {
  const module = await db
    .updateTable("modules")
    .set(input)
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();

  if (!module) {
    throw new AppError("NOT_FOUND", `Module ${id} not found`);
  }

  return module;
}

export async function deleteModule(db: Kysely<Database>, id: string) {
  const result = await db
    .deleteFrom("modules")
    .where("id", "=", id)
    .executeTakeFirst();

  if (result.numDeletedRows === BigInt(0)) {
    throw new AppError("NOT_FOUND", `Module ${id} not found`);
  }
}
