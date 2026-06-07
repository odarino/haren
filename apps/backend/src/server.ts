import { healthRoutes } from "./api/health";
import { teamRoutes } from "./api/teams";
import { projectRoutes } from "./api/projects";
import { createDb } from "./db/connection";
import { runMigrations } from "./db/migrate";
import { createWsHandler, type WsData } from "./relay/ws";
import { SessionStore } from "./relay/session-store";
import { sseRoutes } from "./relay/sse";
import { pollingRoutes } from "./relay/polling";
import { jiraRoutes } from "./api/jira";
import { moduleRoutes } from "./api/modules";
import { progressRoutes } from "./api/progress";
import { iterationRoutes } from "./api/iterations";
import { taskRoutes } from "./api/tasks";
import { artifactRoutes } from "./api/artifacts";
import { activityRoutes } from "./api/activity";
import { preferenceRoutes } from "./api/preferences";
import { config } from "./config";

const db = createDb();
await runMigrations(db);

const sessions = new SessionStore();
const wsHandler = createWsHandler(db, sessions);

setInterval(() => {
  const stale = sessions.sweepStale(config.agent.staleTimeoutMs);
  if (stale.length > 0) {
    console.log(`Swept ${stale.length} stale agent session(s)`);
  }
}, config.agent.sweepIntervalMs);

const server = Bun.serve<WsData>({
  port: config.port,
  routes: {
    ...healthRoutes,
    ...teamRoutes(db),
    ...projectRoutes(db),
    ...sseRoutes(db, sessions),
    ...pollingRoutes(db, sessions),
    ...jiraRoutes(db),
    ...moduleRoutes(db),
    ...progressRoutes(db),
    ...iterationRoutes(db),
    ...taskRoutes(db),
    ...artifactRoutes(db),
    ...activityRoutes(db),
    ...preferenceRoutes(db),
  },
  websocket: wsHandler,
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws/agent") {
      const upgraded = server.upgrade(req, {
        data: {
          role: "agent" as const,
          sessionId: "",
          authenticated: false,
        },
      });
      return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (url.pathname === "/ws/browser") {
      const upgraded = server.upgrade(req, {
        data: {
          role: "browser" as const,
          sessionId: "",
          authenticated: false,
        },
      });
      return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Haren Portal running on http://localhost:${server.port}`);
