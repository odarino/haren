import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import { getProgress } from "../services/progress-service";

export function progressRoutes(db: Kysely<Database>) {
  return {
    "/api/projects/:projectId/progress": {
      GET: async (req: Request) => {
        const projectId = (req as any).params.projectId;
        const result = await getProgress(db, projectId);
        return Response.json(result);
      },
    },
  };
}
