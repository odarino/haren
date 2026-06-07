import type { ServerWebSocket } from "bun";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import type { AgentMessage, BrowserMessage, ServerToAgentMessage } from "@haren/shared";
import type { SessionStore } from "./session-store";

// Track pending data requests so we can include path in responses
const pendingRequests = new Map<string, { path: string; browserSessionId: string }>();

export interface WsData {
  role: "agent" | "browser";
  sessionId: string;
  authenticated: boolean;
}

export function createWsHandler(db: Kysely<Database>, sessions: SessionStore) {
  return {
    open(ws: ServerWebSocket<WsData>) {
      ws.data.authenticated = false;
    },

    async message(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
      const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());

      if (ws.data.role === "agent") {
        await handleAgentMessage(ws, msg, db, sessions);
      } else if (ws.data.role === "browser") {
        await handleBrowserMessage(ws, msg, db, sessions);
      }
    },

    close(ws: ServerWebSocket<WsData>) {
      if (ws.data.role === "agent" && ws.data.sessionId) {
        sessions.removeAgent(ws.data.sessionId);
      } else if (ws.data.role === "browser" && ws.data.sessionId) {
        sessions.removeBrowser(ws.data.sessionId);
      }
    },
  };
}

async function handleAgentMessage(
  ws: ServerWebSocket<WsData>,
  msg: AgentMessage,
  db: Kysely<Database>,
  sessions: SessionStore,
): Promise<void> {
  if (msg.type === "auth") {
    const team = await db
      .selectFrom("teams")
      .selectAll()
      .where("code", "=", msg.teamCode)
      .executeTakeFirst();

    if (!team) {
      const reply: ServerToAgentMessage = {
        type: "auth-fail",
        reason: "Invalid team code",
      };
      ws.send(JSON.stringify(reply));
      return;
    }

    let project = await db
      .selectFrom("projects")
      .selectAll()
      .where("team_id", "=", team.id)
      .where("git_remote_url", "=", msg.gitRemoteUrl)
      .executeTakeFirst();

    if (!project) {
      project = await db
        .insertInto("projects")
        .values({
          team_id: team.id,
          git_remote_url: msg.gitRemoteUrl,
          name: msg.projectName,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    const sessionId = crypto.randomUUID();
    ws.data.sessionId = sessionId;
    ws.data.authenticated = true;

    sessions.addAgent(sessionId, {
      ws: ws as any,
      projectId: project.id,
      userId: msg.userId,
      teamId: team.id,
      lastHeartbeat: Date.now(),
      pendingMessages: [],
    });

    const reply: ServerToAgentMessage = { type: "auth-ok", sessionId };
    ws.send(JSON.stringify(reply));
    return;
  }

  if (!ws.data.authenticated) {
    ws.send(JSON.stringify({ type: "auth-fail", reason: "Not authenticated" }));
    return;
  }

  if (msg.type === "heartbeat") {
    sessions.updateHeartbeat(ws.data.sessionId);
    return;
  }

  if (msg.type === "data-response") {
    const pending = pendingRequests.get(msg.requestId);
    pendingRequests.delete(msg.requestId);
    const session = sessions.getAgent(ws.data.sessionId);
    if (session) {
      // Include the original path so browser knows what this response is for
      const payload = JSON.stringify({ ...msg, path: pending?.path });
      const browsers = sessions.getBrowsersForTeam(session.teamId);
      for (const browser of browsers) {
        browser.ws.send(payload);
      }
    }
    return;
  }

  if (msg.type === "command-output") {
    const session = sessions.getAgent(ws.data.sessionId);
    if (session) {
      const payload = JSON.stringify(msg);
      const browsers = sessions.getBrowsersForTeam(session.teamId);
      for (const browser of browsers) {
        browser.ws.send(payload);
      }
    }
    return;
  }

  if (msg.type === "command-event") {
    const session = sessions.getAgent(ws.data.sessionId);
    if (session) {
      const payload = JSON.stringify(msg);
      const browsers = sessions.getBrowsersForTeam(session.teamId);
      for (const browser of browsers) {
        browser.ws.send(payload);
      }
    }
    return;
  }
}

async function handleBrowserMessage(
  ws: ServerWebSocket<WsData>,
  msg: BrowserMessage,
  db: Kysely<Database>,
  sessions: SessionStore,
): Promise<void> {
  if (msg.type === "subscribe") {
    const sessionId = crypto.randomUUID();
    ws.data.sessionId = sessionId;
    ws.data.authenticated = true;

    sessions.addBrowser(sessionId, {
      ws: ws as any,
      userId: msg.userId,
      teamId: msg.teamId,
    });

    const projects = await db
      .selectFrom("projects")
      .selectAll()
      .where("team_id", "=", msg.teamId)
      .execute();

    const projectsWithStatus = projects.map((p) => ({
      id: p.id,
      name: p.name,
      agentOnline: sessions.getAgentsForProject(p.id).length > 0,
    }));

    ws.send(
      JSON.stringify({
        type: "subscribed",
        projects: projectsWithStatus,
      }),
    );
    return;
  }

  if (msg.type === "data-request") {
    // Data requests are read-only — route to any online agent for this project
    const agent =
      sessions.findAgentForUser(msg.userId, msg.projectId) ??
      sessions.getAgentsForProject(msg.projectId)[0];
    if (agent?.ws) {
      const requestId = crypto.randomUUID();
      // Store path so we can include it when relaying the response back
      pendingRequests.set(requestId, {
        path: msg.path,
        browserSessionId: ws.data.sessionId,
      });
      agent.ws.send(JSON.stringify({ type: "data-request", requestId, path: msg.path }));
    }
    return;
  }

  if (msg.type === "command") {
    const agent =
      sessions.findAgentForUser(msg.userId, msg.projectId) ??
      sessions.getAgentsForProject(msg.projectId)[0];
    if (agent?.ws) {
      const commandId = crypto.randomUUID();
      agent.ws.send(
        JSON.stringify({
          type: "command",
          commandId,
          prompt: msg.prompt,
          cli: msg.cli,
        }),
      );
    }
    return;
  }
}
