import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readdir, readFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { scaffoldWorkspace } from "../../commands/init";

describe("scaffoldWorkspace", () => {
  let parentDir: string;
  let testDir: string;

  beforeEach(async () => {
    parentDir = await mkdtemp(join(tmpdir(), "haren-test-"));
    testDir = join(parentDir, "haren");
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(parentDir, { recursive: true, force: true });
  });

  it("creates the full directory structure", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test-project",
      mode: "blueprint",
      language: "English",
    });

    const expectedDirs = [
      "agents",
      "skills",
      "skills/research",
      "skills/discover",
      "skills/decompose",
      "skills/plan",
      "skills/implement",
      "skills/evaluate",
      "skills/read-context",
      "skills/create-artifact",
      "skills/validate-artifact",
      "skills/search-artifact",
      "skills/resolve-next-id",
      "skills/update-links",
      "skills/update-tracking",
      "artifacts",
      "artifacts/_registry",
      "artifacts/00-baseline",
      "artifacts/01-research",
      "artifacts/02-discovery",
      "artifacts/03-modules",
      "artifacts/04-plans",
      "artifacts/05-implementation",
      "artifacts/06-evaluation",
      "events",
      "templates",
    ];

    for (const dir of expectedDirs) {
      const entries = await readdir(join(testDir, dir)).catch(() => null);
      expect(entries).not.toBeNull();
    }
  });

  it("creates manifest.yaml with project name and mode", async () => {
    await scaffoldWorkspace(testDir, {
      project: "my-app",
      mode: "explore",
      language: "English",
    });

    const manifest = await readFile(join(testDir, "manifest.yaml"), "utf-8");
    expect(manifest).toContain("project: my-app");
    expect(manifest).toContain("mode: explore");
  });

  it("creates empty progress.json", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
    });

    const progress = JSON.parse(await readFile(join(testDir, "progress.json"), "utf-8"));
    expect(progress.project).toBe("test");
    expect(progress.phase).toBe("init");
    expect(progress.status).toBe("active");
    expect(progress.modules).toEqual({});
    expect(progress.dependencies).toEqual({});
  });

  it("creates skill.md entry point", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
    });

    const skillMd = await readFile(join(testDir, "skill.md"), "utf-8");
    expect(skillMd).toContain("Available Actions");
    expect(skillMd).toContain("dispatch");
  });

  it("creates all agent files", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
    });

    const agents = ["researcher", "architect", "planner", "developer", "reviewer", "feedback"];
    for (const agent of agents) {
      const exists = await Bun.file(join(testDir, "agents", `${agent}.md`)).exists();
      expect(exists).toBe(true);
    }
  });

  it("creates FEEDBACK.md", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
    });

    const feedback = await readFile(join(testDir, "FEEDBACK.md"), "utf-8");
    expect(feedback).toContain("Feedback");
  });

  it("copies skill files from content directory", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
    });

    const discoverSkill = await readFile(join(testDir, "skills", "discover", "SKILL.md"), "utf-8");
    expect(discoverSkill).toContain("name: discover");
  });

  it("creates artifact-index.md", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
    });

    const index = await readFile(
      join(testDir, "artifacts", "_registry", "artifact-index.md"),
      "utf-8",
    );
    expect(index).toContain("Artifact Index");
  });

  it("creates manifest.yaml with iterations block when iterations enabled", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
      iterations: {
        enabled: true,
        duration: "2 weeks",
        startDate: "2026-04-08",
        demoDay: "Friday",
      },
    });

    const manifest = await readFile(join(testDir, "manifest.yaml"), "utf-8");
    expect(manifest).toContain("iterations:");
    expect(manifest).toContain("  enabled: true");
    expect(manifest).toContain("  duration: 2 weeks");
    expect(manifest).toContain("  start_date: 2026-04-08");
    expect(manifest).toContain("  demo_day: Friday");
  });

  it("does not write iterations block when iterations disabled", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
    });

    const manifest = await readFile(join(testDir, "manifest.yaml"), "utf-8");
    expect(manifest).not.toContain("iterations:");
  });

  it("adds currentIteration to progress.json when iterations enabled", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
      iterations: {
        enabled: true,
        duration: "2 weeks",
        startDate: "2026-04-08",
        demoDay: "Friday",
      },
    });

    const progress = JSON.parse(await readFile(join(testDir, "progress.json"), "utf-8"));
    expect(progress.currentIteration).toBe(1);
  });

  it("does not add currentIteration to progress.json when iterations disabled", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
    });

    const progress = JSON.parse(await readFile(join(testDir, "progress.json"), "utf-8"));
    expect(progress.currentIteration).toBeUndefined();
  });

  it("creates 07-iterations directory when iterations enabled", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
      iterations: {
        enabled: true,
        duration: "2 weeks",
        startDate: "2026-04-08",
        demoDay: "Friday",
      },
    });

    const entries = await readdir(join(testDir, "artifacts", "07-iterations")).catch(() => null);
    expect(entries).not.toBeNull();
  });

  it("does not create 07-iterations directory when iterations disabled", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
    });

    const entries = await readdir(join(testDir, "artifacts", "07-iterations")).catch(() => null);
    expect(entries).toBeNull();
  });

  it("includes Plan Paths section in skill.md (no iterations)", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
    });

    const skillMd = await readFile(join(testDir, "skill.md"), "utf-8");
    expect(skillMd).toContain("## Plan Paths");
    expect(skillMd).toContain("Active plan path");
    expect(skillMd).toContain("Master plan path");
  });

  it("includes Plan Paths section in skill.md (with iterations)", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
      iterations: {
        enabled: true,
        duration: "2 weeks",
        startDate: "2026-04-08",
        demoDay: "Friday",
      },
    });

    const skillMd = await readFile(join(testDir, "skill.md"), "utf-8");
    expect(skillMd).toContain("## Plan Paths");
    expect(skillMd).toContain("iteration-{N}");
  });

  it("generates .cursorrules when editor is cursor", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
      editor: "cursor",
    });
    const cursorrules = await readFile(join(parentDir, ".cursorrules"), "utf-8");
    expect(cursorrules).toContain("Haren Framework");
    expect(cursorrules).toContain("Brainstorming Gate");
  });

  it("generates .claude/settings.json when editor is claude-code", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
      editor: "claude-code",
    });
    const settings = JSON.parse(
      await readFile(join(parentDir, ".claude", "settings.json"), "utf-8"),
    );
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
  });

  it("generates .cursor/hooks.json when editor is cursor", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
      editor: "cursor",
    });
    const cursorHooks = JSON.parse(
      await readFile(join(parentDir, ".cursor", "hooks.json"), "utf-8"),
    );
    expect(cursorHooks.hooks.preToolUse).toBeDefined();
    expect(cursorHooks.hooks.preToolUse[0].command).toContain("brainstorm-gate.ts");
  });

  it("generates both editor configs when editor is both", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
      editor: "both",
    });
    const claudeMd = await readFile(join(parentDir, "CLAUDE.md"), "utf-8");
    const cursorrules = await readFile(join(parentDir, ".cursorrules"), "utf-8");
    expect(claudeMd).toContain("Brainstorming Gate");
    expect(cursorrules).toContain("Brainstorming Gate");
  });

  it("does not generate CLAUDE.md when editor is cursor only", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
      editor: "cursor",
    });
    const claudeMd = await readFile(join(parentDir, "CLAUDE.md"), "utf-8").catch(() => null);
    expect(claudeMd).toBeNull();
  });

  it("defaults to claude-code editor when not specified", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
    });
    const claudeMd = await readFile(join(parentDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("Haren Framework");
    const cursorrules = await readFile(join(parentDir, ".cursorrules"), "utf-8").catch(() => null);
    expect(cursorrules).toBeNull();
  });

  it("includes Brainstorming Gate section in CLAUDE.md", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
    });
    const claudeMd = await readFile(join(parentDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("## Brainstorming Gate");
    expect(claudeMd).toContain("discover phase");
    expect(claudeMd).toContain("NOT to docs/superpowers/specs/");
  });

  it("creates brainstorm-gate.ts hook script", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
    });
    const hookScript = await readFile(join(testDir, "hooks", "brainstorm-gate.ts"), "utf-8");
    expect(hookScript).toContain("progress.json");
    expect(hookScript).toContain("02-discovery");
  });

  it("includes brainstorming in skill.md Available Actions and dispatch", async () => {
    await scaffoldWorkspace(testDir, {
      project: "test",
      mode: "blueprint",
      language: "English",
    });

    const skillMd = await readFile(join(testDir, "skill.md"), "utf-8");
    expect(skillMd).toContain("Design a feature");
    expect(skillMd).toContain("brainstorming");
    expect(skillMd).toContain("let's build");
  });
});
