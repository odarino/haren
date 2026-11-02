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

type GateResult = { code: number; out: string; err: string };

async function runRaw(
  stdin: string,
  env: Record<string, string> = {},
  cwd = root,
): Promise<GateResult> {
  const { HAREN_GATE: _ignored, ...base } = process.env;
  const proc = Bun.spawn(["bun", join(harenDir, "hooks", "brainstorm-gate.ts")], {
    cwd,
    env: { ...base, ...env },
    stdin: new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  return { code: await proc.exited, out, err };
}

async function runGate(filePath: string, env: Record<string, string> = {}): Promise<GateResult> {
  return runRaw(JSON.stringify({ tool_name: "Edit", tool_input: { file_path: filePath } }), env);
}

async function runShell(
  command: string,
  env: Record<string, string> = {},
  cwd = root,
): Promise<GateResult> {
  return runRaw(JSON.stringify({ tool_name: "Bash", tool_input: { command } }), env, cwd);
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
    expect(r.err).toContain("haren track override on");
  });

  it("blocks code when no module is planned", async () => {
    await progress({ version: 2, modules: { checkout: { status: "decomposed" } } });
    const r = await runGate(join(root, "web", "a.ts"));
    expect(r.code).toBe(2);
    expect(r.err).toContain("planned");
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
    expect(r.err).toContain("checkout (../web)");
    expect(r.err).toContain("haren track override on --reason");
    expect(r.err).toContain("HAREN_GATE=off");
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

describe("readOnly repos", () => {
  beforeEach(async () => {
    await writeFile(
      join(harenDir, "manifest.yaml"),
      MANIFEST + "  legacy_src:\n    path: ../legacy_src\n    role: legacy\n    readOnly: true\n",
    );
    await mkdir(join(root, "legacy_src"), { recursive: true });
  });
  it("blocks writes to a readOnly repo even when a module is planned", async () => {
    await progress(planned());
    const r = await runGate(join(root, "legacy_src", "a.xml"));
    expect(r.code).toBe(2);
    expect(r.err).toContain("read-only");
  });
  it("keeps the block when the gate override is on", async () => {
    await progress({ ...planned(), gateOverride: { reason: "hotfix" } });
    expect((await runGate(join(root, "legacy_src", "a.xml"))).code).toBe(2);
  });
  it("keeps the block with HAREN_GATE=off", async () => {
    await progress(planned());
    expect((await runGate(join(root, "legacy_src", "a.xml"), { HAREN_GATE: "off" })).code).toBe(2);
  });
});

describe("readOnly repos and Bash", () => {
  beforeEach(async () => {
    await writeFile(
      join(harenDir, "manifest.yaml"),
      MANIFEST + "  legacy_src:\n    path: ../legacy_src\n    role: legacy\n    readOnly: true\n",
    );
    await mkdir(join(root, "legacy_src"), { recursive: true });
    await progress(planned(["web"]));
  });
  it("denies sed -i into the legacy repo", async () => {
    const r = await runShell("sed -i '' 's/a/b/' legacy_src/x.xml");
    expect(r.code).toBe(2);
    expect(r.err).toContain("read-only");
  });
  it("allows read-only commands on the legacy repo", async () => {
    for (const cmd of [
      "cat legacy_src/x",
      "grep -rn foo legacy_src 2>/dev/null",
      "ls legacy_src",
      "git -C legacy_src log --oneline",
      "git -C legacy_src diff",
      "cp legacy_src/x web/x",
    ]) {
      expect((await runShell(cmd)).code).toBe(0);
    }
  });
  it("denies a redirect into the legacy repo even with the override on", async () => {
    await progress({ ...planned(["web"]), gateOverride: { reason: "hotfix" } });
    expect((await runShell("echo hi > legacy_src/x")).code).toBe(2);
    expect((await runShell("echo hi >> legacy_src/x", { HAREN_GATE: "off" })).code).toBe(2);
  });
  it("denies other writes into the legacy repo", async () => {
    for (const cmd of [
      `rm -rf ${join(root, "legacy_src", "a")}`,
      "cp web/x legacy_src/x",
      "echo hi | tee legacy_src/x",
      "git -C legacy_src commit -m x",
      "cd legacy_src && npm install",
      "dd if=/dev/zero of=legacy_src/x",
      "cd web && perl -pi -e 's/a/b/' ../legacy_src/x",
    ]) {
      expect({ cmd, code: (await runShell(cmd)).code }).toEqual({
        cmd,
        code: 2,
      });
    }
  });
  it("denies git writes run inside the legacy repo", async () => {
    expect((await runShell("git add .", {}, join(root, "legacy_src"))).code).toBe(2);
    expect((await runShell("git status", {}, join(root, "legacy_src"))).code).toBe(0);
  });
  it("allows unrelated Bash commands, also when no module is planned", async () => {
    expect((await runShell("echo hi > web/x && rm -rf web/tmp")).code).toBe(0);
    await progress({ version: 2, modules: {} });
    expect((await runShell("echo hi > web/x")).code).toBe(0);
  });
});

describe("Bash without readOnly repos", () => {
  it("allows every Bash command", async () => {
    await progress({ version: 2, modules: {} });
    expect((await runShell("echo hi > web/x; sed -i '' s/a/b/ web/y")).code).toBe(0);
  });
});

describe("review fixes", () => {
  const LEGACY =
    MANIFEST + "  legacy_src:\n    path: ../legacy_src\n    role: legacy\n    readOnly: true\n";

  it("allows a Bash payload without a command, even when no module is planned", async () => {
    await progress({ version: 2, modules: {} });
    expect((await runRaw(JSON.stringify({ tool_name: "Bash", tool_input: {} }))).code).toBe(0);
    expect((await runRaw(JSON.stringify({ tool_name: "Bash" }))).code).toBe(0);
    expect((await runRaw(JSON.stringify({ hook_event_name: "beforeShellExecution" }))).code).toBe(
      0,
    );
  });

  it("keeps the Edit gate for an Edit payload", async () => {
    await progress({ version: 2, modules: {} });
    expect((await runGate(join(root, "web", "a.ts"))).code).toBe(2);
  });

  it("writes the Claude denial reason to stderr as plain text", async () => {
    await progress({ version: 2, modules: {} });
    const edit = await runGate(join(root, "web", "a.ts"));
    expect(edit.code).toBe(2);
    expect(edit.err).toContain("Run the discover phase first");
    expect(edit.err.trim().startsWith("{")).toBe(false);
    await writeFile(join(harenDir, "manifest.yaml"), LEGACY);
    await mkdir(join(root, "legacy_src"), { recursive: true });
    const bash = await runShell("echo hi > legacy_src/x");
    expect(bash.code).toBe(2);
    expect(bash.err).toContain("read-only");
  });

  it("keeps the Cursor JSON denial on stdout", async () => {
    await progress({ version: 2, modules: {} });
    const r = await runRaw(
      JSON.stringify({ hook_event_name: "beforeFileEdit", file_path: join(root, "web", "a.ts") }),
    );
    expect(r.code).toBe(2);
    const json = JSON.parse(r.out);
    expect(json.permission).toBe("deny");
    expect(json.user_message).toContain("discover");
    expect(json.agent_message).toContain("discover");
  });

  describe("payload source", () => {
    const edit = (extra: Record<string, unknown>) =>
      JSON.stringify({ tool_input: { file_path: join(root, "web", "a.ts") }, ...extra });
    beforeEach(async () => {
      await progress({ version: 2, modules: {} });
    });
    it("Claude Code PreToolUse: reason on stderr only", async () => {
      const r = await runRaw(
        edit({
          hook_event_name: "PreToolUse",
          tool_name: "Edit",
          session_id: "s",
          transcript_path: "/t",
        }),
      );
      expect(r.code).toBe(2);
      expect(r.err).toContain("discover");
      expect(r.out.trim()).toBe("");
    });
    it("Cursor preToolUse with tool_name: JSON on stdout only", async () => {
      const r = await runRaw(edit({ hook_event_name: "preToolUse", tool_name: "Write" }));
      expect(r.code).toBe(2);
      expect(JSON.parse(r.out).permission).toBe("deny");
      expect(r.err.trim()).toBe("");
    });
    it("unclear source: both stderr and stdout JSON", async () => {
      const r = await runRaw(edit({ tool_name: "Edit" }));
      expect(r.code).toBe(2);
      expect(r.err).toContain("discover");
      expect(JSON.parse(r.out).agent_message).toContain("discover");
    });
  });

  describe("Bash false denies", () => {
    beforeEach(async () => {
      await writeFile(join(harenDir, "manifest.yaml"), LEGACY);
      await mkdir(join(root, "legacy_src"), { recursive: true });
      await progress(planned(["web"]));
    });
    it("ignores > inside quotes", async () => {
      expect((await runShell(`echo "a > legacy_src/x" > web/out`)).code).toBe(0);
      expect((await runShell(`grep 'x>>legacy_src/y' web/f`)).code).toBe(0);
    });
    it("does not read a git commit message as a path", async () => {
      expect((await runShell(`git -C web commit -m "fix legacy_src/x"`)).code).toBe(0);
      expect((await runShell(`git -C web commit --message legacy_src/x`)).code).toBe(0);
      expect((await runShell(`git -C web commit -F legacy_src/msg.txt`)).code).toBe(0);
      // -C/-c <commit> reuse a commit message: the value is a commit, not a path.
      expect((await runShell(`git commit -C legacy_src/x`)).code).toBe(0);
      expect((await runShell(`git commit -c legacy_src/x`)).code).toBe(0);
    });
    it("does not match a bare directory name in another place", async () => {
      const other = realpathSync(await mkdtemp(join(tmpdir(), "haren-gate-other-")));
      try {
        expect((await runShell(`rm -rf ${join(other, "legacy_src", "x")}`)).code).toBe(0);
        expect((await runShell("touch legacy_src/x", {}, other)).code).toBe(0);
      } finally {
        await rm(other, { recursive: true, force: true });
      }
    });
  });

  describe("malformed manifest", () => {
    it("denies writes when the broken manifest declares readOnly", async () => {
      await progress({ ...planned(), gateOverride: { reason: "hotfix" } });
      await writeFile(join(harenDir, "manifest.yaml"), "repos: [unclosed\n  readOnly: true\n  : :");
      const edit = await runGate(join(root, "api", "a.ts"));
      expect(edit.code).toBe(2);
      expect(edit.err).toContain(
        "manifest.yaml does not parse and declares a readOnly repo. Fix manifest.yaml first.",
      );
      expect((await runShell("echo hi > api/x")).code).toBe(2);
      expect((await runGate(join(harenDir, "manifest.yaml"))).code).toBe(0);
      expect((await runShell("cat api/x")).code).toBe(0);
    });
    it("denies Bash writes to a readOnly repo outside the workspace", async () => {
      const other = realpathSync(await mkdtemp(join(tmpdir(), "haren-gate-far-")));
      try {
        await progress(planned(["web"]));
        await writeFile(
          join(harenDir, "manifest.yaml"),
          `repos: [unclosed\n  legacy:\n    path: ${join(other, "legacy")}\n    readOnly: true\n  : :`,
        );
        expect((await runShell(`touch ${join(other, "legacy", "x")}`)).code).toBe(2);
        expect((await runShell(`echo hi > ${join(harenDir, "notes.md")}`)).code).toBe(0);
        expect((await runShell("grep foo web/x 2>/dev/null")).code).toBe(0);
      } finally {
        await rm(other, { recursive: true, force: true });
      }
    });
    it("fails open when the broken manifest has no readOnly", async () => {
      await progress(planned(["web"]));
      await writeFile(join(harenDir, "manifest.yaml"), "repos: [unclosed\n  : :");
      expect((await runGate(join(root, "api", "a.ts"))).code).toBe(0);
      expect((await runShell("echo hi > api/x")).code).toBe(0);
    });
  });

  describe("array-form repos", () => {
    beforeEach(async () => {
      await writeFile(
        join(harenDir, "manifest.yaml"),
        "repos:\n  - path: ../web\n  - path: ../legacy_src\n    readOnly: true\n",
      );
      await mkdir(join(root, "legacy_src"), { recursive: true });
      await progress(planned());
    });
    it("blocks the readOnly entry", async () => {
      expect((await runGate(join(root, "legacy_src", "a.ts"))).code).toBe(2);
      expect((await runShell("touch legacy_src/a")).code).toBe(2);
    });
    it("still allows the other repo", async () => {
      expect((await runGate(join(root, "web", "a.ts"))).code).toBe(0);
      expect((await runShell("touch web/a")).code).toBe(0);
    });
  });
});
