import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import { ActivityFiltersSchema, CreateActivitySchema } from "../models/activity";
import * as svc from "../services/activity-service";
import { handleAppError } from "../shared/errors";

export function activityRoutes(db: Kysely<Database>) {
  return {
    "/api/projects/:projectId/activity": {
      GET: async (req: Request) => {
        try {
          const projectId = (req as any).params.projectId;
          const url = new URL(req.url);
          const rawFilters = {
            kind: url.searchParams.get("kind") ?? undefined,
            actor: url.searchParams.get("actor") ?? undefined,
            since: url.searchParams.get("since") ?? undefined,
            limit: url.searchParams.get("limit") ?? undefined,
            offset: url.searchParams.get("offset") ?? undefined,
          };
          const filters = ActivityFiltersSchema.parse(rawFilters);
          const events = await svc.listActivity(db, projectId, filters);
          return Response.json({ events });
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
          const input = CreateActivitySchema.parse(body);
          const event = await svc.createActivity(db, projectId, input);
          return Response.json({ event }, { status: 201 });
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
  };
}
