import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import { handleAppError } from "../shared/errors";
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  TaskFiltersSchema,
} from "../models/task";
import * as svc from "../services/task-service";

export function taskRoutes(db: Kysely<Database>) {
  return {
    "/api/projects/:projectId/tasks": {
      GET: async (req: Request) => {
        try {
          const projectId = (req as any).params.projectId;
          const url = new URL(req.url);
          const rawFilters = {
            module: url.searchParams.get("module") ?? undefined,
            iteration: url.searchParams.get("iteration") ?? undefined,
            status: url.searchParams.get("status") ?? undefined,
            priority: url.searchParams.get("priority") ?? undefined,
            limit: url.searchParams.get("limit") ?? undefined,
            offset: url.searchParams.get("offset") ?? undefined,
          };
          const filters = TaskFiltersSchema.parse(rawFilters);
          const tasks = await svc.listTasks(db, projectId, filters);
          return Response.json({ tasks });
        } catch (err) {
          if (err instanceof Error && err.name === "ZodError") {
            return Response.json(
              { error: "Validation error", details: (err as any).errors },
              { status: 400 },
            );
          }
          return handleAppError(err);
        }
      },

      POST: async (req: Request) => {
        try {
          const projectId = (req as any).params.projectId;
          const body = await req.json();
          const input = CreateTaskSchema.parse(body);
          const task = await svc.createTask(db, projectId, input);
          return Response.json({ task }, { status: 201 });
        } catch (err) {
          if (err instanceof Error && err.name === "ZodError") {
            return Response.json(
              { error: "Validation error", details: (err as any).errors },
              { status: 400 },
            );
          }
          return handleAppError(err);
        }
      },
    },

    "/api/projects/:projectId/tasks/parse-nl": {
      POST: async (req: Request) => {
        try {
          const body = await req.json();
          const { text, modules, assignees } = body as {
            text: string;
            modules?: string[];
            assignees?: string[];
          };
          if (!text || typeof text !== "string") {
            return Response.json({ error: "text is required" }, { status: 400 });
          }
          const parsed = svc.parseNaturalLanguage(text, { modules, assignees });
          return Response.json({ parsed });
        } catch (err) {
          return handleAppError(err);
        }
      },
    },

    "/api/tasks/:id": {
      GET: async (req: Request) => {
        try {
          const id = (req as any).params.id;
          const task = await svc.getTask(db, id);
          return Response.json({ task });
        } catch (err) {
          return handleAppError(err);
        }
      },

      PATCH: async (req: Request) => {
        try {
          const id = (req as any).params.id;
          const body = await req.json();
          const input = UpdateTaskSchema.parse(body);
          const task = await svc.updateTask(db, id, input);
          return Response.json({ task });
        } catch (err) {
          if (err instanceof Error && err.name === "ZodError") {
            return Response.json(
              { error: "Validation error", details: (err as any).errors },
              { status: 400 },
            );
          }
          return handleAppError(err);
        }
      },

      DELETE: async (req: Request) => {
        try {
          const id = (req as any).params.id;
          await svc.deleteTask(db, id);
          return Response.json({ ok: true });
        } catch (err) {
          return handleAppError(err);
        }
      },
    },
  };
}
