import { describe, expect, it } from "bun:test";
import { parseSource } from "../../plugins/source";
import { npmPackageName, resolvePluginRef } from "../../plugins/registry";

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
  it("rejects git urls and npm specs that look like options", () => {
    expect(() => parseSource("git:--upload-pack=touch /tmp/x")).toThrow('must not start with "-"');
    expect(() => parseSource("npm:--foo")).toThrow('must not start with "-"');
  });
});

describe("resolvePluginRef", () => {
  it("maps a registry name to its source", () => {
    expect(resolvePluginRef("backlog")).toEqual({
      source: "npm:@odarino/backlog.md",
      official: true,
    });
  });
  it("passes a source through as unofficial", () => {
    expect(resolvePluginRef("file:./p")).toEqual({ source: "file:./p", official: false });
  });
  it("treats any version or tag of an official npm package as official", () => {
    expect(resolvePluginRef("npm:@odarino/backlog.md").official).toBe(true);
    expect(resolvePluginRef("npm:@odarino/backlog.md@next").official).toBe(true);
    expect(resolvePluginRef("npm:@odarino/backlog.md@1.57.0-next.0").official).toBe(true);
    expect(resolvePluginRef("npm:@odarino/backlog.md-evil").official).toBe(false);
    expect(resolvePluginRef("git:https://github.com/odarino/Backlog.md").official).toBe(false);
  });
  it("rejects an unknown bare name", () => {
    expect(() => resolvePluginRef("nope")).toThrow("Unknown plugin: nope");
  });
});

describe("npmPackageName", () => {
  it("strips the version or tag", () => {
    expect(npmPackageName("@a/b@1.2.3")).toBe("@a/b");
    expect(npmPackageName("@a/b@next")).toBe("@a/b");
    expect(npmPackageName("@a/b")).toBe("@a/b");
    expect(npmPackageName("pkg@1")).toBe("pkg");
    expect(npmPackageName("pkg")).toBe("pkg");
  });
});
