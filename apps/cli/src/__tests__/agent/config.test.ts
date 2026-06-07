import { describe, test, expect, afterEach } from "bun:test";
import { readAgentConfig, writeAgentConfig, type AgentConfig } from "../../agent/config";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("AgentConfig", () => {
  let testDir: string;

  afterEach(async () => {
    if (testDir) await rm(testDir, { recursive: true, force: true });
  });

  test("returns null when no config exists", async () => {
    testDir = await mkdtemp(join(tmpdir(), "agent-config-"));
    const config = await readAgentConfig(testDir);
    expect(config).toBeNull();
  });

  test("writes and reads config", async () => {
    testDir = await mkdtemp(join(tmpdir(), "agent-config-"));
    const config: AgentConfig = {
      portalUrl: "https://portal.example.com",
      teamCode: "ABC123",
      userId: "user-1",
      userName: "Phung",
    };

    await writeAgentConfig(testDir, config);
    const read = await readAgentConfig(testDir);
    expect(read).toEqual(config);
  });

  test("writes config to .agent.json", async () => {
    testDir = await mkdtemp(join(tmpdir(), "agent-config-"));
    await writeAgentConfig(testDir, {
      portalUrl: "https://portal.example.com",
      teamCode: "ABC123",
      userId: "user-1",
      userName: "Phung",
    });

    const file = Bun.file(join(testDir, ".agent.json"));
    expect(await file.exists()).toBe(true);
  });
});
