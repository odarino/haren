import { describe, expect, it } from "bun:test";
import { validateManifest } from "../../plugins/manifest";

const base = {
  name: "backlog",
  version: "1.0.0",
  harenApi: "1",
  hooks: { "after-plan": "bun hooks/after-plan.ts" },
};

describe("validateManifest", () => {
  it("fills defaults for optional lists", () => {
    const m = validateManifest(base);
    expect(m).toMatchObject({
      name: "backlog",
      requires: [],
      setup: [],
      skills: [],
      agents: [],
      config: {},
    });
  });
  it("rejects a missing or bad name", () => {
    expect(() => validateManifest({ ...base, name: undefined })).toThrow("name");
    expect(() => validateManifest({ ...base, name: "Bad Name" })).toThrow("kebab-case");
  });
  it("rejects an unsupported harenApi", () => {
    expect(() => validateManifest({ ...base, harenApi: "2" })).toThrow('supports harenApi "1"');
  });
  it("rejects an unknown hook", () => {
    expect(() => validateManifest({ ...base, hooks: { "on-deploy": "x" } })).toThrow(
      "Unknown hook: on-deploy",
    );
  });
  it("takes the version from package.json when the manifest has none", () => {
    expect(validateManifest({ ...base, version: undefined }, "2.0.0").version).toBe("2.0.0");
  });
  it("rejects a version that differs from package.json", () => {
    expect(() => validateManifest(base, "2.0.0")).toThrow("differs from package.json");
  });
  it("requires a version without package.json", () => {
    expect(() => validateManifest({ ...base, version: undefined })).toThrow("version");
  });
  it("rejects a requirement without bin or with a bad range", () => {
    expect(() => validateManifest({ ...base, requires: [{}] })).toThrow("bin");
    expect(() => validateManifest({ ...base, requires: [{ bin: "x", version: 3 }] })).toThrow(
      "version",
    );
  });
});

describe("validateManifest path containment", () => {
  it("rejects absolute and parent-relative skills/agents paths", () => {
    for (const bad of ["../../..", "/etc", "a/../../b", "..\\x", "C:\\x"]) {
      expect(() => validateManifest({ ...base, skills: [bad] })).toThrow(
        `Plugin manifest: skills path must stay inside the plugin: ${bad}`,
      );
    }
    expect(() => validateManifest({ ...base, agents: ["../a.md"] })).toThrow(
      "Plugin manifest: agents path must stay inside the plugin: ../a.md",
    );
    expect(validateManifest({ ...base, skills: ["skills/x"] }).skills).toEqual(["skills/x"]);
  });
});
