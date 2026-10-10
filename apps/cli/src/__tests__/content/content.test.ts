import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

const CONTENT = resolve(import.meta.dir, "..", "..", "..", "..", "..", "content");
const read = (rel: string) => readFileSync(resolve(CONTENT, rel), "utf-8");

describe("content: implement and developer", () => {
  for (const rel of ["skills/implement/SKILL.md", "agents/developer.md"]) {
    it(`${rel} uses per-repo branches and commits`, () => {
      const text = read(rel);
      expect(text).toContain("feat/{module-slug}");
      expect(text).toContain("lastCommit.<repoKey>");
      expect(text).toContain('skill.md "Repos and Git"');
      expect(text).toContain("Never push");
      expect(text).toContain("Changes inside the haren folder do not count");
      expect(text).toContain("two commits on the same branch");
      expect(text).not.toContain("one commit that holds both");
      expect(text).not.toMatch(/(^|[\s`])haren\//m);
      expect(text).toContain("set it to `implementing`");
      expect(text).toContain("or from the current branch if `default_branch` is not set");
      expect(text).toContain("make one code commit for all repo keys");
    });
  }
});

describe("content: read-context and update-tracking", () => {
  for (const rel of ["skills/read-context/SKILL.md", "skills/update-tracking/SKILL.md"]) {
    it(`${rel} checks git per repo key`, () => {
      const text = read(rel);
      expect(text).toContain('skill.md "Repos and Git"');
      expect(text).toContain("lastCommit.<repoKey>");
      expect(text).toContain("git -C <repo>");
      expect(text).toContain("`default`");
    });
  }
  it("update-tracking tests ancestry and read-context reports the haren repo", () => {
    expect(read("skills/update-tracking/SKILL.md")).toContain("merge-base --is-ancestor");
    expect(read("skills/read-context/SKILL.md")).toContain("Haren repo:");
  });
  it("read-context checks only active modules and handles a missing branch", () => {
    const text = read("skills/read-context/SKILL.md");
    expect(text).toContain("`implementing` or `evaluating`");
    expect(text).toContain("merged or deleted?");
  });
  it("update-tracking uses the recorded module branch", () => {
    const text = read("skills/update-tracking/SKILL.md");
    expect(text).toContain("the module's recorded `branch`");
  });
  it("onboard handles an empty repos map", () => {
    const text = read("skills/onboard/SKILL.md");
    expect(text).toContain("If `repos` is empty");
    expect(text).toContain("skip this repo");
    expect(text).not.toContain("skip this step");
  });
});

describe("content: qa-engineer, ideate, module template", () => {
  it("qa-engineer resolves $FRONTEND and $E2E from the manifest", () => {
    const text = read("agents/qa-engineer.md");
    expect(text).toContain("## Paths");
    expect(text).toContain("role: frontend");
    expect(text).toContain("add a `repos` entry");
    expect(text).toContain("`$FRONTEND/e2e`");
    // no bare cwd-relative paths left
    expect(text).not.toMatch(/(^|[\s`"(])frontend\/src/m);
    expect(text).not.toMatch(/(^|[\s`"(])e2e\//m);
    // the skill folder name must stay intact
    expect(text).toContain(".claude/skills/excel-tc-to-e2e");
  });

  it("ideate and module template do not hard-code the haren folder name", () => {
    expect(read("skills/ideate/SKILL.md")).not.toMatch(/(^|[\s`])haren\//m);
    expect(read("templates/module.md")).toContain(
      "repos: [{repo keys from the manifest `repos` map}]",
    );
  });
});
