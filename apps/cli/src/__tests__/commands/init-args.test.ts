import { describe, it, expect } from "bun:test";
import { parseInitArgs, listRows, moveSelection, parseRepoSelection, parseSelectKeys } from "../../commands/init";

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

describe("parseSelectKeys", () => {
  it("reads arrow keys in normal and application cursor mode", () => {
    expect(parseSelectKeys("\x1b[A")).toEqual(["up"]);
    expect(parseSelectKeys("\x1b[B")).toEqual(["down"]);
    expect(parseSelectKeys("\x1bOA\x1bOB")).toEqual(["up", "down"]);
  });
  it("reads Enter and Ctrl+C", () => {
    expect(parseSelectKeys("\r")).toEqual(["enter"]);
    expect(parseSelectKeys("\n")).toEqual(["enter"]);
    expect(parseSelectKeys("\r\n")).toEqual(["enter"]);
    expect(parseSelectKeys("\x03")).toEqual(["abort"]);
  });
  it("keeps several keys from one chunk in order", () => {
    expect(parseSelectKeys("\x1b[B\x1b[B\r")).toEqual(["down", "down", "enter"]);
  });
  it("drops typed text and left/right arrows", () => {
    expect(parseSelectKeys("2monorepo\x1b[C\x1b[D")).toEqual([]);
  });
});

describe("moveSelection", () => {
  it("moves one step and wraps at both ends", () => {
    expect(moveSelection(0, "down", 3)).toBe(1);
    expect(moveSelection(2, "down", 3)).toBe(0);
    expect(moveSelection(0, "up", 3)).toBe(2);
    expect(moveSelection(1, "up", 3)).toBe(0);
  });
});

describe("listRows", () => {
  it("counts one row per line when lines fit", () => {
    expect(listRows(["\r\x1b[2K  \x1b[1mab\x1b[0m", "cd"], 80)).toBe(2);
  });
  it("counts wrapped rows and ignores ANSI codes", () => {
    expect(listRows(["\x1b[36m" + "x".repeat(25) + "\x1b[0m", "y"], 10)).toBe(4);
  });
  it("assumes no wrap when the width is unknown", () => {
    expect(listRows(["x".repeat(500)], undefined)).toBe(1);
  });
});
