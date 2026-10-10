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
      expect(text).not.toMatch(/(^|[\s`])haren\//m);
    });
  }
});
