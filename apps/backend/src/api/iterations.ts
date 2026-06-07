import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import { handleAppError } from "../shared/errors";
import { CreateIterationSchema, UpdateIterationSchema } from "../models/iteration";
import * as svc from "../services/iteration-service";

export function iterationRoutes(db: Kysely<Database>) {
  return {
    "/api/projects/:projectId/iterations": {
      GET: async (req: Request) => {
        try {
          const projectId = (req as any).params.projectId;
          const iterations = await svc.listIterations(db, projectId);
          return Response.json({ iterations });
        } catch (err) {
          return handleAppError(err);
        }
      },

      POST: async (req: Request) => {
        try {
          const projectId = (req as any).params.projectId;
          const body = await req.json();
          const input = CreateIterationSchema.parse(body);
          const iteration = await svc.createIteration(db, projectId, input);
          return Response.json({ iteration }, { status: 201 });
        } catch (err) {
          if (err instanceof Error && err.name === "ZodError") {
            return Response.json({ error: "Validation error", details: (err as any).errors }, { status: 400 });
          }
          return handleAppError(err);
        }
      },
    },

    "/api/iterations/:id": {
      GET: async (req: Request) => {
        try {
          const id = (req as any).params.id;
          const [iteration, burnup] = await Promise.all([
            svc.getIteration(db, id),
            svc.getBurnup(db, id),
          ]);
          return Response.json({ iteration, burnup });
        } catch (err) {
          return handleAppError(err);
        }
      },

      PATCH: async (req: Request) => {
        try {
          const id = (req as any).params.id;
          const body = await req.json();
          const input = UpdateIterationSchema.parse(body);
          const iteration = await svc.updateIteration(db, id, input);
          return Response.json({ iteration });
        } catch (err) {
          if (err instanceof Error && err.name === "ZodError") {
            return Response.json({ error: "Validation error", details: (err as any).errors }, { status: 400 });
          }
          return handleAppError(err);
        }
      },

      DELETE: async (req: Request) => {
        try {
          const id = (req as any).params.id;
          await svc.deleteIteration(db, id);
          return Response.json({ ok: true });
        } catch (err) {
          return handleAppError(err);
        }
      },
    },
  };
}
