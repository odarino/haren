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
});
