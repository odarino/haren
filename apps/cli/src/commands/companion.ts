// `haren companion start|status|stop`: run the visual companion server for a haren folder.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { join, resolve } from "path";
import { type CompanionInfo, newestScreen, startCompanion } from "../companion/server";
import { ExitCode } from "../lib/exit-code";
import { harenDirFlag, resolveHarenDir } from "../workspace/resolve";

const USAGE = `Usage: haren companion <start|status|stop> [--haren-dir <path>]
  start   [--foreground] [--open] [--port <n>] [--host <h>] [--url-host <u>] [--idle-timeout-minutes <m>]
  status  print the URL of the running server (exit 1 when stopped)
  stop    stop the running server`;

const START_TIMEOUT_MS = 5000;
const START_FLAGS = ["--port", "--open", "--key", "--idle-timeout-minutes", "--host", "--url-host"];

export interface CompanionSession {
  dir: string;
  info: CompanionInfo | null;
  running: boolean;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} needs a value`);
  return value;
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(dir: string): number | null {
  try {
    const n = Number.parseInt(readFileSync(join(dir, "state", "pid"), "utf-8").trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function sessionOf(dir: string): CompanionSession {
  const stateDir = join(dir, "state");
  const info = readJson<CompanionInfo>(join(stateDir, "server-info"));
  const pid = readPid(dir);
  const running =
    info !== null && !existsSync(join(stateDir, "server-stopped")) && pid !== null && pidAlive(pid);
  return { dir, info, running };
}

/** The most recent session folder under `<harenDir>/.companion/`, or null when there is none. */
export function latestSession(harenDir: string): CompanionSession | null {
  const base = join(harenDir, ".companion");
  let best: { dir: string; mtime: number } | null = null;
  let names: string[];
  try {
    names = readdirSync(base);
  } catch {
    return null;
  }
  for (const name of names) {
    const dir = join(base, name);
    try {
      const st = statSync(dir);
      if (!st.isDirectory()) continue;
      // Folder names are <pid>-<epoch ms>; use the epoch, fall back to the mtime.
      const epoch = Number(name.split("-")[1]);
      const t = Number.isFinite(epoch) ? epoch : st.mtimeMs;
      if (!best || t > best.mtime) best = { dir, mtime: t };
    } catch {}
  }
  return best ? sessionOf(best.dir) : null;
}

async function portFree(port: number, host: string): Promise<boolean> {
  try {
    const s = Bun.serve({ hostname: host, port, fetch: () => new Response("") });
    await s.stop(true);
    return true;
  } catch {
    return false;
  }
}

/** The CLI entry file to re-invoke: src/index.ts from source, the bundle file from dist. */
function cliEntry(): string {
  const here = import.meta.path;
  if (/[\\/]commands[\\/]companion\.ts$/.test(here))
    return resolve(import.meta.dir, "..", "index.ts");
  return here;
}

function openBrowser(url: string): void {
  try {
    const cmd =
      process.platform === "darwin"
        ? ["open", url]
        : process.platform === "win32"
          ? ["cmd", "/c", "start", "", url]
          : ["xdg-open", url];
    Bun.spawn(cmd, { stdio: ["ignore", "ignore", "ignore"] }).unref();
  } catch {}
}

async function serve(args: string[]): Promise<void> {
  const sessionDir = flag(args, "--session");
  if (!sessionDir) throw new Error("__serve needs --session <dir>");
  const port = Number(flag(args, "--port") ?? "0");
  const minutes = flag(args, "--idle-timeout-minutes");
  const opts = {
    sessionDir,
    port,
    key: flag(args, "--key"),
    host: flag(args, "--host"),
    urlHost: flag(args, "--url-host"),
    idleTimeoutMs: minutes ? Number(minutes) * 60_000 : undefined,
  };
  let handle: Awaited<ReturnType<typeof startCompanion>>;
  try {
    handle = await startCompanion(opts);
  } catch (e) {
    // A port reused from a previous session may be taken now; an explicit --port is not retried.
    if (!args.includes("--port-fallback") || port === 0) throw e;
    handle = await startCompanion({ ...opts, port: 0 });
  }
  writeFileSync(join(sessionDir, "state", "pid"), `${process.pid}\n`);

  await new Promise<void>((done) => {
    const stopFile = join(handle.info.state_dir, "server-stopped");
    let opened = !args.includes("--open");
    const finish = () => {
      clearInterval(timer);
      process.off("SIGTERM", onSignal);
      process.off("SIGINT", onSignal);
      done();
    };
    const onSignal = () => void handle.stop("stop").then(finish);
    const timer = setInterval(() => {
      if (!opened && newestScreen(handle.info.screen_dir)) {
        opened = true;
        openBrowser(handle.info.url);
      }
      // The server writes server-stopped on idle timeout; end the process then.
      if (existsSync(stopFile)) finish();
    }, 100);
    process.on("SIGTERM", onSignal);
    process.on("SIGINT", onSignal);
  });
  await handle.stop("stop");
}

function keyOf(url: string): string | undefined {
  try {
    return new URL(url).searchParams.get("key") ?? undefined;
  } catch {
    return undefined;
  }
}

function notePortChange(restart: CompanionSession | null, info: CompanionInfo): void {
  if (restart?.info && restart.info.port !== info.port) {
    console.error(
      `The companion port changed from ${restart.info.port} to ${info.port}: port changed, give the user the new URL.`,
    );
  }
}

async function start(harenDir: string, args: string[]): Promise<void> {
  const current = latestSession(harenDir);
  if (current?.running && current.info) {
    const ignored = START_FLAGS.filter((f) => args.includes(f));
    if (ignored.length > 0) {
      console.error(
        `A companion session is already running; reused it and ignored ${ignored.join(", ")}.`,
      );
    }
    console.log(JSON.stringify(current.info));
    return;
  }
  const host = flag(args, "--host") ?? "127.0.0.1";
  let port = 0;
  let reused = false;
  const asked = flag(args, "--port");
  const askedKey = flag(args, "--key");
  // Restart the stopped latest session in place: same dirs, key and port, so the open tab reconnects.
  const restart = current?.info && asked === undefined && askedKey === undefined ? current : null;
  const oldKey = restart ? keyOf(restart.info!.url) : undefined;
  if (asked !== undefined) port = Number(asked);
  else if (current?.info && (await portFree(current.info.port, host))) {
    port = current.info.port;
    reused = true;
  } else if (restart) {
    reused = true; // let __serve fall back to a random port
    port = restart.info!.port;
  }

  const dir = restart ? restart.dir : join(harenDir, ".companion", `${process.pid}-${Date.now()}`);
  const fresh = !restart;
  mkdirSync(join(dir, "state"), { recursive: true });
  if (restart) {
    rmSync(join(dir, "state", "server-stopped"), { force: true });
    rmSync(join(dir, "state", "server-info"), { force: true });
  }
  const serveArgs = ["__serve", "--session", dir, "--port", String(port), "--host", host];
  for (const name of ["--key", "--url-host", "--idle-timeout-minutes"]) {
    const v = flag(args, name);
    if (v !== undefined) serveArgs.push(name, v);
  }
  if (oldKey && askedKey === undefined) serveArgs.push("--key", oldKey);
  if (args.includes("--open")) serveArgs.push("--open");
  if (reused) serveArgs.push("--port-fallback");

  if (args.includes("--foreground")) {
    // Print the info line once the server writes it, then block until stopped.
    const infoFile = join(dir, "state", "server-info");
    const printer = setInterval(() => {
      if (existsSync(infoFile)) {
        clearInterval(printer);
        const text = readFileSync(infoFile, "utf-8").trim();
        const info = readJson<CompanionInfo>(infoFile);
        if (info) notePortChange(restart, info);
        console.log(text);
      }
    }, 50);
    try {
      await serve(serveArgs);
    } catch (e) {
      if (fresh) rmSync(dir, { recursive: true, force: true });
      throw e;
    } finally {
      clearInterval(printer);
    }
    return;
  }

  const child = Bun.spawn([process.execPath, cliEntry(), "companion", ...serveArgs], {
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
  });
  child.unref();
  writeFileSync(join(dir, "state", "pid"), `${child.pid}\n`);

  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const s = sessionOf(dir);
    if (s.info && s.running) {
      notePortChange(restart, s.info);
      console.log(JSON.stringify(s.info));
      return;
    }
    if (child.exitCode !== null) break;
    await Bun.sleep(50);
  }
  try {
    process.kill(child.pid, "SIGTERM");
  } catch {}
  // A failed new session must not become the latest session.
  if (fresh) rmSync(dir, { recursive: true, force: true });
  throw new Error(`The companion server did not start within ${START_TIMEOUT_MS / 1000} s.`);
}

function status(harenDir: string): void {
  const s = latestSession(harenDir);
  if (!s?.running || !s.info) {
    console.log("stopped");
    throw new ExitCode(1, "The companion server is not running.");
  }
  console.log(
    `running ${s.info.url}\nscreen_dir ${s.info.screen_dir}\nstate_dir ${s.info.state_dir}`,
  );
}

async function stop(harenDir: string): Promise<void> {
  const s = latestSession(harenDir);
  let forced = false;
  if (s) {
    const pid = readPid(s.dir);
    // Signal only a running session: after an idle stop the pid may belong to another process.
    if (s.running && pid !== null) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {}
      const deadline = Date.now() + 3000;
      while (pidAlive(pid) && Date.now() < deadline) await Bun.sleep(25);
      if (pidAlive(pid)) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {}
        forced = true;
      }
    }
    const stopped = join(s.dir, "state", "server-stopped");
    if (existsSync(join(s.dir, "state")) && !existsSync(stopped)) {
      writeFileSync(stopped, `${JSON.stringify({ reason: "stop" })}\n`);
    }
  }
  console.log(forced ? "stopped (forced)" : "stopped");
}

export async function companion(args: string[], cwd: string = process.cwd()): Promise<void> {
  const [sub, ...rest] = args;
  if (sub === "__serve") return serve(rest);
  if (!sub || !["start", "status", "stop"].includes(sub)) {
    console.log(USAGE);
    if (sub) throw new ExitCode(1, `Unknown companion command: ${sub}`);
    return;
  }
  const location = await resolveHarenDir(cwd, { harenDir: harenDirFlag(args), env: process.env });
  if (!location) throw new Error("No haren folder found. Run `haren init` first.");
  const harenDir = location.harenDir;
  if (sub === "start") return start(harenDir, rest);
  if (sub === "status") return status(harenDir);
  return stop(harenDir);
}
