import { describe, test, expect } from "bun:test";
import { buildWsUrl, buildAuthMessage } from "../../agent/connection";

describe("connection helpers", () => {
  test("buildWsUrl converts https to wss", () => {
    expect(buildWsUrl("https://portal.example.com")).toBe("wss://portal.example.com/ws/agent");
  });

  test("buildWsUrl converts http to ws", () => {
    expect(buildWsUrl("http://localhost:3000")).toBe("ws://localhost:3000/ws/agent");
  });

  test("buildAuthMessage returns correct structure", () => {
    const msg = buildAuthMessage({
      teamCode: "ABC123",
      gitRemoteUrl: "git@github.com:test/repo.git",
      projectName: "repo",
      userId: "user-1",
    });
    expect(msg.type).toBe("auth");
    expect((msg as any).teamCode).toBe("ABC123");
  });
});
