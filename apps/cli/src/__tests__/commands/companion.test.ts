import { describe, it, expect, beforeEach, afterEach, spyOn, type Mock } from "bun:test";
import { existsSync, readdirSync, statSync } from "fs";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  buildServeArgs,
  companion,
  companionDeps,
  latestSession,
  pickOwnerPid,
} from "../../commands/companion";
import { scaffoldWorkspace } from "../../commands/init";

describe("haren companion", () => {
  let root: string;
  let harenDir: string;
  // Captured, so no server-started JSON leaks into the test output.
  let log: Mock<typeof console.log>;
  let err: Mock<typeof console.error>;
  const deps = { ...companionDeps };

  beforeEach(async () => {
    log = spyOn(console, "log").mockImplementation(() => {});
    err = spyOn(console, "error").mockImplementation(() => {});
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
    Object.assign(companionDeps, deps);
    log.mockRestore();
    err.mockRestore();
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
    log.mockClear();
    await companion(["status"], root);
    expect(log.mock.calls.map((c) => c.join(" ")).join("\n")).toBe(
      `running ${info.url}\nscreen_dir ${info.screen_dir}\nstate_dir ${info.state_dir}`,
    );
  }, 15000);

  it("start while running reuses the session and notes ignored flags", async () => {
    await companion(["start"], root);
    const first = latestSession(harenDir)!;
    err.mockClear();
    await companion(["start"], root);
    expect(err).not.toHaveBeenCalled();
    await companion(["start", "--port", "1", "--open"], root);
    expect(String(err.mock.calls[0]?.[0])).toContain("ignored --port, --open");
    const now = latestSession(harenDir)!;
    expect(now.dir).toBe(first.dir);
    expect(now.running).toBe(true);
  }, 15000);

  it("--foreground serves in-process until server-stopped appears", async () => {
    const run = companion(["start", "--foreground"], root);
    let s = latestSession(harenDir);
    for (let i = 0; i < 100 && !s?.running; i++) {
      await Bun.sleep(20);
      s = latestSession(harenDir);
    }
    expect(s!.running).toBe(true);
    expect((await fetch(s!.info!.url)).status).toBe(200);
    await writeFile(join(s!.dir, "state", "server-stopped"), '{"reason":"idle"}\n');
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

  const ignoreTerm = async () => {
    const script = join(root, "ignore-term.ts");
    await writeFile(script, 'process.on("SIGTERM", () => {});\nsetInterval(() => {}, 1000);\n');
    const child = Bun.spawn([process.execPath, script], { stdio: ["ignore", "ignore", "ignore"] });
    await Bun.sleep(400); // let it install the SIGTERM handler
    return child;
  };
  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  const deadPid = async () => {
    const p = Bun.spawn(["true"]);
    await p.exited;
    return p.pid;
  };

  it("start rejects a bad --port or --idle-timeout-minutes with a JSON error", async () => {
    for (const bad of [
      ["--port", "abc"],
      ["--port", "70000"],
      ["--port", "1.5"],
      ["--idle-timeout-minutes", "0"],
      ["--idle-timeout-minutes", "1.5"],
      ["--idle-timeout-minutes", "x"],
    ]) {
      log.mockClear();
      await expect(companion(["start", ...bad], root)).rejects.toThrow(/must be/);
      const out = JSON.parse(String(log.mock.calls[0]?.[0]));
      expect(out.error).toContain(bad[0]);
    }
    expect(existsSync(join(harenDir, ".companion"))).toBe(false);
    await expect(
      companion(["__serve", "--session", join(root, "x"), "--port", "-1"], root),
    ).rejects.toThrow(/--port must be/);
    await expect(
      companion(["__serve", "--session", join(root, "x"), "--idle-timeout-minutes", "0"], root),
    ).rejects.toThrow(/positive/);
  });

  it("buildServeArgs passes a key file, never the key", () => {
    const args = buildServeArgs("/s", {
      port: 0,
      host: "127.0.0.1",
      keyFile: "/s/state/key",
      ownerPid: 42,
    });
    expect(args).toContain("--key-file");
    expect(args).not.toContain("--key");
    expect(args[args.indexOf("--owner-pid") + 1]).toBe("42");
  });

  it("start writes state/key before the spawn and keeps the key off argv", async () => {
    const seen: { args: string[]; key: boolean; info: boolean; dir: string }[] = [];
    const pid = await deadPid();
    companionDeps.spawnServe = (args) => {
      const dir = args[args.indexOf("--session") + 1];
      seen.push({
        args,
        dir,
        key: existsSync(join(dir, "state", "key")),
        info: existsSync(join(dir, "state", "server-info")),
      });
      return { pid, exitCode: 1 };
    };
    await expect(companion(["start", "--key", "s3cret-value"], root)).rejects.toThrow();
    expect(seen.length).toBe(1);
    expect(seen[0].key).toBe(true);
    expect(seen[0].info).toBe(false);
    expect(seen[0].args.join(" ")).not.toContain("s3cret-value");
    expect(seen[0].args).toContain("--owner-pid");
    expect(existsSync(seen[0].dir)).toBe(false);
  });

  it("--no-owner-watch passes no owner pid", async () => {
    let seen: string[] = [];
    const pid = await deadPid();
    companionDeps.spawnServe = (args) => {
      seen = args;
      return { pid, exitCode: 1 };
    };
    await expect(companion(["start", "--no-owner-watch"], root)).rejects.toThrow();
    expect(seen).not.toContain("--owner-pid");
  });

  it("__serve writes state/key before server-info", async () => {
    const dir = join(harenDir, ".companion", `1-${Date.now()}`);
    await companion(["__serve", "--session", dir, "--idle-timeout-minutes", "0.005"], root);
    const st = join(dir, "state");
    expect(statSync(join(st, "key")).mtimeMs).toBeLessThanOrEqual(
      statSync(join(st, "server-info")).mtimeMs,
    );
    const key = (await readFile(join(st, "key"), "utf-8")).trim();
    const info = JSON.parse(await readFile(join(st, "server-info"), "utf-8"));
    expect(new URL(info.url).searchParams.get("key")).toBe(key);
  }, 15000);

  it("__serve stops with owner-exited when the owner process ends", async () => {
    const owner = Bun.spawn(["sleep", "30"]);
    const dir = join(harenDir, ".companion", `1-${Date.now()}`);
    const run = companion(["__serve", "--session", dir, "--owner-pid", String(owner.pid)], root);
    await Bun.sleep(300);
    expect(latestSession(harenDir)!.running).toBe(true);
    owner.kill("SIGKILL");
    await owner.exited;
    await run;
    const stopped = JSON.parse(await readFile(join(dir, "state", "server-stopped"), "utf-8"));
    expect(stopped.reason).toBe("owner-exited");
  }, 15000);

  it.skipIf(process.platform === "win32")(
    "uses 0700 folders and 0600 files",
    async () => {
      await companion(["start"], root);
      const s = latestSession(harenDir)!;
      await writeFile(join(s.info!.screen_dir, "a.html"), "<p>a</p>");
      await Bun.sleep(800); // the poll writes the events file for a new screen
      for (const d of [s.dir, s.info!.screen_dir, s.info!.state_dir])
        expect(statSync(d).mode & 0o777).toBe(0o700);
      for (const f of ["server-info", "events", "pid", "key", "options.json"])
        expect(statSync(join(s.info!.state_dir, f)).mode & 0o777).toBe(0o600);
    },
    15000,
  );

  it("restart keeps --host, --url-host and --idle-timeout-minutes", async () => {
    await companion(
      ["start", "--host", "127.0.0.1", "--url-host", "127.0.0.1", "--idle-timeout-minutes", "7"],
      root,
    );
    const a = latestSession(harenDir)!;
    expect(a.info!.url.startsWith("http://127.0.0.1:")).toBe(true);
    await companion(["stop"], root);
    await companion(["start"], root);
    const b = latestSession(harenDir)!;
    expect(b.dir).toBe(a.dir);
    expect(b.info!.url).toBe(a.info!.url);
    const opts = JSON.parse(await readFile(join(b.dir, "state", "options.json"), "utf-8"));
    expect(opts).toEqual({ host: "127.0.0.1", urlHost: "127.0.0.1", idleTimeoutMinutes: "7" });
  }, 15000);

  it("a start timeout kills a child that ignores SIGTERM and leaves no folder", async () => {
    const child = await ignoreTerm();
    companionDeps.startTimeoutMs = 200;
    companionDeps.startKillWaitMs = 200;
    companionDeps.spawnServe = () => child;
    await expect(companion(["start"], root)).rejects.toThrow(/did not start/);
    await child.exited;
    expect(alive(child.pid)).toBe(false);
    expect(readdirSync(join(harenDir, ".companion"))).toEqual([]);
  }, 15000);

  it("stop forces a server that ignores SIGTERM", async () => {
    await companion(["start"], root);
    const s = latestSession(harenDir)!;
    await companion(["stop"], root);
    // Make the session look running again, owned by a process that ignores SIGTERM.
    const child = await ignoreTerm();
    await rm(join(s.dir, "state", "server-stopped"));
    await writeFile(join(s.dir, "state", "pid"), `${child.pid}\n`);
    companionDeps.stopWaitMs = 200;
    log.mockClear();
    await companion(["stop"], root);
    expect(log.mock.calls.at(-1)?.[0]).toBe("stopped (forced)");
    await child.exited;
    expect(alive(child.pid)).toBe(false);
  }, 15000);

  it("pickOwnerPid skips shells and env, then falls back", () => {
    const tree: Record<number, { ppid: number; comm: string }> = {
      50: { ppid: 40, comm: "/bin/sh" },
      40: { ppid: 30, comm: "-zsh" },
      30: { ppid: 20, comm: "/usr/bin/env" },
      20: { ppid: 1, comm: "claude" },
      60: { ppid: 70, comm: "bash" },
      70: { ppid: 1, comm: "sh" },
    };
    const ps = (pid: number) => tree[pid] ?? null;
    expect(pickOwnerPid(50, ps)).toBe(20);
    expect(pickOwnerPid(20, ps)).toBe(20);
    // Only shells up to pid 1: fall back to the grandparent.
    expect(pickOwnerPid(60, ps)).toBe(70);
    expect(pickOwnerPid(99, () => null)).toBe(99);
  });

  it.skipIf(process.platform === "win32")(
    "start through an sh wrapper in a short-lived sh -c picks the test process as owner",
    async () => {
      const wrapper = join(root, "haren-wrapper");
      const entry = join(import.meta.dir, "..", "..", "index.ts");
      await writeFile(wrapper, `#!/bin/sh\n"${process.execPath}" "${entry}" "$@"\n`, {
        mode: 0o755,
      });
      const sh = Bun.spawn(["sh", "-c", `"${wrapper}" companion start --haren-dir "${harenDir}"`], {
        stdio: ["ignore", "ignore", "ignore"],
      });
      await sh.exited;
      const s = latestSession(harenDir)!;
      expect(s.running).toBe(true);
      const pid = (await readFile(join(s.dir, "state", "pid"), "utf-8")).trim();
      const args = Bun.spawnSync(["ps", "-o", "args=", "-p", pid]).stdout.toString();
      expect(args).toContain(`--owner-pid ${process.pid}`);
      await Bun.sleep(1500); // past one owner check
      expect(latestSession(harenDir)!.running).toBe(true);
    },
    20000,
  );

  it("is wired in the CLI", async () => {
    // Imported here: importing index prints the help text, and the console is captured now.
    const { parseArgs } = await import("../../index");
    expect(parseArgs(["companion", "start"])).toEqual({ command: "companion", args: ["start"] });
  });
});
