import { test, expect } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";
import { resolveContentDir } from "../../lib/content-dir";

test("resolveContentDir returns a dir containing agents/skills/templates", () => {
  const dir = resolveContentDir();
  expect(existsSync(join(dir, "agents"))).toBe(true);
  expect(existsSync(join(dir, "skills"))).toBe(true);
  expect(existsSync(join(dir, "templates"))).toBe(true);
});

test("resolveContentDir throws a clear error when content is unreachable", () => {
  expect(() => resolveContentDir(["/nonexistent/a", "/nonexistent/b"])).toThrow(
    /content directory/i,
  );
});
