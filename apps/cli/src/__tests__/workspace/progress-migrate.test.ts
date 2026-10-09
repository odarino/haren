import { describe, it, expect } from "bun:test";
import { migrateProgress, PROGRESS_VERSION } from "../../workspace/progress";

describe("migrateProgress", () => {
  const v1 = {
    project: "shop",
    version: 1,
    modules: {
      checkout: { status: "implementing", lastCommit: "abc123" },
      auth: { status: "planned", lastCommit: null },
      cart: { status: "planned", lastCommit: "def456" },
    },
    dependencies: {},
  };

  it("converts lastCommit to a per-repo map and bumps the version", () => {
    const { progress, changed } = migrateProgress(v1, (m) =>
      m === "checkout" ? "backend" : undefined,
    );
    const p = progress as { version: number; modules: Record<string, { lastCommit: unknown }> };
    expect(changed).toBe(true);
    expect(p.version).toBe(PROGRESS_VERSION);
    expect(p.modules.checkout.lastCommit).toEqual({ backend: "abc123" });
    expect(p.modules.auth.lastCommit).toEqual({});
    expect(p.modules.cart.lastCommit).toEqual({ default: "def456" });
  });

  it("leaves a v2 file unchanged", () => {
    const v2 = { version: 2, modules: { a: { lastCommit: { api: "x" } } } };
    expect(migrateProgress(v2, () => "api")).toEqual({ progress: v2, changed: false });
  });
});
