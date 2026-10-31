import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { realpathSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { writeGateScript } from "../../workspace/templates";

// These tests run the generated hook script, so they check the real behavior.
let root: string;
let harenDir: string;

const MANIFEST = `haren:
  version: "1.3.3"
repos:
  web:
    path: ../web
  api: ../api
  e2e:
    path: ../e2e
    role: e2e
`;

beforeEach(async () => {
  root = realpathSync(await mkdtemp(join(tmpdir(), "haren-gate-run-")));
  harenDir = join(root, "haren");
  await writeGateScript(harenDir);
  await writeFile(join(harenDir, "manifest.yaml"), MANIFEST);
  for (const repo of ["web", "api", "e2e"]) await mkdir(join(root, repo), { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function progress(data: unknown): Promise<void> {
  await writeFile(join(harenDir, "progress.json"), JSON.stringify(data));
}

async function runGate(
  filePath: string,
  env: Record<string, string> = {},
): Promise<{ code: number; out: string }> {
  const { HAREN_GATE: _ignored, ...base } = process.env;
  const proc = Bun.spawn(["bun", join(harenDir, "hooks", "brainstorm-gate.ts")], {
    cwd: root,
    env: { ...base, ...env },
    stdin: new Blob([JSON.stringify({ tool_input: { file_path: filePath } })]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  return { code: await proc.exited, out };
}

const planned = (repos?: string[]) => ({
  version: 2,
  modules: { checkout: { status: "planned", ...(repos ? { repos } : {}) } },
});

describe("brainstorm-gate hook (generated script)", () => {
  it("allows writes inside the haren folder", async () => {
    await progress({ version: 2, modules: {} });
    expect((await runGate(join(harenDir, "artifacts", "x.md"))).code).toBe(0);
  });

  it("blocks code when no module exists and mentions the override", async () => {
    await progress({ version: 2, modules: {} });
    const r = await runGate(join(root, "web", "a.ts"));
    expect(r.code).toBe(2);
    expect(r.out).toContain("haren track override on");
  });

  it("blocks code when no module is planned", async () => {
    await progress({ version: 2, modules: { checkout: { status: "decomposed" } } });
    const r = await runGate(join(root, "web", "a.ts"));
    expect(r.code).toBe(2);
    expect(r.out).toContain("planned");
  });

  it("allows a file in the repo of a planned module", async () => {
    await progress(planned(["web"]));
    expect((await runGate(join(root, "web", "src", "a.ts"))).code).toBe(0);
    expect((await runGate("web/src/b.ts")).code).toBe(0);
  });

  it("blocks a file in another repo and names the active modules", async () => {
    await progress(planned(["web"]));
    const r = await runGate(join(root, "api", "a.ts"));
    expect(r.code).toBe(2);
    expect(r.out).toContain("checkout (../web)");
    expect(r.out).toContain("haren track override on --reason");
    expect(r.out).toContain("HAREN_GATE=off");
  });

  it("allows a string-valued repo entry", async () => {
    await progress(planned(["api"]));
    expect((await runGate(join(root, "api", "a.ts"))).code).toBe(0);
    expect((await runGate(join(root, "web", "a.ts"))).code).toBe(2);
  });

  it("allows everything for a module without repos (legacy)", async () => {
    await progress(planned());
    expect((await runGate(join(root, "api", "a.ts"))).code).toBe(0);
  });

  it("allows everything for the default repo key", async () => {
    await progress(planned(["default"]));
    expect((await runGate(join(root, "api", "a.ts"))).code).toBe(0);
  });

  it("allows the e2e repo when any module is planned", async () => {
    await progress(planned(["web"]));
    expect((await runGate(join(root, "e2e", "t.spec.ts"))).code).toBe(0);
  });

  it("allows files outside the workspace when a module is planned", async () => {
    await progress(planned(["web"]));
    const other = realpathSync(await mkdtemp(join(tmpdir(), "haren-gate-out-")));
    try {
      expect((await runGate(join(other, "x.ts"))).code).toBe(0);
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });

  it("allows with an active override", async () => {
    const until = new Date(Date.now() + 3_600_000).toISOString();
    await progress({ ...planned(["web"]), gateOverride: { reason: "hotfix", until } });
    expect((await runGate(join(root, "api", "a.ts"))).code).toBe(0);
    await progress({ version: 2, modules: {}, gateOverride: { reason: "hotfix" } });
    expect((await runGate(join(root, "api", "a.ts"))).code).toBe(0);
  });

  it("ignores an expired override", async () => {
    const until = new Date(Date.now() - 60_000).toISOString();
    await progress({ ...planned(["web"]), gateOverride: { reason: "hotfix", until } });
    expect((await runGate(join(root, "api", "a.ts"))).code).toBe(2);
  });

  it("allows with HAREN_GATE=off", async () => {
    await progress({ version: 2, modules: {} });
    expect((await runGate(join(root, "api", "a.ts"), { HAREN_GATE: "off" })).code).toBe(0);
  });

  it("fails open on a malformed or missing manifest", async () => {
    await progress(planned(["web"]));
    await writeFile(join(harenDir, "manifest.yaml"), "repos: [unclosed\n  : :");
    expect((await runGate(join(root, "api", "a.ts"))).code).toBe(0);
    await rm(join(harenDir, "manifest.yaml"));
    expect((await runGate(join(root, "api", "a.ts"))).code).toBe(0);
  });
});
