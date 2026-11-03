// `haren companion start|status|stop`: run the visual companion server for a haren folder.
import { randomBytes } from "crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { spawnSync } from "child_process";
import { join, resolve } from "path";
import {
  type CompanionInfo,
  makePrivateDir,
  newestScreen,
  startCompanion,
  writePrivateFile,
} from "../companion/server";
import { ExitCode } from "../lib/exit-code";
import { harenDirFlag, resolveHarenDir } from "../workspace/resolve";

const USAGE = `Usage: haren companion <start|status|stop> [--haren-dir <path>]
  start   [--foreground] [--open] [--port <n>] [--host <h>] [--url-host <u>] [--idle-timeout-minutes <m>]
          [--key <k>] [--no-owner-watch]
  status  print the URL of the running server (exit 1 when stopped)
  stop    stop the running server`;

const START_FLAGS = [
  "--port",
  "--open",
  "--key",
  "--idle-timeout-minutes",
  "--host",
  "--url-host",
  "--no-owner-watch",
];

/** Process hooks. Tests replace them to reach the timeout and forced-kill paths. */
export const companionDeps = {
  startTimeoutMs: 5000,
  /** Wait for the child to exit after SIGTERM, then SIGKILL. */
  startKillWaitMs: 1000,
  stopWaitMs: 3000,
  spawnServe(serveArgs: string[]): { pid: number; exitCode: number | null } {
    const child = Bun.spawn([process.execPath, cliEntry(), "companion", ...serveArgs], {
      stdio: ["ignore", "ignore", "ignore"],
      detached: true,
    });
    child.unref();
    return child;
  },
};

/** Options a restart reuses, kept in state/options.json. */
interface StartOptions {
  host: string;
  urlHost?: string;
  idleTimeoutMinutes?: string;
}

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
  } catch (e) {
    // EPERM: the process exists but belongs to another user.
    return (e as NodeJS.ErrnoException).code === "EPERM";
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
  // server-info.prev holds the last info while a restart is in progress (or after a crash in it).
  const info =
    readJson<CompanionInfo>(join(stateDir, "server-info")) ??
    readJson<CompanionInfo>(join(stateDir, "server-info.prev"));
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

/** A bad flag value: print a JSON error line to stdout and exit 1. */
function badValue(message: string): never {
  console.log(JSON.stringify({ error: message }));
  throw new ExitCode(1, message);
}

function checkPort(value: string | undefined): void {
  if (value === undefined) return;
  const n = Number(value);
  if (!/^\d+$/.test(value) || n > 65535) badValue("--port must be an integer from 0 to 65535");
}

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "fish", "ksh", "tcsh", "csh", "env"]);

export interface PsEntry {
  ppid: number;
  comm: string;
}

/** `ps -o ppid=,comm= -p <pid>`, or null when ps fails. */
function readPs(pid: number): PsEntry | null {
  try {
    const r = spawnSync("ps", ["-o", "ppid=,comm=", "-p", String(pid)], { encoding: "utf-8" });
    const m = /^\s*(\d+)\s+(.+?)\s*$/.exec(String(r.stdout));
    return m ? { ppid: Number(m[1]), comm: m[2] } : null;
  } catch {
    return null;
  }
}

function isShell(comm: string): boolean {
  const base = comm.split("/").pop() ?? comm;
  return SHELLS.has(base.replace(/^-/, ""));
}

/**
 * The agent harness process that owns this CLI call: the first ancestor from `start` that is
 * not a shell or `env`. Agent tool calls run the CLI through short-lived shells (and maybe a
 * wrapper script), so those do not count. Without a non-shell ancestor, fall back to the
 * grandparent (as superpowers start-server.sh), then the parent.
 */
export function pickOwnerPid(
  start: number,
  ps: (pid: number) => PsEntry | null = readPs,
): number | undefined {
  let pid = start;
  for (let hops = 0; pid > 1 && hops < 64; hops++) {
    const e = ps(pid);
    if (!e) break;
    if (!isShell(e.comm)) return pid;
    pid = e.ppid;
  }
  const gp = ps(start)?.ppid;
  if (gp !== undefined && gp > 1) return gp;
  return start > 1 ? start : undefined;
}

function ownerPid(): number | undefined {
  if (process.platform === "win32") return undefined;
  return pickOwnerPid(process.ppid);
}

export interface ServeArgOptions {
  port: number;
  host: string;
  keyFile: string;
  urlHost?: string;
  idleTimeoutMinutes?: string;
  open?: boolean;
  portFallback?: boolean;
  ownerPid?: number;
}

/** The `__serve` arguments. The key goes in a file, never on the command line. */
export function buildServeArgs(dir: string, o: ServeArgOptions): string[] {
  const args = ["__serve", "--session", dir, "--port", String(o.port), "--host", o.host];
  args.push("--key-file", o.keyFile);
  if (o.urlHost !== undefined) args.push("--url-host", o.urlHost);
  if (o.idleTimeoutMinutes !== undefined) args.push("--idle-timeout-minutes", o.idleTimeoutMinutes);
  if (o.ownerPid !== undefined) args.push("--owner-pid", String(o.ownerPid));
  if (o.open) args.push("--open");
  if (o.portFallback) args.push("--port-fallback");
  return args;
}

const OWNER_CHECK_MS = 1000;

async function serve(args: string[]): Promise<void> {
  const sessionDir = flag(args, "--session");
  if (!sessionDir) throw new Error("__serve needs --session <dir>");
  const portText = flag(args, "--port") ?? "0";
  checkPort(portText);
  const port = Number(portText);
  const minutes = flag(args, "--idle-timeout-minutes");
  // __serve is internal: a fraction of a minute is allowed (tests use short timeouts).
  if (minutes !== undefined && !(Number(minutes) > 0))
    badValue("--idle-timeout-minutes must be a positive number");
  const ownerText = flag(args, "--owner-pid");
  let owner = ownerText === undefined ? undefined : Number(ownerText);
  if (owner !== undefined && !(Number.isInteger(owner) && owner > 0))
    badValue("--owner-pid must be a positive integer");
  // An owner that is gone already means a wrong pid: watch nothing, rely on the idle timeout.
  if (owner !== undefined && !pidAlive(owner)) owner = undefined;

  const stateDir = join(sessionDir, "state");
  for (const d of [sessionDir, join(sessionDir, "content"), stateDir]) makePrivateDir(d);
  // The key file is written before the server writes server-info.
  const keyPath = join(stateDir, "key");
  const keyFile = flag(args, "--key-file");
  let key = keyFile ? readKey(keyFile) : undefined;
  if (keyFile && !key) throw new Error(`No key in ${keyFile}`);
  key ??= randomBytes(16).toString("hex");
  if (!keyFile || resolve(keyFile) !== resolve(keyPath)) writePrivateFile(keyPath, `${key}\n`);

  const opts = {
    sessionDir,
    port,
    key,
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
  writePrivateFile(join(stateDir, "pid"), `${process.pid}\n`);

  await new Promise<void>((done) => {
    const stopFile = join(handle.info.state_dir, "server-stopped");
    let opened = !args.includes("--open");
    let lastOwnerCheck = Date.now();
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
      if (owner !== undefined && Date.now() - lastOwnerCheck >= OWNER_CHECK_MS) {
        lastOwnerCheck = Date.now();
        if (!pidAlive(owner)) {
          void handle.stop("owner-exited").then(finish);
          return;
        }
      }
      // The server writes server-stopped on idle timeout; end the process then.
      if (existsSync(stopFile)) finish();
    }, 100);
    process.on("SIGTERM", onSignal);
    process.on("SIGINT", onSignal);
  });
  await handle.stop("stop");
}

function readKey(path: string): string | undefined {
  try {
    return readFileSync(path, "utf-8").trim() || undefined;
  } catch {
    return undefined;
  }
}

/** After a failed restart: put the previous server-info back, unless a new one exists. */
function restoreInfo(dir: string): void {
  const infoPath = join(dir, "state", "server-info");
  if (!existsSync(infoPath) && existsSync(`${infoPath}.prev`))
    renameSync(`${infoPath}.prev`, infoPath);
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

async function waitExit(pid: number, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (pidAlive(pid) && Date.now() < deadline) await Bun.sleep(25);
  return !pidAlive(pid);
}

/** SIGTERM, wait, then SIGKILL. True when SIGKILL was needed. */
async function terminate(pid: number, waitMs: number): Promise<boolean> {
  try {
    process.kill(pid, "SIGTERM");
  } catch {}
  if (await waitExit(pid, waitMs)) return false;
  try {
    process.kill(pid, "SIGKILL");
  } catch {}
  await waitExit(pid, 1000);
  return true;
}

async function start(harenDir: string, args: string[]): Promise<void> {
  const askedPort = flag(args, "--port");
  checkPort(askedPort);
  const askedMinutes = flag(args, "--idle-timeout-minutes");
  if (askedMinutes !== undefined && (!/^\d+$/.test(askedMinutes) || Number(askedMinutes) < 1))
    badValue("--idle-timeout-minutes must be a positive integer");

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
  const askedKey = flag(args, "--key");
  // Restart the stopped latest session in place: same dirs, key and port, so the open tab reconnects.
  const restart =
    current?.info && askedPort === undefined && askedKey === undefined ? current : null;
  const saved = restart ? readJson<StartOptions>(join(restart.dir, "state", "options.json")) : null;
  const options: StartOptions = {
    host: flag(args, "--host") ?? saved?.host ?? "127.0.0.1",
    urlHost: flag(args, "--url-host") ?? saved?.urlHost,
    idleTimeoutMinutes: askedMinutes ?? saved?.idleTimeoutMinutes,
  };
  let port = 0;
  let reused = false;
  if (askedPort !== undefined) port = Number(askedPort);
  else if (current?.info && (await portFree(current.info.port, options.host))) {
    port = current.info.port;
    reused = true;
  } else if (restart) {
    reused = true; // let __serve fall back to a random port
    port = restart.info!.port;
  }

  const dir = restart ? restart.dir : join(harenDir, ".companion", `${process.pid}-${Date.now()}`);
  const fresh = !restart;
  const stateDir = join(dir, "state");
  for (const d of [dir, join(dir, "content"), stateDir]) makePrivateDir(d);
  const keyPath = join(stateDir, "key");
  const oldKey = restart ? (readKey(keyPath) ?? keyOf(restart.info!.url)) : undefined;
  writePrivateFile(keyPath, `${askedKey ?? oldKey ?? randomBytes(16).toString("hex")}\n`);
  if (restart) {
    rmSync(join(stateDir, "server-stopped"), { force: true });
    // Move the old info aside (not delete it), so a failed restart can restore it.
    const infoPath = join(stateDir, "server-info");
    if (existsSync(infoPath)) renameSync(infoPath, `${infoPath}.prev`);
  }
  const foreground = args.includes("--foreground");
  const serveArgs = buildServeArgs(dir, {
    port,
    host: options.host,
    keyFile: keyPath,
    urlHost: options.urlHost,
    idleTimeoutMinutes: options.idleTimeoutMinutes,
    open: args.includes("--open"),
    portFallback: reused,
    // --foreground: the owner is this process, so a watch adds nothing.
    ownerPid: foreground || args.includes("--no-owner-watch") ? undefined : ownerPid(),
  });
  const fail = () => {
    // A failed new session must not become the latest session.
    if (fresh) rmSync(dir, { recursive: true, force: true });
    else restoreInfo(dir);
  };
  const succeed = (info: CompanionInfo) => {
    rmSync(join(stateDir, "server-info.prev"), { force: true });
    writePrivateFile(join(stateDir, "options.json"), `${JSON.stringify(options)}\n`);
    notePortChange(restart, info);
  };

  if (foreground) {
    // Print the info line once the server writes it, then block until stopped.
    const infoFile = join(stateDir, "server-info");
    const printer = setInterval(() => {
      if (existsSync(infoFile)) {
        const info = readJson<CompanionInfo>(infoFile);
        if (!info) return;
        clearInterval(printer);
        succeed(info);
        console.log(JSON.stringify(info));
      }
    }, 50);
    try {
      await serve(serveArgs);
    } catch (e) {
      fail();
      throw e;
    } finally {
      clearInterval(printer);
    }
    return;
  }

  const child = companionDeps.spawnServe(serveArgs);
  writePrivateFile(join(stateDir, "pid"), `${child.pid}\n`);

  const deadline = Date.now() + companionDeps.startTimeoutMs;
  while (Date.now() < deadline) {
    const s = sessionOf(dir);
    if (s.info && s.running && existsSync(join(stateDir, "server-info"))) {
      succeed(s.info);
      console.log(JSON.stringify(s.info));
      return;
    }
    if (child.exitCode !== null) break;
    await Bun.sleep(50);
  }
  await terminate(child.pid, companionDeps.startKillWaitMs);
  fail();
  throw new Error(
    `The companion server did not start within ${companionDeps.startTimeoutMs / 1000} s.`,
  );
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
    if (s.running && pid !== null) forced = await terminate(pid, companionDeps.stopWaitMs);
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
