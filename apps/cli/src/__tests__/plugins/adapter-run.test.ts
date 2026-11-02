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

  it("does not take inherited keys as placeholder values", () => {
    expect(() => buildArgv("bun gate.ts {constructor}", {})).toThrow(AdapterError);
    expect(() => buildArgv("bun gate.ts --x={toString}", {})).toThrow(AdapterError);
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

describe("runAdapter (more)", () => {
  const script = async (body: string) => {
    const dir = await tempDir();
    await writeFile(join(dir, "a.ts"), body);
    return dir;
  };
  const out = (o: unknown) => `console.log(${JSON.stringify(JSON.stringify(o))})`;

  it("non-JSON stdout is an AdapterError", async () => {
    const dir = await script('console.log("hello")');
    await expect(runAdapter("gate", "bun a.ts", {}, dir)).rejects.toThrow(/non-JSON/);
  });
  it("validates inventory output", async () => {
    const ok = { units: [{ id: "A", parent: null, family: "f", title: "t" }] };
    expect(await runAdapter<unknown>("inventory", "bun a.ts", {}, await script(out(ok)))).toEqual(
      ok,
    );
    for (const bad of [
      { units: [{ id: "A", parent: null, family: 5 }] },
      { units: [{ id: "A", parent: null, title: {} }] },
      { units: [{ id: "", parent: null }] },
    ]) {
      await expect(runAdapter("inventory", "bun a.ts", {}, await script(out(bad)))).rejects.toThrow(
        /schema/,
      );
    }
  });
  it("validates extract output", async () => {
    const ok = { unit: "A", files: ["ir.json"] };
    expect(await runAdapter<unknown>("extract", "bun a.ts", {}, await script(out(ok)))).toEqual(ok);
    await expect(
      runAdapter("extract", "bun a.ts", {}, await script(out({ unit: "A", files: [1] }))),
    ).rejects.toThrow(/schema/);
  });
  it("rejects a bad severity and an empty finding message", async () => {
    const gate = (f: unknown) => out({ unit: "A", pass: false, findings: [f] });
    for (const f of [
      { severity: "info", rule: "r", message: "m" },
      { severity: "error", rule: "r", message: "" },
    ]) {
      await expect(runAdapter("gate", "bun a.ts", {}, await script(gate(f)))).rejects.toThrow(
        /schema/,
      );
    }
  });
  it("kills the adapter and throws after the timeout", async () => {
    const dir = await script("await Bun.sleep(5000)");
    const prev = process.env.HAREN_ADAPTER_TIMEOUT_MS;
    process.env.HAREN_ADAPTER_TIMEOUT_MS = "200";
    const start = Date.now();
    try {
      await expect(runAdapter("gate", "bun a.ts", {}, dir)).rejects.toThrow(
        "adapter gate timed out after 0.2s",
      );
    } finally {
      if (prev === undefined) delete process.env.HAREN_ADAPTER_TIMEOUT_MS;
      else process.env.HAREN_ADAPTER_TIMEOUT_MS = prev;
    }
    expect(Date.now() - start).toBeLessThan(3000);
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
