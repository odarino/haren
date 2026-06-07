import { describe, it, expect } from "bun:test";
import { parseArgs } from "../index";

describe("parseArgs", () => {
  it("returns init command when 'init' is passed", () => {
    const result = parseArgs(["init"]);
    expect(result).toEqual({ command: "init", args: [] });
  });

  it("returns help when no args passed", () => {
    const result = parseArgs([]);
    expect(result).toEqual({ command: "help", args: [] });
  });

  it("returns upgrade command when 'upgrade' is passed", () => {
    const result = parseArgs(["upgrade"]);
    expect(result).toEqual({ command: "upgrade", args: [] });
  });

  it("returns upgrade with args", () => {
    const result = parseArgs(["upgrade", "--dry-run"]);
    expect(result).toEqual({ command: "upgrade", args: ["--dry-run"] });
  });

  it("returns unknown for unrecognized commands", () => {
    const result = parseArgs(["foo"]);
    expect(result).toEqual({ command: "unknown", args: ["foo"] });
  });

  it("parses 'agent' command with subcommand", () => {
    expect(parseArgs(["agent", "start"])).toEqual({
      command: "agent",
      args: ["start"],
    });
  });

  it("parses 'agent' command without subcommand", () => {
    expect(parseArgs(["agent"])).toEqual({
      command: "agent",
      args: [],
    });
  });
});
