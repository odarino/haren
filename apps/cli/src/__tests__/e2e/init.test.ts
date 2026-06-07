// src/__tests__/e2e/init.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { scaffoldWorkspace } from "../../commands/init";

describe("e2e: haren init", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "haren-e2e-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("scaffolds a complete, valid workspace", async () => {
    await scaffoldWorkspace(testDir, {
      project: "e2e-test",
      mode: "explore",
      language: "English",
    });

    // Root files exist
    const manifest = await readFile(join(testDir, "manifest.yaml"), "utf-8");
    expect(manifest).toContain("project: e2e-test");
    expect(manifest).toContain("mode: explore");

    const progress = JSON.parse(await readFile(join(testDir, "progress.json"), "utf-8"));
    expect(progress.project).toBe("e2e-test");
    expect(progress.version).toBe(1);

    const skillMd = await readFile(join(testDir, "skill.md"), "utf-8");
    expect(skillMd).toContain("Available Actions");

    // All 6 agents exist
    const agents = await readdir(join(testDir, "agents"));
    expect(agents).toContain("researcher.md");
    expect(agents).toContain("architect.md");
    expect(agents).toContain("planner.md");
    expect(agents).toContain("developer.md");
    expect(agents).toContain("reviewer.md");
    expect(agents).toContain("feedback.md");

    // All phase skill folders exist with SKILL.md
    const phaseSkills = ["research", "discover", "decompose", "plan", "implement", "evaluate"];
    for (const skill of phaseSkills) {
      const skillFile = await readFile(join(testDir, "skills", skill, "SKILL.md"), "utf-8");
      expect(skillFile).toContain(`name: ${skill}`);
    }

    // Discover sub-strategies exist
    const discoverFiles = await readdir(join(testDir, "skills", "discover"));
    expect(discoverFiles).toContain("blueprint.md");
    expect(discoverFiles).toContain("explore.md");
    expect(discoverFiles).toContain("inherit.md");

    // All utility skill folders exist
    const utilSkills = [
      "read-context",
      "create-artifact",
      "validate-artifact",
      "search-artifact",
      "resolve-next-id",
      "update-links",
      "update-tracking",
    ];
    for (const skill of utilSkills) {
      const exists = await readdir(join(testDir, "skills", skill));
      expect(exists).toContain("SKILL.md");
    }

    // All templates exist
    const templates = await readdir(join(testDir, "templates"));
    expect(templates.length).toBeGreaterThanOrEqual(9);

    // Artifact directories exist
    const artifactDirs = await readdir(join(testDir, "artifacts"));
    expect(artifactDirs).toContain("_registry");
    expect(artifactDirs).toContain("00-baseline");
    expect(artifactDirs).toContain("01-research");
    expect(artifactDirs).toContain("06-evaluation");

    // Registry has header
    const index = await readFile(
      join(testDir, "artifacts", "_registry", "artifact-index.md"),
      "utf-8",
    );
    expect(index).toContain("Artifact Index");
  });
});
