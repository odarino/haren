import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import { handleAppError } from "../shared/errors";
import { UpsertPreferenceSchema } from "../models/preference";
import * as svc from "../services/preference-service";

export function preferenceRoutes(db: Kysely<Database>) {
  return {
    "/api/users/:userId/preferences": {
      GET: async (req: Request) => {
        try {
          const userId = (req as any).params.userId;
          const url = new URL(req.url);
          const projectId = url.searchParams.get("projectId") ?? undefined;
          const prefs = await svc.getPreferences(db, userId, projectId);
          return Response.json({ preferences: prefs });
        } catch (err) {
          return handleAppError(err);
        }
      },

      PUT: async (req: Request) => {
        try {
          const userId = (req as any).params.userId;
          const body = await req.json();
          const input = UpsertPreferenceSchema.parse(body);
          const prefs = await svc.upsertPreferences(db, userId, input);
          return Response.json({ preferences: prefs });
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
