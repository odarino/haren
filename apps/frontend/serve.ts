import index from "./index.html";

const PORTAL_URL = process.env.PORTAL_URL ?? "http://localhost:3000";
const PORTAL_WS_URL = PORTAL_URL.replace(/^http/, "ws");

Bun.serve({
  port: Number(process.env.PORT ?? 3002),
  routes: {
    "/": index,
  },
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade — proxy to backend
    if (url.pathname.startsWith("/ws/")) {
      const target = `${PORTAL_WS_URL}${url.pathname}${url.search}`;
      const upgraded = server.upgrade(req, { data: { target } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Proxy API, SSE, and polling requests to the portal server
    if (
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/sse/") ||
      url.pathname.startsWith("/poll/")
    ) {
      const target = `${PORTAL_URL}${url.pathname}${url.search}`;
      return fetch(target, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });
    }

    return new Response("Not Found", { status: 404 });
  },
  websocket: {
    open(ws) {
      const target = (ws.data as any).target as string;
      const upstream = new WebSocket(target);
      (ws.data as any).upstream = upstream;

      upstream.onmessage = (e) => {
        ws.send(e.data);
      };
      upstream.onclose = () => {
        ws.close();
      };
      upstream.onerror = () => {
        ws.close();
      };
    },
    message(ws, msg) {
      const upstream = (ws.data as any).upstream as WebSocket;
      if (upstream && upstream.readyState === WebSocket.OPEN) {
        upstream.send(typeof msg === "string" ? msg : new TextDecoder().decode(msg));
      }
    },
    close(ws) {
      const upstream = (ws.data as any).upstream as WebSocket;
      if (upstream) upstream.close();
    },
  },
});

console.log(`Haren Web running on http://localhost:${process.env.PORT ?? 3002}`);
