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

  it("keeps a plain object lastCommit with string values and drops other shapes", () => {
    const raw = {
      version: 1,
      modules: {
        ok: { lastCommit: { api: "x" } },
        arr: { lastCommit: ["x"] },
        mixed: { lastCommit: { api: 5 } },
      },
    };
    const { progress } = migrateProgress(raw, () => undefined);
    const m = (progress as { modules: Record<string, { lastCommit: unknown }> }).modules;
    expect(m.ok.lastCommit).toEqual({ api: "x" });
    expect(m.arr.lastCommit).toEqual({});
    expect(m.mixed.lastCommit).toEqual({});
  });

  it("falls back to default when repoKeyFor returns an empty string", () => {
    const raw = { version: 1, modules: { a: { lastCommit: "abc" } } };
    const { progress } = migrateProgress(raw, () => "");
    expect(
      (progress as { modules: Record<string, { lastCommit: unknown }> }).modules.a.lastCommit,
    ).toEqual({
      default: "abc",
    });
  });
});
