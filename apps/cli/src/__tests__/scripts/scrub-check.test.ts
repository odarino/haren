import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { tmpdir } from "os";

const SCRIPT = resolve(import.meta.dir, "..", "..", "..", "..", "..", "scripts", "scrub-check.sh");
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "haren-scrub-"));
  Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function scrub(terms: string, ci?: string) {
  const env: Record<string, string> = { ...process.env, HAREN_SCRUB_TERMS: terms } as any;
  delete env.CI;
  if (ci !== undefined) env.CI = ci;
  const p = Bun.spawnSync(["bash", SCRIPT], { cwd: dir, env });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

describe("scrub-check.sh", () => {
  it("warns on stderr and exits 0 locally when the deny list is missing", () => {
    const r = scrub(join(dir, "none.txt"));
    expect(r.code).toBe(0);
    expect(r.err).toContain("scrub: WARNING — no deny list, nothing checked");
  });
  it("exits 1 in CI when the deny list is missing", () => {
    const r = scrub(join(dir, "none.txt"), "true");
    expect(r.code).toBe(1);
    expect(r.err).toContain("scrub: WARNING — no deny list, nothing checked");
  });
  it("treats a deny list of blank lines as missing", async () => {
    await writeFile(join(dir, "terms.txt"), "\n  \n");
    expect(scrub(join(dir, "terms.txt")).code).toBe(0);
    const r = scrub(join(dir, "terms.txt"), "1");
    expect(r.code).toBe(1);
    expect(r.err).toContain("scrub: WARNING");
  });
  it("still fails on a staged deny-listed term", async () => {
    await writeFile(join(dir, "terms.txt"), "secretco\n");
    await writeFile(join(dir, "a.txt"), "hello secretco\n");
    Bun.spawnSync(["git", "add", "a.txt"], { cwd: dir });
    const r = scrub(join(dir, "terms.txt"), "1");
    expect(r.code).toBe(1);
    expect(r.out).toContain("scrub: FAIL");
  });
});
