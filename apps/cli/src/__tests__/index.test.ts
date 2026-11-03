import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { parseArgs } from "../index";

const CLI = resolve(import.meta.dir, "..", "index.ts");

async function haren(args: string[], cwd: string, env: Record<string, string> = {}) {
  const proc = Bun.spawn(["bun", CLI, ...args], {
    cwd,
    env: { ...process.env, HAREN_DEBUG: "", ...env },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { out, err, code };
}

describe("parseArgs", () => {
  it("returns init command when 'init' is passed", () => {
    const result = parseArgs(["init"]);
    expect(result).toEqual({ command: "init", args: [] });
  });

  it("returns help when no args passed", () => {
    const result = parseArgs([]);
    expect(result).toEqual({ command: "help", args: [] });
  });

  it("returns upgrade command when 'upgrade' is passed", () => {
    const result = parseArgs(["upgrade"]);
    expect(result).toEqual({ command: "upgrade", args: [] });
  });

  it("returns upgrade with args", () => {
    const result = parseArgs(["upgrade", "--dry-run"]);
    expect(result).toEqual({ command: "upgrade", args: ["--dry-run"] });
  });

  it("returns unknown for unrecognized commands", () => {
    const result = parseArgs(["foo"]);
    expect(result).toEqual({ command: "unknown", args: ["foo"] });
  });

  it("parses 'agent' command with subcommand", () => {
    expect(parseArgs(["agent", "start"])).toEqual({
      command: "agent",
      args: ["start"],
    });
  });

  it("parses 'agent' command without subcommand", () => {
    expect(parseArgs(["agent"])).toEqual({
      command: "agent",
      args: [],
    });
  });

  it("routes plugin", () => {
    expect(parseArgs(["plugin", "list"])).toEqual({ command: "plugin", args: ["list"] });
  });

  it("returns help for <command> --help or -h", () => {
    expect(parseArgs(["init", "--help"])).toEqual({ command: "help", args: [] });
    expect(parseArgs(["upgrade", "-h"])).toEqual({ command: "help", args: [] });
    expect(parseArgs(["agent", "start", "--help"])).toEqual({ command: "help", args: [] });
  });
});

describe("haren CLI", () => {
  let ws: string;
  beforeEach(async () => {
    ws = await mkdtemp(join(tmpdir(), "haren-cli-"));
  });
  afterEach(async () => {
    await rm(ws, { recursive: true, force: true });
  });

  it("prints help for init --help and lists -y", async () => {
    const r = await haren(["init", "--help"], ws);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Usage:");
    expect(r.out).toContain("--yes|-y");
    expect(r.out).not.toContain("Plan:");
  });

  it("lists every init mode in help", async () => {
    const r = await haren(["init", "--help"], ws);
    expect(r.out).toContain("--mode <undecided|explore|blueprint|inherit|migration>");
  });

  it("exits 3 for gate PASS without approval", async () => {
    const h = join(ws, "haren");
    await mkdir(join(ws, "legacy_src"), { recursive: true });
    await mkdir(join(h, ".plugins", "fake", "tools"), { recursive: true });
    await mkdir(join(h, "artifacts", "02-discovery", "units", "SCR_A001"), { recursive: true });
    await mkdir(join(h, "events"), { recursive: true });
    await writeFile(
      join(h, "manifest.yaml"),
      'haren:\n  version: "1.5.0"\nmode: migration\nrepos:\n  legacy_src: { path: ../legacy_src, role: legacy, readOnly: true }\nmigration:\n  adapter: fake\n  unitId: "^SCR_[A-Z]\\\\d{3}$"\n',
    );
    await writeFile(
      join(h, "progress.json"),
      JSON.stringify({
        project: "p",
        version: 3,
        modules: {
          m: {
            status: "decomposed",
            currentPhase: "decompose",
            features: {},
            lastCommit: {},
            units: { SCR_A001: "spec-draft" },
          },
        },
        dependencies: {},
      }),
    );
    await writeFile(join(h, "events", "events.jsonl"), "");
    await writeFile(
      join(h, "plugins.json"),
      JSON.stringify({
        version: 1,
        plugins: { fake: { source: "x", version: "0.1.0", enabled: true, config: {} } },
      }),
    );
    await writeFile(
      join(h, ".plugins", "fake", "haren-plugin.json"),
      JSON.stringify({
        name: "fake",
        version: "0.1.0",
        harenApi: "2",
        adapter: {
          unitKind: "screen",
          commands: { gate: "bun tools/gate.ts {specPath} --ir {unitDir}" },
        },
      }),
    );
    await writeFile(
      join(h, ".plugins", "fake", "tools", "gate.ts"),
      'console.log(JSON.stringify({ unit: "SCR_A001", pass: true, findings: [] }));',
    );
    await writeFile(
      join(h, "artifacts", "02-discovery", "units", "SCR_A001", "spec.md"),
      "# spec\n",
    );
    const r = await haren(["migrate", "gate", "SCR_A001", "--haren-dir", h], ws);
    expect(r.err).toContain(
      "Gate PASS. Not approved yet. Review the spec, then re-run with --approve.",
    );
    expect(r.code).toBe(3);
  });

  it("explains plugin add without a TTY", async () => {
    await haren(
      ["init", "--yes", "--layout", "workspace", "--project", "p", "--mode", "explore"],
      ws,
    );
    const r = await haren(["plugin", "add", "file:./nowhere"], ws);
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      "Plugin install cancelled: no TTY for the confirmation prompt. Re-run with --yes after you review the plugin.",
    );
  });

  it("prints the stack of an unhandled error only with HAREN_DEBUG=1", async () => {
    await mkdir(join(ws, ".claude"));
    await writeFile(join(ws, ".claude", "settings.json"), "{nope");
    const args = ["init", "--yes", "--dry-run", "--layout", "workspace"];
    const plain = await haren(args, ws);
    expect(plain.code).toBe(1);
    expect(plain.err).toContain("Invalid JSON in .claude/settings.json");
    expect(plain.err).toMatch(/^ {2}Invalid JSON/m);
    expect(plain.err).not.toMatch(/^\s+at /m);
    const debug = await haren(args, ws, { HAREN_DEBUG: "1" });
    expect(debug.code).toBe(1);
    expect(debug.err).toContain("Invalid JSON in .claude/settings.json");
    expect(debug.err).toMatch(/^\s+at /m);
  });
});
