import { describe, it, expect } from "bun:test";
import { resolve } from "path";
import { parseAgentArgs } from "../../commands/agent";
import { harenDirFlag } from "../../workspace/resolve";

const CLI = resolve(import.meta.dir, "..", "..", "index.ts");

describe("parseAgentArgs", () => {
  it("reads the subcommand and --haren-dir in any order", () => {
    expect(parseAgentArgs(["start"])).toEqual({ subcommand: "start", harenDir: undefined });
    expect(parseAgentArgs(["--haren-dir", "rules", "status"])).toEqual({
      subcommand: "status",
      harenDir: "rules",
    });
    expect(parseAgentArgs(["stop", "--haren-dir", "rules"])).toEqual({
      subcommand: "stop",
      harenDir: "rules",
    });
  });
  it("skips other flags", () => {
    expect(parseAgentArgs(["--verbose", "start"])).toEqual({
      subcommand: "start",
      harenDir: undefined,
    });
  });
  it("returns no subcommand when only flags are given", () => {
    expect(parseAgentArgs(["--haren-dir", "rules"])).toEqual({
      subcommand: undefined,
      harenDir: "rules",
    });
  });
  it("rejects --haren-dir without a path", () => {
    expect(() => parseAgentArgs(["status", "--haren-dir"])).toThrow("--haren-dir needs a path");
    expect(() => parseAgentArgs(["--haren-dir", "--x", "status"])).toThrow(
      "--haren-dir needs a path",
    );
  });
});

describe("harenDirFlag", () => {
  it("returns the value or undefined, and throws when the value is missing", () => {
    expect(harenDirFlag(["--dry-run"])).toBeUndefined();
    expect(harenDirFlag(["--haren-dir", "rules"])).toBe("rules");
    expect(() => harenDirFlag(["--haren-dir"])).toThrow("--haren-dir needs a path");
  });
});

describe("haren agent / upgrade with --haren-dir and no path", () => {
  for (const args of [
    ["agent", "status", "--haren-dir"],
    ["upgrade", "--haren-dir"],
  ]) {
    it(`exits 1 for ${args.join(" ")}`, async () => {
      const proc = Bun.spawn(["bun", CLI, ...args], { stdout: "pipe", stderr: "pipe" });
      const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
      expect(code).toBe(1);
      expect(err).toContain("--haren-dir needs a path");
    });
  }
});
