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

  it("prints the stack of an unhandled error only with HAREN_DEBUG=1", async () => {
    await mkdir(join(ws, ".claude"));
    await writeFile(join(ws, ".claude", "settings.json"), "{nope");
    const args = ["init", "--yes", "--dry-run", "--layout", "workspace"];
    const plain = await haren(args, ws);
    expect(plain.code).toBe(1);
    expect(plain.err).toContain("Invalid JSON in .claude/settings.json");
    expect(plain.err).not.toMatch(/^\s+at /m);
    const debug = await haren(args, ws, { HAREN_DEBUG: "1" });
    expect(debug.code).toBe(1);
    expect(debug.err).toContain("Invalid JSON in .claude/settings.json");
    expect(debug.err).toMatch(/^\s+at /m);
  });
});
