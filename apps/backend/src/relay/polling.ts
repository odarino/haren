import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import type { SessionStore } from "./session-store";

export function pollingRoutes(db: Kysely<Database>, sessions: SessionStore) {
  return {
    "/poll/agent/auth": {
      POST: async (req: Request) => {
        const { teamCode, gitRemoteUrl, projectName, userId } = await req.json();

        const team = await db
          .selectFrom("teams")
          .selectAll()
          .where("code", "=", teamCode)
          .executeTakeFirst();

        if (!team) {
          return Response.json({ error: "Invalid team code" }, { status: 401 });
        }

        let project = await db
          .selectFrom("projects")
          .selectAll()
          .where("team_id", "=", team.id)
          .where("git_remote_url", "=", gitRemoteUrl)
          .executeTakeFirst();

        if (!project) {
          project = await db
            .insertInto("projects")
            .values({
              team_id: team.id,
              git_remote_url: gitRemoteUrl,
              name: projectName,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
        }

        const sessionId = crypto.randomUUID();

        sessions.addAgent(sessionId, {
          ws: null,
          projectId: project.id,
          userId,
          teamId: team.id,
          lastHeartbeat: Date.now(),
          pendingMessages: [],
        });

        return Response.json({ sessionId });
      },
    },

    "/poll/agent/messages": {
      GET: (req: Request) => {
        const url = new URL(req.url);
        const sessionId = url.searchParams.get("sessionId");
        const session = sessionId ? sessions.getAgent(sessionId) : null;

        if (!sessionId || !session) {
          return new Response("Invalid session", { status: 401 });
        }

        sessions.updateHeartbeat(sessionId);
        const batch = session.pendingMessages.splice(0, session.pendingMessages.length);

        return Response.json({ messages: batch });
      },
    },

    "/poll/agent/send": {
      POST: async (req: Request) => {
        const url = new URL(req.url);
        const sessionId = url.searchParams.get("sessionId");

        if (!sessionId || !sessions.getAgent(sessionId)) {
          return new Response("Invalid session", { status: 401 });
        }

        sessions.updateHeartbeat(sessionId);
        await req.json();

        return Response.json({ ok: true });
      },
    },
  };
}
