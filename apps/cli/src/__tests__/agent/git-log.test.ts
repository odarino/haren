import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { readGitLog } from "../../agent/artifact-reader";
import { gitInit, runGit } from "../../workspace/git";

const commit = (msg: string, cwd: string) =>
  runGit(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", msg], cwd);

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "haren-log-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("readGitLog", () => {
  it("reads the log of a haren repo in a workspace (no repo at root)", async () => {
    const harenDir = join(root, "rules");
    await mkdir(harenDir);
    await gitInit(harenDir);
    await writeFile(join(harenDir, "a.md"), "a");
    await runGit(["add", "."], harenDir);
    await commit("docs: a", harenDir);
    const log = await readGitLog(harenDir);
    expect(log.map((e) => e.message)).toEqual(["docs: a"]);
  });

  it("reads only haren commits in a monorepo", async () => {
    await gitInit(root);
    await mkdir(join(root, "haren"));
    await mkdir(join(root, "backend"));
    await writeFile(join(root, "backend", "x.ts"), "x");
    await runGit(["add", "."], root);
    await commit("feat: code", root);
    await writeFile(join(root, "haren", "a.md"), "a");
    await runGit(["add", "."], root);
    await commit("docs: haren", root);
    const log = await readGitLog(join(root, "haren"));
    expect(log.map((e) => e.message)).toEqual(["docs: haren"]);
  });
});
