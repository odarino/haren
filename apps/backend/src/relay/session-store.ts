import type { ServerWebSocket } from "bun";

export interface AgentSession {
  ws: ServerWebSocket<unknown> | null;
  projectId: string;
  userId: string;
  teamId: string;
  lastHeartbeat: number;
  pendingMessages: string[];
}

export interface BrowserSession {
  ws: ServerWebSocket<unknown>;
  userId: string;
  teamId: string;
}

export class SessionStore {
  private agents = new Map<string, AgentSession>();
  private browsers = new Map<string, BrowserSession>();

  addAgent(sessionId: string, session: AgentSession): void {
    this.agents.set(sessionId, session);
  }

  getAgent(sessionId: string): AgentSession | undefined {
    return this.agents.get(sessionId);
  }

  removeAgent(sessionId: string): void {
    this.agents.delete(sessionId);
  }

  findAgentForUser(userId: string, projectId: string): AgentSession | undefined {
    for (const session of this.agents.values()) {
      if (session.userId === userId && session.projectId === projectId) {
        return session;
      }
    }
    return undefined;
  }

  getAgentsForProject(projectId: string): AgentSession[] {
    return Array.from(this.agents.values()).filter((s) => s.projectId === projectId);
  }

  updateHeartbeat(sessionId: string): void {
    const session = this.agents.get(sessionId);
    if (session) {
      session.lastHeartbeat = Date.now();
    }
  }

  sweepStale(maxAgeMs: number): string[] {
    const now = Date.now();
    const stale: string[] = [];
    for (const [id, session] of this.agents) {
      if (now - session.lastHeartbeat > maxAgeMs) {
        stale.push(id);
        this.agents.delete(id);
      }
    }
    return stale;
  }

  addBrowser(sessionId: string, session: BrowserSession): void {
    this.browsers.set(sessionId, session);
  }

  removeBrowser(sessionId: string): void {
    this.browsers.delete(sessionId);
  }

  getBrowsersForTeam(teamId: string): BrowserSession[] {
    return Array.from(this.browsers.values()).filter((s) => s.teamId === teamId);
  }
}
