import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import { AppError } from "../shared/errors";
import type { CreateArtifact, UpdateArtifact } from "../models/artifact";

export async function listArtifacts(db: Kysely<Database>, projectId: string) {
  return db
    .selectFrom("artifacts")
    .select(["id", "project_id", "path", "kind", "updated_by_user_id", "size_bytes", "updated_at", "created_at"])
    .where("project_id", "=", projectId)
    .orderBy("path", "asc")
    .execute();
}

export async function getArtifact(db: Kysely<Database>, id: string) {
  const artifact = await db
    .selectFrom("artifacts")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!artifact) {
    throw new AppError("NOT_FOUND", `Artifact ${id} not found`);
  }

  return artifact;
}

export async function createArtifact(
  db: Kysely<Database>,
  projectId: string,
  input: CreateArtifact,
) {
  const size_bytes = Buffer.byteLength(input.body ?? "", "utf8");
  const now = new Date();

  return db
    .insertInto("artifacts")
    .values({
      project_id: projectId,
      path: input.path,
      kind: input.kind,
      body: input.body ?? "",
      updated_by_user_id: input.updated_by_user_id ?? null,
      size_bytes,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateArtifact(
  db: Kysely<Database>,
  id: string,
  input: UpdateArtifact,
) {
  const updates: Record<string, unknown> = { ...input };

  if (input.body !== undefined) {
    updates.size_bytes = Buffer.byteLength(input.body, "utf8");
  }
  updates.updated_at = new Date();

  const artifact = await db
    .updateTable("artifacts")
    .set(updates)
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();

  if (!artifact) {
    throw new AppError("NOT_FOUND", `Artifact ${id} not found`);
  }

  return artifact;
}

export async function deleteArtifact(db: Kysely<Database>, id: string) {
  const result = await db
    .deleteFrom("artifacts")
    .where("id", "=", id)
    .executeTakeFirst();

  if (result.numDeletedRows === BigInt(0)) {
    throw new AppError("NOT_FOUND", `Artifact ${id} not found`);
  }
}
