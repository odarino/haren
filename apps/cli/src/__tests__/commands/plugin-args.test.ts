import { describe, expect, it } from "bun:test";
import { parsePluginArgs } from "../../commands/plugin";

describe("parsePluginArgs", () => {
  it("parses subcommands", () => {
    expect(parsePluginArgs(["add", "backlog", "-y"])).toEqual({
      sub: "add",
      target: "backlog",
      payload: {},
      yes: true,
    });
    expect(parsePluginArgs(["run", "after-plan", "--payload", '{"module":"m"}'])).toEqual({
      sub: "run",
      target: "after-plan",
      payload: { module: "m" },
      yes: false,
    });
    expect(parsePluginArgs(["list"]).sub).toBe("list");
  });
  it("rejects bad input", () => {
    expect(() => parsePluginArgs([])).toThrow("Usage");
    expect(() => parsePluginArgs(["add"])).toThrow("needs a plugin");
    expect(() => parsePluginArgs(["run", "on-deploy"])).toThrow("Unknown hook");
    expect(() => parsePluginArgs(["run", "after-plan", "--payload", "{"])).toThrow(
      "--payload must be JSON",
    );
  });
});
