import type { Kysely } from "kysely";
import type { Database } from "../db/schema";

export function projectRoutes(db: Kysely<Database>) {
  return {
    "/api/projects/register": {
      POST: async (req: Request) => {
        const { teamId, gitRemoteUrl, name } = await req.json();
        if (!teamId || !gitRemoteUrl || !name) {
          return Response.json(
            { error: "teamId, gitRemoteUrl, and name required" },
            { status: 400 },
          );
        }

        const existing = await db
          .selectFrom("projects")
          .selectAll()
          .where("team_id", "=", teamId)
          .where("git_remote_url", "=", gitRemoteUrl)
          .executeTakeFirst();

        if (existing) {
          return Response.json(
            {
              error: "Project with this git remote already registered in this team",
            },
            { status: 409 },
          );
        }

        const project = await db
          .insertInto("projects")
          .values({
            team_id: teamId,
            git_remote_url: gitRemoteUrl,
            name,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        return Response.json({ project }, { status: 201 });
      },
    },

    "/api/projects": {
      GET: async (req: Request) => {
        const url = new URL(req.url);
        const teamId = url.searchParams.get("teamId");
        if (!teamId) {
          return Response.json({ error: "teamId query param required" }, { status: 400 });
        }

        const projects = await db
          .selectFrom("projects")
          .selectAll()
          .where("team_id", "=", teamId)
          .orderBy("registered_at", "desc")
          .execute();

        return Response.json({ projects });
      },
    },
  };
}
