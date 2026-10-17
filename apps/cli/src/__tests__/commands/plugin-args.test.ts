import { describe, expect, it } from "bun:test";
import { parsePluginArgs } from "../../commands/plugin";

describe("parsePluginArgs", () => {
  it("parses subcommands", () => {
    expect(parsePluginArgs(["add", "backlog", "-y"])).toEqual({
      sub: "add",
      target: "backlog",
      payload: {},
      yes: true,
    });
    expect(parsePluginArgs(["run", "after-plan", "--payload", '{"module":"m"}'])).toEqual({
      sub: "run",
      target: "after-plan",
      payload: { module: "m" },
      yes: false,
    });
    expect(parsePluginArgs(["list"]).sub).toBe("list");
  });
  it("rejects bad input", () => {
    expect(() => parsePluginArgs([])).toThrow("Usage");
    expect(() => parsePluginArgs(["add"])).toThrow("needs a plugin");
    expect(() => parsePluginArgs(["run", "on-deploy"])).toThrow("Unknown hook");
    expect(() => parsePluginArgs(["run", "after-plan", "--payload", "{"])).toThrow(
      "--payload must be JSON",
    );
  });
});

describe("haren plugin run outside a haren folder", () => {
  it("exits 0 with a warning", async () => {
    const { mkdtemp } = await import("fs/promises");
    const { tmpdir } = await import("os");
    const { join } = await import("path");
    const cwd = await mkdtemp(join(tmpdir(), "haren-run-"));
    const env = { ...process.env };
    delete env.HAREN_DIR;
    const proc = Bun.spawn(
      ["bun", join(import.meta.dir, "../../index.ts"), "plugin", "run", "session-start"],
      { cwd, env, stdout: "pipe", stderr: "pipe" },
    );
    const out = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(out).toContain("warning: plugin hook session-start skipped");
  });
});

describe("plugin remove of an unknown plugin", () => {
  it("prints the message and exits 1 without a stack trace", async () => {
    const { mkdtemp, mkdir } = await import("fs/promises");
    const { tmpdir } = await import("os");
    const { join } = await import("path");
    const ws = await mkdtemp(join(tmpdir(), "haren-rm-"));
    await mkdir(join(ws, "haren"));
    await Bun.write(join(ws, "haren", "manifest.yaml"), "project: shop\n");
    await Bun.write(join(ws, "haren", "skill.md"), "x\n");
    const proc = Bun.spawn(
      [
        "bun",
        join(import.meta.dir, "../../index.ts"),
        "plugin",
        "remove",
        "nope",
        "--haren-dir",
        join(ws, "haren"),
      ],
      { cwd: ws, stdout: "pipe", stderr: "pipe" },
    );
    const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    expect(code).toBe(1);
    expect(err).toContain("Plugin nope is not installed");
    expect(err).not.toContain("    at ");
  });
});
