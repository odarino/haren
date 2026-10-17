import { describe, expect, it } from "bun:test";
import { applyUpdates } from "../../plugins/updates";
import type { Progress } from "../../workspace/progress";

const progress: Progress = {
  project: "p",
  version: 2,
  dependencies: {},
  modules: {
    checkout: {
      status: "implementing",
      currentPhase: "implement",
      features: { "task-1-add-cart-api": "pending" },
      lastCommit: {},
      lastUpdated: "2026-01-01T00:00:00.000Z",
    },
  },
};

describe("applyUpdates", () => {
  it("applies a valid transition", () => {
    const r = applyUpdates(progress, [
      { module: "checkout", feature: "task-1-add-cart-api", status: "in-progress" },
    ]);
    expect(r.progress.modules.checkout!.features["task-1-add-cart-api"]).toBe("in-progress");
    expect(r.applied).toHaveLength(1);
    expect(r.skipped).toHaveLength(0);
  });
  it("skips an invalid transition with a reason", () => {
    const r = applyUpdates(progress, [
      { module: "checkout", feature: "task-1-add-cart-api", status: "passing" },
    ]);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped[0]!.reason).toContain("Invalid feature transition");
    expect(r.progress).toBe(progress);
  });
  it("skips unknown modules, features, statuses, and extra fields", () => {
    const r = applyUpdates(progress, [
      { module: "nope", feature: "x", status: "pending" },
      { module: "checkout", feature: "task-1-add-cart-api", status: "done" },
      { module: "checkout", feature: "task-1-add-cart-api", status: "in-progress", assignee: "a" },
      "garbage",
    ]);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped).toHaveLength(4);
  });
  it("skips a no-op update silently", () => {
    const r = applyUpdates(progress, [
      { module: "checkout", feature: "task-1-add-cart-api", status: "pending" },
    ]);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped).toHaveLength(0);
  });
});
