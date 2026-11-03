import { describe, it, expect, afterEach } from "bun:test";
import { mkdtemp, writeFile, readFile, rm, utimes } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  startCompanion,
  isFullDocument,
  newestScreen,
  type CompanionHandle,
} from "../../companion/server";

let dir: string;
let h: CompanionHandle | null = null;
const setup = async (o: Record<string, unknown> = {}) => {
  dir = await mkdtemp(join(tmpdir(), "companion-"));
  h = await startCompanion({ sessionDir: dir, port: 0, key: "k123", ...o });
  return h;
};
afterEach(async () => {
  await h?.stop("test");
  h = null;
  await rm(dir, { recursive: true, force: true });
});
const base = () => `http://127.0.0.1:${h!.info.port}`;

describe("companion server", () => {
  it("writes server-info with the exact keys", async () => {
    await setup();
    const info = JSON.parse(await readFile(join(dir, "state", "server-info"), "utf-8"));
    expect(Object.keys(info).sort()).toEqual(["port", "screen_dir", "state_dir", "type", "url"]);
    expect(info.url).toBe(`http://localhost:${info.port}/?key=k123`);
  });
  it("rejects requests without the key", async () => {
    await setup();
    expect((await fetch(`${base()}/`)).status).toBe(403);
    expect((await fetch(`${base()}/?key=bad`)).status).toBe(403);
  });
  it("sets a cookie and accepts it", async () => {
    await setup();
    const r = await fetch(`${base()}/?key=k123`);
    const cookie = r.headers.get("set-cookie")!;
    expect(cookie).toContain("companion_key=k123");
    expect((await fetch(`${base()}/`, { headers: { cookie: "companion_key=k123" } })).status).toBe(
      200,
    );
  });
  it("wraps a fragment in the frame and serves the newest file", async () => {
    await setup();
    await writeFile(join(dir, "content", "a.html"), "<h2>First</h2>");
    await writeFile(join(dir, "content", "b.html"), "<h2>Second</h2>");
    await utimes(join(dir, "content", "a.html"), new Date(1000), new Date(1000));
    const body = await (await fetch(`${base()}/?key=k123`)).text();
    expect(body).toContain("<h2>Second</h2>");
    expect(body).toContain("haren companion");
    expect(body).toContain("helper.js");
  });
  it("serves a full document with the helper injected", async () => {
    await setup();
    await writeFile(
      join(dir, "content", "full.html"),
      "<!DOCTYPE html><html><body><p>X</p></body></html>",
    );
    const body = await (await fetch(`${base()}/?key=k123`)).text();
    expect(body).toContain("<p>X</p>");
    expect(body).toContain("helper.js");
    expect(body).not.toContain("haren companion</");
  });
  it("blocks path traversal under /files", async () => {
    await setup();
    await writeFile(join(dir, "secret.txt"), "s");
    expect((await fetch(`${base()}/files/..%2Fsecret.txt?key=k123`)).status).toBe(404);
    await writeFile(join(dir, "content", "img.txt"), "ok");
    expect((await fetch(`${base()}/files/img.txt?key=k123`)).status).toBe(200);
  });
  it("records clicks and clears events on a new screen", async () => {
    await setup();
    await writeFile(join(dir, "content", "a.html"), "<p>a</p>");
    const ws = new WebSocket(`ws://127.0.0.1:${h!.info.port}/ws?key=k123`);
    await new Promise((r) => (ws.onopen = r));
    ws.send(JSON.stringify({ type: "click", choice: "b", text: "Option B" }));
    await Bun.sleep(200);
    const line = JSON.parse((await readFile(join(dir, "state", "events"), "utf-8")).trim());
    expect(line).toMatchObject({ type: "click", choice: "b", text: "Option B" });
    expect(typeof line.timestamp).toBe("number");
    expect(line.timestamp).toBeLessThan(1e11);
    expect(line.timestamp).toBeGreaterThan(1e9);
    await writeFile(join(dir, "content", "b.html"), "<p>b</p>");
    await Bun.sleep(1200);
    expect((await readFile(join(dir, "state", "events"), "utf-8")).trim()).toBe("");
    ws.close();
  });
  it("serves helper.js with the session key injected and no placeholder", async () => {
    await setup({ key: "abc123def456" });
    const body = await (await fetch(`${base()}/helper.js?key=abc123def456`)).text();
    expect(body).not.toContain("__COMPANION_KEY__");
    expect(body).toContain('"abc123def456"');
  });
  it("browser path: the key in the served helper opens the WebSocket and records a click", async () => {
    await setup({ key: "abc123def456" });
    await writeFile(join(dir, "content", "a.html"), "<p>a</p>");
    const page = await (await fetch(`${base()}/?key=abc123def456`)).text();
    expect(page).toContain("/helper.js");
    const helper = await (await fetch(`${base()}/helper.js?key=abc123def456`)).text();
    const m = /const COMPANION_KEY = ("(?:[^"\\]|\\.)*");/.exec(helper);
    expect(m).not.toBeNull();
    const served = JSON.parse(m![1]) as string;
    const ws = new WebSocket(`ws://127.0.0.1:${h!.info.port}/ws?key=${encodeURIComponent(served)}`);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = () => rej(new Error("websocket rejected"));
    });
    ws.send(JSON.stringify({ type: "click", choice: "a", text: "A" }));
    await Bun.sleep(200);
    const line = JSON.parse((await readFile(join(dir, "state", "events"), "utf-8")).trim());
    expect(line).toMatchObject({ type: "click", choice: "a" });
    ws.close();
  });
  it("rejects a WebSocket without the key", async () => {
    await setup();
    const ws = new WebSocket(`ws://127.0.0.1:${h!.info.port}/ws`);
    const closed = await new Promise<boolean>((r) => {
      ws.onerror = () => r(true);
      ws.onclose = () => r(true);
      ws.onopen = () => r(false);
    });
    expect(closed).toBe(true);
  });
  it("stops after the idle timeout and writes server-stopped", async () => {
    await setup({ idleTimeoutMs: 300 });
    await Bun.sleep(700);
    expect(existsSync(join(dir, "state", "server-stopped"))).toBe(true);
    h = null;
  });
  it("detects full documents and the newest screen", async () => {
    expect(isFullDocument("  <!doctype html><p>")).toBe(true);
    expect(isFullDocument("<html>")).toBe(true);
    expect(isFullDocument("<h2>x</h2>")).toBe(false);
    dir = await mkdtemp(join(tmpdir(), "companion-"));
    expect(newestScreen(dir)).toBeNull();
  });
  it("renders replacement patterns in a fragment literally", async () => {
    await setup();
    await writeFile(join(dir, "content", "a.html"), "<p>A $& B $' C $1 D $$</p>");
    const body = await (await fetch(`${base()}/?key=k123`)).text();
    expect(body).toContain("<p>A $& B $' C $1 D $$</p>");
  });
  it("injects the helper before an uppercase </BODY>", async () => {
    await setup();
    await writeFile(
      join(dir, "content", "f.html"),
      "<!DOCTYPE html><HTML><BODY><p>U</p></BODY></HTML>",
    );
    const body = await (await fetch(`${base()}/?key=k123`)).text();
    expect(body).toContain('<script src="/helper.js"></script>\n</BODY>');
  });
  it("writes only known click fields and drops invalid clicks", async () => {
    await setup();
    const ws = new WebSocket(`ws://127.0.0.1:${h!.info.port}/ws?key=k123`);
    await new Promise((r) => (ws.onopen = r));
    ws.send(
      JSON.stringify({ type: "click", choice: "a", text: "A", id: "x", evil: 1, timestamp: 5 }),
    );
    ws.send(JSON.stringify({ type: "click", choice: 7, text: "bad" }));
    ws.send(JSON.stringify({ type: "click", choice: "c" }));
    await Bun.sleep(200);
    const lines = (await readFile(join(dir, "state", "events"), "utf-8"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines.length).toBe(2);
    expect(Object.keys(lines[0]).sort()).toEqual(["choice", "text", "timestamp", "type"]);
    expect(lines[0].timestamp).not.toBe(5);
    expect(lines[1]).toMatchObject({ choice: "c", text: "" });
    ws.close();
  });
  it("sends Referrer-Policy no-referrer", async () => {
    await setup();
    const r = await fetch(`${base()}/?key=k123`);
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
  });
});

describe("companion helper logic", () => {
  // helper.js exports its pure parts through module.exports when it runs outside a browser.
  // Run the source directly: server.ts imports the same file as text, which shares the module cache.
  const mod = { exports: {} as Record<string, any> };
  new Function("module", readFileSync(join(import.meta.dir, "../../companion/helper.js"), "utf-8"))(
    mod,
  );
  const helper = mod.exports;
  const el = (o: { sel?: Record<string, string>; text?: string }) => ({
    querySelector: (s: string) => (o.sel && s in o.sel ? { textContent: o.sel[s] } : null),
    innerText: o.text ?? "",
    textContent: o.text ?? "",
  });

  it("caps the reconnect delay at 5 s", () => {
    expect(helper.MAX_RECONNECT_MS).toBe(5000);
    let d = helper.MIN_RECONNECT_MS;
    for (let i = 0; i < 20; i++) d = helper.nextReconnectDelay(d, helper.MAX_RECONNECT_MS);
    expect(d).toBe(5000);
  });

  it("labels a click with the heading, else letter and title, else short text", () => {
    expect(helper.choiceLabel(el({ sel: { ".content h3": "  Single\n  column " } }))).toBe(
      "Single column",
    );
    expect(helper.choiceLabel(el({ sel: { ".card-body h3": "Dark" } }))).toBe("Dark");
    expect(helper.choiceLabel(el({ sel: { ".letter": "A", ".title": "Grid" } }))).toBe("A Grid");
    expect(helper.choiceLabel(el({ text: "  Pass  " }))).toBe("Pass");
    expect(helper.choiceLabel(el({ text: "x ".repeat(300) })).length).toBe(200);
  });
});

describe("companion server click text", () => {
  it("truncates the click text to 200 characters", async () => {
    await setup();
    const ws = new WebSocket(`ws://127.0.0.1:${h!.info.port}/ws?key=k123`);
    await new Promise((r) => (ws.onopen = r));
    ws.send(JSON.stringify({ type: "click", choice: "a", text: "y".repeat(500) }));
    await Bun.sleep(200);
    const line = JSON.parse((await readFile(join(dir, "state", "events"), "utf-8")).trim());
    expect(line.text.length).toBe(200);
    ws.close();
  });
});
