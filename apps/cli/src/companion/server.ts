// Companion server: shows agent-written HTML screens in a browser and records clicks.
// Adapted from the superpowers visual companion (MIT, Jesse Vincent). See ./NOTICE.
import { randomBytes, timingSafeEqual } from "crypto";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { basename, extname, join, sep } from "path";
import type { Server, ServerWebSocket } from "bun";
// Text imports embed the files in the bundle, so they work from source and from dist.
// TypeScript types these imports by extension (HTMLBundle / untyped JS), so cast to string.
import frameTemplateText from "./frame-template.html" with { type: "text" };
// @ts-expect-error: no declaration file for a text-imported .js asset
import helperText from "./helper.js" with { type: "text" };

const frameTemplate = frameTemplateText as unknown as string;
const helperSource = helperText as string;

export interface CompanionOptions {
  sessionDir: string; // contains content/ and state/ (created if missing)
  host?: string; // default "127.0.0.1"
  urlHost?: string; // default "localhost"
  port?: number; // 0 = random
  key?: string; // default random 32 hex chars
  idleTimeoutMs?: number; // default 240 * 60_000
}
export interface CompanionInfo {
  type: "server-started";
  port: number;
  url: string;
  screen_dir: string;
  state_dir: string;
}
export interface CompanionHandle {
  info: CompanionInfo;
  stop(reason?: string): Promise<void>;
}

const COOKIE_NAME = "companion_key";
const POLL_MS = 500;
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};
const SECURITY_HEADERS = {
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
};
const FORBIDDEN_PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Session key required</title></head>
<body><h1>Session key required</h1>
<p>Open the full URL your coding agent gave you, including the <code>?key=&hellip;</code> part.</p></body></html>`;
const WAITING_CONTENT = `<h2>haren companion</h2>
<p class="subtitle">Waiting for the agent to push a screen...</p>`;
const HELPER_TAG = '<script src="/helper.js"></script>';

/** Create a folder only the owner can use (0700); an existing folder gets its mode set. */
export function makePrivateDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {}
}

/** Write a file only the owner can read (0600), also when the file exists already. */
export function writePrivateFile(path: string, data: string): void {
  writeFileSync(path, data, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {}
}

export function isFullDocument(html: string): boolean {
  const t = html.trimStart().toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html");
}

function isRegularFileInside(dir: string, filePath: string): boolean {
  try {
    const st = lstatSync(filePath);
    if (st.isSymbolicLink() || !st.isFile() || st.nlink !== 1) return false;
    return realpathSync(filePath).startsWith(realpathSync(dir) + sep);
  } catch {
    return false;
  }
}

export function newestScreen(contentDir: string): string | null {
  let names: string[];
  try {
    names = readdirSync(contentDir);
  } catch {
    return null;
  }
  let best: { path: string; mtime: number } | null = null;
  for (const name of names) {
    if (name.startsWith(".") || !name.endsWith(".html")) continue;
    const fp = join(contentDir, name);
    if (!isRegularFileInside(contentDir, fp)) continue;
    const mtime = statSync(fp).mtimeMs;
    if (!best || mtime > best.mtime) best = { path: fp, mtime };
  }
  return best ? best.path : null;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq >= 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function wrapInFrame(content: string): string {
  // Function replacer: a string replacement would expand $&, $', $1 in the content.
  return frameTemplate.replace("<!-- CONTENT -->", () => content);
}

function injectHelper(html: string): string {
  if (html.includes(HELPER_TAG)) return html;
  const re = /<\/body>/i;
  return re.test(html) ? html.replace(re, (m) => `${HELPER_TAG}\n${m}`) : html + HELPER_TAG;
}

function urlHostForHttp(host: string): string {
  if (host.startsWith("[") && host.endsWith("]")) return host;
  return host.includes(":") ? `[${host}]` : host;
}

// Security model: there is no WebSocket Origin check, and the key stays in the URL
// (no bootstrap redirect). Every request, the /ws upgrade included, needs the key.
// - A cross-site page does not know the key.
// - The cookie is SameSite=Strict, so the browser does not send it cross-site.
// - A DNS-rebinding page reaches the port but has no key and no cookie for its origin.
// - Referrer-Policy: no-referrer stops the keyed URL from leaking via the Referer header.
export async function startCompanion(opts: CompanionOptions): Promise<CompanionHandle> {
  const contentDir = join(opts.sessionDir, "content");
  const stateDir = join(opts.sessionDir, "state");
  for (const dir of [opts.sessionDir, contentDir, stateDir]) makePrivateDir(dir);
  const stoppedFile = join(stateDir, "server-stopped");
  const eventsFile = join(stateDir, "events");
  rmSync(stoppedFile, { force: true });
  if (existsSync(eventsFile)) chmodSync(eventsFile, 0o600);

  const key = opts.key ?? randomBytes(16).toString("hex");
  const idleTimeoutMs = opts.idleTimeoutMs ?? 240 * 60_000;
  // Replace the whole quoted literal with a JSON string; a function replacer avoids $-expansion.
  const helperScript = helperSource.replaceAll("'__COMPANION_KEY__'", () => JSON.stringify(key));
  const clients = new Set<ServerWebSocket<unknown>>();

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const touch = () => {
    if (stopped) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => void stop("idle"), idleTimeoutMs);
  };

  const keyFromRequest = (req: Request, url: URL): { ok: boolean; viaQuery: boolean } => {
    const q = url.searchParams.get("key");
    if (q !== null) return { ok: q !== "" && safeEqual(q, key), viaQuery: true };
    const c = cookieValue(req.headers.get("cookie"), COOKIE_NAME);
    return { ok: c !== null && safeEqual(c, key), viaQuery: false };
  };

  const respond = (
    body: BodyInit,
    type: string,
    status = 200,
    extra: Record<string, string> = {},
  ) =>
    new Response(body, {
      status,
      headers: { ...SECURITY_HEADERS, "Content-Type": type, ...extra },
    });

  const server: Server<unknown> = Bun.serve({
    hostname: opts.host ?? "127.0.0.1",
    port: opts.port ?? 0,
    fetch(req, srv) {
      const url = new URL(req.url);
      const auth = keyFromRequest(req, url);
      if (!auth.ok) return respond(FORBIDDEN_PAGE, "text/html; charset=utf-8", 403);
      touch();

      if (url.pathname === "/ws") {
        if (srv.upgrade(req, { data: undefined })) return undefined;
        return respond("WebSocket upgrade expected", "text/plain", 400);
      }
      const extra: Record<string, string> = auth.viaQuery
        ? { "Set-Cookie": `${COOKIE_NAME}=${key}; HttpOnly; SameSite=Strict; Path=/` }
        : {};
      if (req.method !== "GET") return respond("Not found", "text/plain", 404, extra);

      if (url.pathname === "/") {
        const screen = newestScreen(contentDir);
        const raw = screen ? readFileSync(screen, "utf-8") : null;
        const html =
          raw === null
            ? wrapInFrame(WAITING_CONTENT)
            : isFullDocument(raw)
              ? injectHelper(raw)
              : wrapInFrame(raw);
        return respond(html, "text/html; charset=utf-8", 200, extra);
      }
      if (url.pathname === "/helper.js") {
        return respond(helperScript, "application/javascript", 200, extra);
      }
      if (url.pathname.startsWith("/files/")) {
        let name: string;
        try {
          name = basename(decodeURIComponent(url.pathname.slice("/files/".length)));
        } catch {
          return respond("Not found", "text/plain", 404, extra);
        }
        const fp = join(contentDir, name);
        if (!name || name.startsWith(".") || !isRegularFileInside(contentDir, fp)) {
          return respond("Not found", "text/plain", 404, extra);
        }
        const type = MIME_TYPES[extname(fp).toLowerCase()] ?? "application/octet-stream";
        return respond(readFileSync(fp), type, 200, extra);
      }
      return respond("Not found", "text/plain", 404, extra);
    },
    websocket: {
      open(ws) {
        clients.add(ws);
        touch();
      },
      close(ws) {
        clients.delete(ws);
      },
      message(_ws, message) {
        touch();
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(String(message));
        } catch {
          return;
        }
        if (!event || typeof event !== "object" || event.type !== "click") return;
        // Write only known fields. A non-string choice drops the event; a missing text becomes "".
        const { choice, text = "" } = event;
        if (typeof choice !== "string" || typeof text !== "string") return;
        const line = { type: "click", choice, text, timestamp: Math.floor(Date.now() / 1000) };
        appendFileSync(eventsFile, `${JSON.stringify(line)}\n`, { mode: 0o600 });
      },
    },
  });

  // Poll content/ for screen changes: reload clients; a new newest file clears events.
  const signature = (p: string | null) => {
    if (!p) return "";
    try {
      return `${p}:${statSync(p).mtimeMs}`;
    } catch {
      return "";
    }
  };
  let lastPath = newestScreen(contentDir);
  let lastSig = signature(lastPath);
  const poll = setInterval(() => {
    const current = newestScreen(contentDir);
    const sig = signature(current);
    if (sig === lastSig) return;
    if (current !== lastPath) writePrivateFile(eventsFile, "");
    lastPath = current;
    lastSig = sig;
    const msg = JSON.stringify({ type: "reload" });
    for (const ws of clients) ws.send(msg);
  }, POLL_MS);

  const port = server.port as number;
  const info: CompanionInfo = {
    type: "server-started",
    port,
    url: `http://${urlHostForHttp(opts.urlHost ?? "localhost")}:${port}/?key=${key}`,
    screen_dir: contentDir,
    state_dir: stateDir,
  };
  writePrivateFile(join(stateDir, "server-info"), `${JSON.stringify(info)}\n`);

  async function stop(reason = "stopped"): Promise<void> {
    if (stopped) return;
    stopped = true;
    if (idleTimer) clearTimeout(idleTimer);
    clearInterval(poll);
    if (existsSync(stateDir)) {
      writeFileSync(stoppedFile, `${JSON.stringify({ reason })}\n`);
    }
    await server.stop(true);
  }

  touch();
  return { info, stop };
}
