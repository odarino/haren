import { describe, expect, it } from "bun:test";
import { parseSource } from "../../plugins/source";
import { resolvePluginRef } from "../../plugins/registry";

describe("parseSource", () => {
  it("parses npm, git and file sources", () => {
    expect(parseSource("npm:@odarino/haren-plugin-backlog@1.0.0")).toEqual({
      kind: "npm",
      spec: "@odarino/haren-plugin-backlog@1.0.0",
    });
    expect(parseSource("git:https://github.com/a/b.git#v1")).toEqual({
      kind: "git",
      url: "https://github.com/a/b.git",
      ref: "v1",
    });
    expect(parseSource("git:https://github.com/a/b.git")).toEqual({
      kind: "git",
      url: "https://github.com/a/b.git",
    });
    expect(parseSource("file:../my-plugin")).toEqual({ kind: "file", path: "../my-plugin" });
  });
  it("rejects unknown or empty sources", () => {
    expect(() => parseSource("http://x")).toThrow("npm:, git:, or file:");
    expect(() => parseSource("npm:")).toThrow("empty");
  });
});

describe("resolvePluginRef", () => {
  it("maps a registry name to its source", () => {
    expect(resolvePluginRef("backlog")).toEqual({
      source: "npm:@odarino/haren-plugin-backlog",
      official: true,
    });
  });
  it("passes a source through as unofficial", () => {
    expect(resolvePluginRef("file:./p")).toEqual({ source: "file:./p", official: false });
  });
  it("marks a source that equals a registry source as official", () => {
    expect(resolvePluginRef("npm:@odarino/haren-plugin-backlog").official).toBe(true);
  });
  it("rejects an unknown bare name", () => {
    expect(() => resolvePluginRef("nope")).toThrow("Unknown plugin: nope");
  });
});
