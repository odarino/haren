import { describe, it, expect } from "bun:test";
import { parseInitArgs, parseRepoSelection, parseSelectChoice } from "../../commands/init";

describe("parseInitArgs", () => {
  it("parses new flags", () => {
    expect(
      parseInitArgs([
        "--dir",
        "~/shop",
        "--layout",
        "workspace",
        "--haren-dir",
        "rules",
        "--yes",
        "--dry-run",
      ]),
    ).toMatchObject({
      dir: "~/shop",
      layout: "workspace",
      harenDir: "rules",
      yes: true,
      dryRun: true,
      force: false,
    });
  });
  it("keeps the old flags", () => {
    expect(
      parseInitArgs(["--project", "p", "--mode", "explore", "--editor", "both", "--force"]),
    ).toMatchObject({
      project: "p",
      mode: "explore",
      editor: "both",
      force: true,
    });
  });
  it("rejects a bad layout", () => {
    expect(() => parseInitArgs(["--layout", "poly"])).toThrow("Invalid layout");
  });
  it("rejects --haren-dir without a path", () => {
    expect(() => parseInitArgs(["--haren-dir"])).toThrow("--haren-dir needs a path");
    expect(() => parseInitArgs(["--haren-dir", "--yes"])).toThrow("--haren-dir needs a path");
  });
});

describe("parseRepoSelection", () => {
  it("keeps defaults on enter", () => {
    expect(parseRepoSelection("", 3, [0, 2])).toEqual([0, 2]);
  });
  it("selects no repos for 0 or none", () => {
    expect(parseRepoSelection("0", 3, [0, 2])).toEqual([]);
    expect(parseRepoSelection(" None ", 3, [0, 2])).toEqual([]);
  });
  it("parses numbers and drops duplicates", () => {
    expect(parseRepoSelection("2, 1,2", 3, [])).toEqual([1, 0]);
  });
  it("returns null for invalid input", () => {
    expect(parseRepoSelection("4", 3, [])).toBeNull();
    expect(parseRepoSelection("x", 3, [])).toBeNull();
    expect(parseRepoSelection("0,1", 3, [])).toBeNull();
  });
});

describe("parseSelectChoice", () => {
  const opts = ["workspace", "monorepo"] as const;
  it("keeps the default on enter", () => {
    expect(parseSelectChoice("", opts, "workspace")).toBe("workspace");
  });
  it("accepts an option name in any case", () => {
    expect(parseSelectChoice(" Monorepo ", opts, "workspace")).toBe("monorepo");
  });
  it("accepts a 1-based number", () => {
    expect(parseSelectChoice("2", opts, "workspace")).toBe("monorepo");
    expect(parseSelectChoice("1", opts, "workspace")).toBe("workspace");
  });
  it("rejects out-of-range numbers and unknown names", () => {
    for (const v of ["0", "3", "1.5", "-1", "mono"]) {
      expect(parseSelectChoice(v, opts, "workspace")).toBeNull();
    }
  });
});
