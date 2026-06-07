import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("brainstorm-gate hook logic", () => {
  let harenDir: string;

  beforeEach(async () => {
    harenDir = await mkdtemp(join(tmpdir(), "haren-hook-test-"));
    await mkdir(join(harenDir, "artifacts", "02-discovery"), {
      recursive: true,
    });
  });

  afterEach(async () => {
    await rm(harenDir, { recursive: true, force: true });
  });

  // Helper that replicates the hook's decision logic
  async function shouldBlock(harenDir: string): Promise<{ block: boolean; message?: string }> {
    const progressFile = Bun.file(join(harenDir, "progress.json"));
    if (!(await progressFile.exists())) {
      return { block: false };
    }

    const progress = await progressFile.json();
    const modules = progress.modules || {};
    const hasModules = Object.keys(modules).length > 0;

    const advancedPhases = ["planned", "implementing", "evaluating", "completed"];
    const hasAdvancedModule = Object.values(modules).some((m: any) =>
      advancedPhases.includes((m as any).status || (m as any).currentPhase),
    );

    if (hasAdvancedModule) return { block: false };

    try {
      const entries = await Array.fromAsync(
        new Bun.Glob("*.md").scan(join(harenDir, "artifacts", "02-discovery")),
      );
      if (entries.length > 0) return { block: false };
    } catch {}

    if (!hasModules) {
      return { block: true, message: "No brainstorming/discovery done yet." };
    }

    return {
      block: false,
      message: "Warning: No modules have completed planning yet.",
    };
  }

  it("blocks when no modules and no discovery artifacts", async () => {
    await writeFile(
      join(harenDir, "progress.json"),
      JSON.stringify({
        project: "test",
        version: 1,
        phase: "init",
        status: "active",
        modules: {},
        dependencies: {},
      }),
    );

    const result = await shouldBlock(harenDir);
    expect(result.block).toBe(true);
  });

  it("allows when discovery artifacts exist", async () => {
    await writeFile(
      join(harenDir, "progress.json"),
      JSON.stringify({
        project: "test",
        version: 1,
        phase: "init",
        status: "active",
        modules: {},
        dependencies: {},
      }),
    );
    await writeFile(
      join(harenDir, "artifacts", "02-discovery", "context-brief.md"),
      "# Context Brief\n",
    );

    const result = await shouldBlock(harenDir);
    expect(result.block).toBe(false);
  });

  it("allows when a module is in planned phase", async () => {
    await writeFile(
      join(harenDir, "progress.json"),
      JSON.stringify({
        project: "test",
        version: 1,
        phase: "implementing",
        status: "active",
        modules: { auth: { status: "planned" } },
        dependencies: {},
      }),
    );

    const result = await shouldBlock(harenDir);
    expect(result.block).toBe(false);
  });

  it("allows when no progress.json exists", async () => {
    const result = await shouldBlock(harenDir);
    expect(result.block).toBe(false);
  });

  it("warns but allows when modules exist but none are advanced", async () => {
    await writeFile(
      join(harenDir, "progress.json"),
      JSON.stringify({
        project: "test",
        version: 1,
        phase: "init",
        status: "active",
        modules: { auth: { status: "decomposed" } },
        dependencies: {},
      }),
    );

    const result = await shouldBlock(harenDir);
    expect(result.block).toBe(false);
    expect(result.message).toContain("Warning");
  });
});
