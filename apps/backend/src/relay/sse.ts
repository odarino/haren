import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import type { SessionStore } from "./session-store";

export function sseRoutes(db: Kysely<Database>, sessions: SessionStore) {
  return {
    "/sse/agent/auth": {
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

    "/sse/agent/stream": {
      GET: (req: Request) => {
        const url = new URL(req.url);
        const sessionId = url.searchParams.get("sessionId");
        const session = sessionId ? sessions.getAgent(sessionId) : null;

        if (!sessionId || !session) {
          return new Response("Invalid session", { status: 401 });
        }

        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode("event: connected\ndata: {}\n\n"));

            const interval = setInterval(() => {
              sessions.updateHeartbeat(sessionId);
              const agent = sessions.getAgent(sessionId);
              if (!agent) {
                clearInterval(interval);
                controller.close();
                return;
              }
              while (agent.pendingMessages.length > 0) {
                const msg = agent.pendingMessages.shift()!;
                controller.enqueue(encoder.encode(`data: ${msg}\n\n`));
              }
            }, 500);

            req.signal.addEventListener("abort", () => {
              clearInterval(interval);
              sessions.removeAgent(sessionId);
            });
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    },

    "/sse/agent/send": {
      POST: async (req: Request) => {
        const url = new URL(req.url);
        const sessionId = url.searchParams.get("sessionId");

        if (!sessionId || !sessions.getAgent(sessionId)) {
          return new Response("Invalid session", { status: 401 });
        }

        await req.json();
        sessions.updateHeartbeat(sessionId);

        return Response.json({ ok: true });
      },
    },
  };
}
