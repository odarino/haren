import { describe, expect, it } from "bun:test";
import { chmod, mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { checkRequirement, extractVersion } from "../../plugins/requires";

async function fakeBin(name: string, output: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "haren-bin-"));
  const path = join(dir, name);
  await writeFile(path, `#!/bin/sh\necho "${output}"\n`);
  await chmod(path, 0o755);
  return dir;
}

describe("extractVersion", () => {
  it("finds the first semver in the text", () => {
    expect(extractVersion("backlog v1.56.1\n")).toBe("1.56.1");
    expect(extractVersion("no version")).toBeUndefined();
  });
});

describe("checkRequirement", () => {
  it("reports a missing bin", async () => {
    const env = { PATH: await mkdtemp(join(tmpdir(), "empty-")) };
    expect(await checkRequirement({ bin: "backlog" }, env)).toEqual({
      ok: false,
      reason: "missing",
    });
  });
  it("accepts a version in range", async () => {
    const env = { PATH: await fakeBin("backlog", "1.56.1") };
    expect(await checkRequirement({ bin: "backlog", version: ">=1.56.0" }, env)).toEqual({
      ok: true,
      version: "1.56.1",
    });
  });
  it("reports an outdated version", async () => {
    const env = { PATH: await fakeBin("backlog", "1.40.0") };
    expect(await checkRequirement({ bin: "backlog", version: ">=1.56.0" }, env)).toEqual({
      ok: false,
      reason: "outdated",
      version: "1.40.0",
    });
  });
});
