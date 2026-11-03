import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { existsSync, statSync } from "fs";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { companion, latestSession } from "../../commands/companion";
import { scaffoldWorkspace } from "../../commands/init";
import { parseArgs } from "../../index";

describe("haren companion", () => {
  let root: string;
  let harenDir: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "haren-companion-"));
    harenDir = join(root, "haren-dev");
    await mkdir(harenDir, { recursive: true });
    await writeFile(join(harenDir, "manifest.yaml"), 'haren:\n  version: "1.5.0"\n');
    await writeFile(
      join(harenDir, "progress.json"),
      '{"project":"t","version":3,"modules":{},"dependencies":{}}',
    );
  });

  afterEach(async () => {
    const s = latestSession(harenDir);
    if (s?.running) await companion(["stop"], root);
    await rm(root, { recursive: true, force: true });
  });

  it("starts in the background, reports status, stops", async () => {
    await companion(["start"], root);
    const s = latestSession(harenDir)!;
    expect(s.running).toBe(true);
    const r = await fetch(s.info!.url);
    expect(r.status).toBe(200);
    await companion(["status"], root);
    await companion(["stop"], root);
    expect(latestSession(harenDir)!.running).toBe(false);
    await expect(companion(["status"], root)).rejects.toThrow();
  }, 15000);

  it("reuses the previous port on restart", async () => {
    await companion(["start"], root);
    const p1 = latestSession(harenDir)!.info!.port;
    await companion(["stop"], root);
    await companion(["start"], root);
    expect(latestSession(harenDir)!.info!.port).toBe(p1);
    await companion(["stop"], root);
  }, 15000);

  it("restarts the same session: same dirs, key, url and port", async () => {
    await companion(["start"], root);
    const a = latestSession(harenDir)!;
    await companion(["stop"], root);
    await companion(["start"], root);
    const b = latestSession(harenDir)!;
    expect(b.running).toBe(true);
    expect(b.dir).toBe(a.dir);
    expect(b.info!.screen_dir).toBe(a.info!.screen_dir);
    expect(b.info!.state_dir).toBe(a.info!.state_dir);
    expect(b.info!.url).toBe(a.info!.url);
    expect(b.info!.port).toBe(a.info!.port);
    expect(existsSync(join(b.dir, "state", "server-stopped"))).toBe(false);
    const r = await fetch(a.info!.url);
    expect(r.status).toBe(200);
    await companion(["stop"], root);
  }, 15000);

  it("restart with a taken port keeps dirs and key and notes the new port", async () => {
    await companion(["start"], root);
    const a = latestSession(harenDir)!;
    await companion(["stop"], root);
    const blocker = Bun.serve({
      hostname: "127.0.0.1",
      port: a.info!.port,
      fetch: () => new Response(""),
    });
    const err = spyOn(console, "error").mockImplementation(() => {});
    try {
      await companion(["start"], root);
      const b = latestSession(harenDir)!;
      expect(b.dir).toBe(a.dir);
      expect(b.info!.port).not.toBe(a.info!.port);
      expect(new URL(b.info!.url).searchParams.get("key")).toBe(
        new URL(a.info!.url).searchParams.get("key"),
      );
      expect(err.mock.calls.map((c) => c.join(" ")).join("\n")).toContain(
        "port changed, give the user the new URL",
      );
    } finally {
      err.mockRestore();
      blocker.stop(true);
      await companion(["stop"], root);
    }
  }, 15000);

  it("stores the key in state/key with mode 0600", async () => {
    await companion(["start"], root);
    const s = latestSession(harenDir)!;
    const keyPath = join(s.dir, "state", "key");
    expect((await readFile(keyPath, "utf-8")).trim()).toBe(
      new URL(s.info!.url).searchParams.get("key")!,
    );
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
  }, 15000);

  it("a failed restart still lets the next start reuse the same dir and key", async () => {
    await companion(["start"], root);
    const a = latestSession(harenDir)!;
    await companion(["stop"], root);
    // An address that cannot bind makes the child exit.
    await expect(companion(["start", "--host", "256.256.256.256"], root)).rejects.toThrow();
    const mid = latestSession(harenDir)!;
    expect(mid.dir).toBe(a.dir);
    expect(existsSync(join(a.dir, "state", "server-info"))).toBe(true);
    await companion(["start"], root);
    const b = latestSession(harenDir)!;
    expect(b.running).toBe(true);
    expect(b.dir).toBe(a.dir);
    expect(b.info!.url).toBe(a.info!.url);
  }, 20000);

  it("prints status lines while running", async () => {
    await companion(["start"], root);
    const info = latestSession(harenDir)!.info!;
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      await companion(["status"], root);
      expect(log.mock.calls.map((c) => c.join(" ")).join("\n")).toBe(
        `running ${info.url}\nscreen_dir ${info.screen_dir}\nstate_dir ${info.state_dir}`,
      );
    } finally {
      log.mockRestore();
    }
  }, 15000);

  it("start while running reuses the session and notes ignored flags", async () => {
    await companion(["start"], root);
    const first = latestSession(harenDir)!;
    const err = spyOn(console, "error").mockImplementation(() => {});
    try {
      await companion(["start"], root);
      expect(err).not.toHaveBeenCalled();
      await companion(["start", "--port", "1", "--open"], root);
      expect(String(err.mock.calls[0]?.[0])).toContain("ignored --port, --open");
    } finally {
      err.mockRestore();
    }
    const now = latestSession(harenDir)!;
    expect(now.dir).toBe(first.dir);
    expect(now.running).toBe(true);
  }, 15000);

  it("--foreground serves in-process until the idle timeout", async () => {
    const run = companion(["start", "--foreground", "--idle-timeout-minutes", "0.01"], root);
    let s = latestSession(harenDir);
    for (let i = 0; i < 100 && !s?.running; i++) {
      await Bun.sleep(20);
      s = latestSession(harenDir);
    }
    expect(s!.running).toBe(true);
    expect((await fetch(s!.info!.url)).status).toBe(200);
    await run;
    expect(latestSession(harenDir)!.running).toBe(false);
  }, 15000);

  it("__serve falls back to a random port when the reused port is taken", async () => {
    const busy = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
    try {
      const dir = join(harenDir, ".companion", `1-${Date.now()}`);
      const p = String(busy.port);
      await companion(
        [
          "__serve",
          "--session",
          dir,
          "--port",
          p,
          "--port-fallback",
          "--idle-timeout-minutes",
          "0.005",
        ],
        root,
      );
      const s = latestSession(harenDir)!;
      expect(s.info!.port).not.toBe(busy.port);
    } finally {
      await busy.stop(true);
    }
  }, 15000);

  it("an explicit taken --port fails and leaves no session behind", async () => {
    const busy = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
    try {
      await expect(companion(["start", "--port", String(busy.port)], root)).rejects.toThrow();
      expect(latestSession(harenDir)).toBeNull();
      expect(existsSync(join(harenDir, ".companion"))).toBe(true);
    } finally {
      await busy.stop(true);
    }
  }, 15000);

  it("init writes .companion/ into the haren .gitignore", async () => {
    const dir = join(root, "fresh");
    await mkdir(dir, { recursive: true });
    await scaffoldWorkspace(dir, { project: "test", mode: "blueprint", language: "English" });
    const lines = (await readFile(join(dir, ".gitignore"), "utf-8")).split("\n");
    expect(lines).toContain(".companion/");
  });

  it("is wired in the CLI", () => {
    expect(parseArgs(["companion", "start"])).toEqual({ command: "companion", args: ["start"] });
  });
});
