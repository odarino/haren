import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import { handleAppError } from "../shared/errors";
import { CreateArtifactSchema, UpdateArtifactSchema } from "../models/artifact";
import * as svc from "../services/artifact-service";

export function artifactRoutes(db: Kysely<Database>) {
  return {
    "/api/projects/:projectId/artifacts": {
      GET: async (req: Request) => {
        try {
          const projectId = (req as any).params.projectId;
          const artifacts = await svc.listArtifacts(db, projectId);
          return Response.json({ artifacts });
        } catch (err) {
          return handleAppError(err);
        }
      },

      POST: async (req: Request) => {
        try {
          const projectId = (req as any).params.projectId;
          const body = await req.json();
          const input = CreateArtifactSchema.parse(body);
          const artifact = await svc.createArtifact(db, projectId, input);
          return Response.json({ artifact }, { status: 201 });
        } catch (err) {
          if (err instanceof Error && err.name === "ZodError") {
            return Response.json({ error: "Validation error", details: (err as any).errors }, { status: 400 });
          }
          return handleAppError(err);
        }
      },
    },

    "/api/artifacts/:id": {
      GET: async (req: Request) => {
        try {
          const id = (req as any).params.id;
          const artifact = await svc.getArtifact(db, id);
          return Response.json({ artifact });
        } catch (err) {
          return handleAppError(err);
        }
      },

      PATCH: async (req: Request) => {
        try {
          const id = (req as any).params.id;
          const body = await req.json();
          const input = UpdateArtifactSchema.parse(body);
          const artifact = await svc.updateArtifact(db, id, input);
          return Response.json({ artifact });
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
          await svc.deleteArtifact(db, id);
          return Response.json({ ok: true });
        } catch (err) {
          return handleAppError(err);
        }
      },
    },
  };
}
