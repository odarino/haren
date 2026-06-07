import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  readProgress,
  writeProgress,
  updateModuleStatus,
  updateFeatureStatus,
  type Progress,
} from "../../workspace/progress";

describe("progress", () => {
  let testDir: string;
  let progressPath: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "haren-progress-"));
    progressPath = join(testDir, "progress.json");
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("reads progress.json", async () => {
    const data: Progress = {
      project: "test",
      version: 1,
      modules: {},
      dependencies: {},
    };
    await writeFile(progressPath, JSON.stringify(data));

    const result = await readProgress(progressPath);
    expect(result.project).toBe("test");
    expect(result.modules).toEqual({});
  });

  it("writes progress.json", async () => {
    const data: Progress = {
      project: "test",
      version: 1,
      modules: {
        auth: {
          status: "planned",
          currentPhase: "plan",
          features: {},
          lastCommit: null,
          lastUpdated: "2026-04-04T10:00:00Z",
        },
      },
      dependencies: {},
    };
    await writeProgress(progressPath, data);

    const raw = JSON.parse(await readFile(progressPath, "utf-8"));
    expect(raw.modules.auth.status).toBe("planned");
  });

  it("updates module status with valid transition", async () => {
    const data: Progress = {
      project: "test",
      version: 1,
      modules: {
        auth: {
          status: "planned",
          currentPhase: "plan",
          features: {},
          lastCommit: null,
          lastUpdated: "2026-04-04T10:00:00Z",
        },
      },
      dependencies: {},
    };

    const updated = updateModuleStatus(data, "auth", "implementing");
    expect(updated.modules.auth.status).toBe("implementing");
    expect(updated.modules.auth.currentPhase).toBe("implement");
  });

  it("rejects invalid module status transition", () => {
    const data: Progress = {
      project: "test",
      version: 1,
      modules: {
        auth: {
          status: "discovered",
          currentPhase: "discover",
          features: {},
          lastCommit: null,
          lastUpdated: "2026-04-04T10:00:00Z",
        },
      },
      dependencies: {},
    };

    expect(() => updateModuleStatus(data, "auth", "implementing")).toThrow();
  });

  it("updates feature status", () => {
    const data: Progress = {
      project: "test",
      version: 1,
      modules: {
        auth: {
          status: "implementing",
          currentPhase: "implement",
          features: { "login-flow": "pending" },
          lastCommit: null,
          lastUpdated: "2026-04-04T10:00:00Z",
        },
      },
      dependencies: {},
    };

    const updated = updateFeatureStatus(data, "auth", "login-flow", "in-progress");
    expect(updated.modules.auth.features["login-flow"]).toBe("in-progress");
  });

  it("rejects invalid feature status transition", () => {
    const data: Progress = {
      project: "test",
      version: 1,
      modules: {
        auth: {
          status: "implementing",
          currentPhase: "implement",
          features: { "login-flow": "pending" },
          lastCommit: null,
          lastUpdated: "2026-04-04T10:00:00Z",
        },
      },
      dependencies: {},
    };

    expect(() => updateFeatureStatus(data, "auth", "login-flow", "passing")).toThrow();
  });
});
