import { describe, test, expect, beforeEach } from "bun:test";
import { SessionStore } from "../../src/relay/session-store";

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore();
  });

  test("registers and retrieves an agent session", () => {
    const ws = {} as any;
    store.addAgent("session-1", {
      ws,
      projectId: "proj-1",
      userId: "user-1",
      teamId: "team-1",
      lastHeartbeat: Date.now(),
      pendingMessages: [],
    });

    const agent = store.getAgent("session-1");
    expect(agent).toBeDefined();
    expect(agent!.projectId).toBe("proj-1");
  });

  test("finds agent by userId and projectId", () => {
    const ws = {} as any;
    store.addAgent("s1", {
      ws,
      projectId: "proj-1",
      userId: "user-1",
      teamId: "team-1",
      lastHeartbeat: Date.now(),
      pendingMessages: [],
    });

    const agent = store.findAgentForUser("user-1", "proj-1");
    expect(agent).toBeDefined();
    expect(agent!.ws).toBe(ws);
  });

  test("returns undefined for unknown user/project", () => {
    const agent = store.findAgentForUser("nobody", "proj-1");
    expect(agent).toBeUndefined();
  });

  test("removes agent session", () => {
    store.addAgent("s1", {
      ws: {} as any,
      projectId: "proj-1",
      userId: "user-1",
      teamId: "team-1",
      lastHeartbeat: Date.now(),
      pendingMessages: [],
    });
    store.removeAgent("s1");
    expect(store.getAgent("s1")).toBeUndefined();
  });

  test("lists online agents for a project", () => {
    store.addAgent("s1", {
      ws: {} as any,
      projectId: "proj-1",
      userId: "user-1",
      teamId: "team-1",
      lastHeartbeat: Date.now(),
      pendingMessages: [],
    });
    store.addAgent("s2", {
      ws: {} as any,
      projectId: "proj-1",
      userId: "user-2",
      teamId: "team-1",
      lastHeartbeat: Date.now(),
      pendingMessages: [],
    });

    const agents = store.getAgentsForProject("proj-1");
    expect(agents.length).toBe(2);
  });

  test("sweeps stale sessions", () => {
    store.addAgent("stale", {
      ws: {} as any,
      projectId: "proj-1",
      userId: "user-1",
      teamId: "team-1",
      lastHeartbeat: Date.now() - 100_000,
      pendingMessages: [],
    });
    store.addAgent("fresh", {
      ws: {} as any,
      projectId: "proj-1",
      userId: "user-2",
      teamId: "team-1",
      lastHeartbeat: Date.now(),
      pendingMessages: [],
    });

    const staleIds = store.sweepStale(90_000);
    expect(staleIds).toContain("stale");
    expect(store.getAgent("stale")).toBeUndefined();
    expect(store.getAgent("fresh")).toBeDefined();
  });
});
