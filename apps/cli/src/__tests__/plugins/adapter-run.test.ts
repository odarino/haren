import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { AdapterError, buildArgv, type GateOut, runAdapter } from "../../plugins/adapter-run";

const dirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adapter-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("buildArgv", () => {
  it("substitutes placeholders as whole argv items, never through a shell", () => {
    expect(
      buildArgv("bun gate.ts {specPath} --unit {unit}", {
        specPath: "a b; rm -rf x",
        unit: "SCR_A001",
      }),
    ).toEqual(["bun", "gate.ts", "a b; rm -rf x", "--unit", "SCR_A001"]);
  });

  it("throws AdapterError for a placeholder with no value", () => {
    expect(() => buildArgv("bun gate.ts {specPath}", {})).toThrow(AdapterError);
  });
});

describe("runAdapter", () => {
  it("parses and validates gate output", async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, "g.ts"),
      'console.log(JSON.stringify({unit:"SCR_A001",pass:true,findings:[]}))',
    );
    expect(await runAdapter<GateOut>("gate", "bun g.ts", {}, dir)).toEqual({
      unit: "SCR_A001",
      pass: true,
      findings: [],
    });
  });

  it("non-zero exit is an AdapterError", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "g.ts"), "process.exit(3)");
    await expect(runAdapter("gate", "bun g.ts", {}, dir)).rejects.toBeInstanceOf(AdapterError);
  });

  it("a missing command is an AdapterError", async () => {
    const dir = await tempDir();
    await expect(runAdapter("gate", "haren-no-such-binary-xyz", {}, dir)).rejects.toBeInstanceOf(
      AdapterError,
    );
  });

  it("schema mismatch is an AdapterError", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "g.ts"), 'console.log(JSON.stringify({pass:"yes"}))');
    await expect(runAdapter("gate", "bun g.ts", {}, dir)).rejects.toThrow(/schema/);
  });
});

describe("AdapterError", () => {
  it("has name AdapterError so callers can tell it from gate FAILs", () => {
    const err = new AdapterError("boom");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AdapterError");
    expect(err.message).toBe("boom");
  });
});
