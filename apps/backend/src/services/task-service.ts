import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import { AppError } from "../shared/errors";
import type { CreateTask, UpdateTask, TaskFilters } from "../models/task";

export async function listTasks(
  db: Kysely<Database>,
  projectId: string,
  filters: TaskFilters,
) {
  let query = db
    .selectFrom("tasks")
    .selectAll()
    .where("project_id", "=", projectId);

  if (filters.module) {
    query = query.where("module_id", "=", filters.module);
  }

  if (filters.iteration) {
    query = query.where("iteration_id", "=", filters.iteration);
  }

  if (filters.status) {
    query = query.where("status", "=", filters.status);
  }

  if (filters.priority) {
    query = query.where("priority", "=", filters.priority);
  }

  return query
    .orderBy("created_at", "desc")
    .limit(filters.limit)
    .offset(filters.offset)
    .execute();
}

export async function getTask(db: Kysely<Database>, id: string) {
  const task = await db
    .selectFrom("tasks")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!task) {
    throw new AppError("NOT_FOUND", `Task ${id} not found`);
  }

  return task;
}

export async function createTask(
  db: Kysely<Database>,
  projectId: string,
  input: CreateTask,
) {
  const opened_at = input.opened_at ?? new Date().toISOString().slice(0, 10);

  return db
    .insertInto("tasks")
    .values({
      project_id: projectId,
      ...input,
      opened_at: new Date(opened_at),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateTask(
  db: Kysely<Database>,
  id: string,
  input: UpdateTask,
) {
  const values: Record<string, unknown> = { ...input };

  if (input.opened_at) {
    values.opened_at = new Date(input.opened_at);
  }

  const task = await db
    .updateTable("tasks")
    .set(values)
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();

  if (!task) {
    throw new AppError("NOT_FOUND", `Task ${id} not found`);
  }

  return task;
}

export async function deleteTask(db: Kysely<Database>, id: string) {
  const result = await db
    .deleteFrom("tasks")
    .where("id", "=", id)
    .executeTakeFirst();

  if (result.numDeletedRows === BigInt(0)) {
    throw new AppError("NOT_FOUND", `Task ${id} not found`);
  }
}

export interface NLContext {
  modules?: string[];
  assignees?: string[];
}

export interface ParsedTask {
  title?: string;
  priority?: string;
  points?: number;
  module?: string;
  assignee?: string;
  status?: string;
}

export function parseNaturalLanguage(text: string, context: NLContext = {}): ParsedTask {
  let remaining = text;
  const result: ParsedTask = {};

  // Extract priority: p1/p2/p3 or named
  const priorityMatch = remaining.match(/\b(p[123])\b/i);
  if (priorityMatch) {
    result.priority = priorityMatch[1].toLowerCase();
    remaining = remaining.replace(priorityMatch[0], "");
  } else {
    const namedPriority = remaining.match(/\b(urgent|critical|high|low)\b/i);
    if (namedPriority) {
      const map: Record<string, string> = {
        urgent: "p1",
        critical: "p1",
        high: "p2",
        low: "p3",
      };
      result.priority = map[namedPriority[1].toLowerCase()];
      remaining = remaining.replace(namedPriority[0], "");
    }
  }

  // Extract points: "~Xpts", "~X", "Xpts", "X pts"
  const pointsMatch = remaining.match(/~?(\d+)\s*pts?\b/i);
  if (pointsMatch) {
    result.points = parseInt(pointsMatch[1], 10);
    remaining = remaining.replace(pointsMatch[0], "");
  } else {
    const tildeMatch = remaining.match(/~(\d+)\b/);
    if (tildeMatch) {
      result.points = parseInt(tildeMatch[1], 10);
      remaining = remaining.replace(tildeMatch[0], "");
    }
  }

  // Extract module: "M-0X" pattern
  const moduleMatch = remaining.match(/\bM-\d+\b/i);
  if (moduleMatch) {
    result.module = moduleMatch[0];
    remaining = remaining.replace(moduleMatch[0], "");
  }

  // Extract assignee: "@name"
  const assigneeMatch = remaining.match(/@([\w.]+)/);
  if (assigneeMatch) {
    result.assignee = assigneeMatch[1];
    remaining = remaining.replace(assigneeMatch[0], "");
  }

  // Extract status keywords
  const statusMatch = remaining.match(/\b(blocked|in review|in progress)\b/i);
  if (statusMatch) {
    result.status = statusMatch[1].toLowerCase();
    remaining = remaining.replace(statusMatch[0], "");
  }

  // Clean up remaining text as title
  const title = remaining
    .replace(/,/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (title) {
    result.title = title;
  }

  return result;
}
