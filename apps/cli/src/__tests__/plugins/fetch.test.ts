import { describe, expect, it } from "bun:test";
import { existsSync } from "fs";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { fetchPlugin } from "../../plugins/source";

const fixtures = join(import.meta.dir, "fixtures");

describe("fetchPlugin", () => {
  it("copies a file: source and validates it", async () => {
    const dest = join(await mkdtemp(join(tmpdir(), "haren-fetch-")), "hello");
    const m = await fetchPlugin("file:hello", dest, fixtures);
    expect(m.name).toBe("hello");
    expect(existsSync(join(dest, "hooks", "echo.ts"))).toBe(true);
  });
  it("fails when the folder has no manifest", async () => {
    const dest = join(await mkdtemp(join(tmpdir(), "haren-fetch-")), "x");
    await expect(fetchPlugin(`file:${tmpdir()}`, dest, "/")).rejects.toThrow("haren-plugin.json");
  });
  it("clones a git: source", async () => {
    // Build a local git repo from the fixture so the test needs no network.
    const repo = await mkdtemp(join(tmpdir(), "haren-git-"));
    await Bun.$`cp -R ${join(fixtures, "hello")}/. ${repo}`.quiet();
    await Bun.$`git -C ${repo} init -q && git -C ${repo} add . && git -C ${repo} -c user.email=t@t -c user.name=t commit -qm init`.quiet();
    const dest = join(await mkdtemp(join(tmpdir(), "haren-fetch-")), "hello");
    const m = await fetchPlugin(`git:file://${repo}`, dest, "/");
    expect(m.version).toBe("0.1.0");
    expect(existsSync(join(dest, ".git"))).toBe(false);
  });
});
