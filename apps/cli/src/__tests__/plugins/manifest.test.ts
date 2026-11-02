import { describe, expect, it } from "bun:test";
import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { readInstalledManifest, validateManifest } from "../../plugins/manifest";

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
    expect(() => validateManifest({ ...base, harenApi: "3" })).toThrow('supports harenApi "1"');
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

describe("readInstalledManifest", () => {
  const { version: _v, ...noVersion } = base;
  async function plugin(manifest: unknown, pkg?: unknown): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "haren-rim-"));
    await writeFile(join(dir, "haren-plugin.json"), JSON.stringify(manifest));
    if (pkg !== undefined) await writeFile(join(dir, "package.json"), JSON.stringify(pkg));
    return dir;
  }
  it("takes the version from package.json when the manifest has none", async () => {
    const m = await readInstalledManifest(await plugin(noVersion, { version: "2.3.4" }));
    expect(m.version).toBe("2.3.4");
  });
  it("keeps the manifest version when present", async () => {
    const m = await readInstalledManifest(await plugin(base, { version: "9.9.9" }));
    expect(m.version).toBe("1.0.0");
  });
  it("throws when there is neither a version nor a package.json", async () => {
    await expect(readInstalledManifest(await plugin(noVersion))).rejects.toThrow(
      "version is required",
    );
  });
  it("throws when package.json has no string version", async () => {
    await expect(readInstalledManifest(await plugin(noVersion, { version: 3 }))).rejects.toThrow(
      "version is required",
    );
  });
});

describe("validateManifest adapter block", () => {
  const v2 = { name: "x", version: "1", harenApi: "2" };
  it("accepts harenApi 2 with an adapter block", () => {
    const m = validateManifest({
      name: "sample-adapter",
      version: "0.1.0",
      harenApi: "2",
      adapter: {
        unitKind: "screen",
        commands: { gate: "bun tools/gate.ts {specPath}" },
        skills: { spec: "sample-spec" },
      },
    });
    expect(m.harenApi).toBe("2");
    expect(m.adapter?.commands.gate).toBe("bun tools/gate.ts {specPath}");
  });
  it("keeps accepting harenApi 1 without an adapter", () => {
    expect(validateManifest(base).adapter).toBeUndefined();
  });
  it("rejects adapter on harenApi 1", () => {
    expect(() =>
      validateManifest({
        name: "x",
        version: "1",
        harenApi: "1",
        adapter: { unitKind: "s", commands: {} },
      }),
    ).toThrow(/harenApi "2"/);
  });
  it("rejects unknown adapter commands and unknown placeholders", () => {
    const bad = (commands: any) => () =>
      validateManifest({ ...v2, adapter: { unitKind: "s", commands } });
    expect(bad({ deploy: "x" })).toThrow(/Unknown adapter command/);
    expect(bad({ gate: "x {nope}" })).toThrow(/placeholder/);
    expect(bad({ gate: "x {spec-path}" })).toThrow(/placeholder \{spec-path\}/);
    expect(bad({ gate: "x {}" })).toThrow(/placeholder \{\}/);
    expect(bad({ gate: "x --a={specPath}" })).not.toThrow();
  });
  it("rejects a semantics path outside the plugin", () => {
    expect(() =>
      validateManifest({
        ...v2,
        adapter: { unitKind: "s", commands: {}, semantics: "../x.md" },
      }),
    ).toThrow(/inside the plugin/);
  });
});
