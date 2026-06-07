import { describe, test, expect, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { readProgress, readArtifactTree, readArtifact } from "../../agent/artifact-reader";

describe("artifact-reader", () => {
  let testDir: string;

  afterEach(async () => {
    if (testDir) await rm(testDir, { recursive: true, force: true });
  });

  test("readProgress returns progress.json content", async () => {
    testDir = await mkdtemp(join(tmpdir(), "artifact-"));
    const progress = {
      project: "test",
      version: 1,
      modules: {},
      dependencies: {},
    };
    await writeFile(join(testDir, "progress.json"), JSON.stringify(progress));

    const result = await readProgress(testDir);
    expect(result.project).toBe("test");
  });

  test("readProgress returns null when file missing", async () => {
    testDir = await mkdtemp(join(tmpdir(), "artifact-"));
    const result = await readProgress(testDir);
    expect(result).toBeNull();
  });

  test("readArtifactTree returns directory structure", async () => {
    testDir = await mkdtemp(join(tmpdir(), "artifact-"));
    await mkdir(join(testDir, "artifacts", "03-modules", "auth"), {
      recursive: true,
    });
    await writeFile(join(testDir, "artifacts", "03-modules", "auth", "spec.md"), "# Auth Module");

    const tree = await readArtifactTree(testDir);
    expect(tree.length).toBeGreaterThan(0);
    const moduleNode = tree.find((n) => n.name === "03-modules");
    expect(moduleNode).toBeDefined();
    expect(moduleNode!.children!.length).toBeGreaterThan(0);
  });

  test("readArtifact returns file content", async () => {
    testDir = await mkdtemp(join(tmpdir(), "artifact-"));
    await mkdir(join(testDir, "artifacts", "03-modules"), {
      recursive: true,
    });
    await writeFile(join(testDir, "artifacts", "03-modules", "spec.md"), "# Spec Content");

    const content = await readArtifact(testDir, "artifacts/03-modules/spec.md");
    expect(content).toBe("# Spec Content");
  });

  test("readArtifact returns null for missing file", async () => {
    testDir = await mkdtemp(join(tmpdir(), "artifact-"));
    const content = await readArtifact(testDir, "artifacts/nonexistent.md");
    expect(content).toBeNull();
  });
});
