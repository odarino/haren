import { describe, it, expect } from "bun:test";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { HAREN_VERSION, readHarenVersion } from "../../lib/version";

describe("version", () => {
  it("reads the version of @odarino/haren", () => {
    expect(HAREN_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("skips package.json files of other packages", async () => {
    const dir = await mkdtemp(join(tmpdir(), "haren-ver-"));
    const other = join(dir, "other.json");
    const mine = join(dir, "mine.json");
    await writeFile(other, JSON.stringify({ name: "x", version: "9.9.9" }));
    await writeFile(mine, JSON.stringify({ name: "@odarino/haren", version: "1.2.3" }));
    expect(readHarenVersion([other, mine])).toBe("1.2.3");
    expect(readHarenVersion([other])).toBe("0.0.0");
    await rm(dir, { recursive: true, force: true });
  });
});
