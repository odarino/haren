import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import { handleAppError } from "../shared/errors";
import { CreateModuleSchema, UpdateModuleSchema } from "../models/module";
import * as svc from "../services/module-service";

export function moduleRoutes(db: Kysely<Database>) {
  return {
    "/api/projects/:projectId/modules": {
      GET: async (req: Request) => {
        try {
          const projectId = (req as any).params.projectId;
          const modules = await svc.listModules(db, projectId);
          return Response.json({ modules });
        } catch (err) {
          return handleAppError(err);
        }
      },

      POST: async (req: Request) => {
        try {
          const projectId = (req as any).params.projectId;
          const body = await req.json();
          const input = CreateModuleSchema.parse(body);
          const module = await svc.createModule(db, projectId, input);
          return Response.json({ module }, { status: 201 });
        } catch (err) {
          if (err instanceof Error && err.name === "ZodError") {
            return Response.json({ error: "Validation error", details: (err as any).errors }, { status: 400 });
          }
          return handleAppError(err);
        }
      },
    },

    "/api/modules/:id": {
      PATCH: async (req: Request) => {
        try {
          const id = (req as any).params.id;
          const body = await req.json();
          const input = UpdateModuleSchema.parse(body);
          const module = await svc.updateModule(db, id, input);
          return Response.json({ module });
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
          await svc.deleteModule(db, id);
          return Response.json({ ok: true });
        } catch (err) {
          return handleAppError(err);
        }
      },
    },
  };
}
