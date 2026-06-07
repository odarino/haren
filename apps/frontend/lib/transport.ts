type MessageHandler = (msg: unknown) => void;
type StatusHandler = (status: "connected" | "reconnecting" | "offline") => void;

interface TransportOptions {
  baseUrl: string;
  onMessage: MessageHandler;
  onStatus: StatusHandler;
}

export class Transport {
  private options: TransportOptions;
  private ws: WebSocket | null = null;
  private eventSource: EventSource | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private sessionId: string | null = null;
  private mode: "ws" | "sse" | "poll" | null = null;
  private retryCount = 0;
  private maxRetries = 5;
  private lastAuth: { teamId: string; userId: string } | null = null;

  constructor(options: TransportOptions) {
    this.options = options;
  }

  async connect(authPayload: { teamId: string; userId: string }): Promise<void> {
    this.lastAuth = authPayload;
    this.options.onStatus("reconnecting");

    try {
      await this.tryWebSocket(authPayload);
      return;
    } catch {
      console.log("WebSocket unavailable, trying SSE...");
    }

    try {
      await this.trySSE(authPayload);
      return;
    } catch {
      console.log("SSE unavailable, falling back to polling...");
    }

    await this.tryPolling(authPayload);
  }

  private tryWebSocket(auth: { teamId: string; userId: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.options.baseUrl.replace(/^http/, "ws") + "/ws/browser";
      const ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("WebSocket timeout"));
      }, 5000);

      ws.onopen = () => {
        clearTimeout(timeout);
        this.ws = ws;
        this.mode = "ws";
        ws.send(JSON.stringify({ type: "subscribe", ...auth }));
        this.options.onStatus("connected");
        this.retryCount = 0;
        resolve();
      };

      ws.onmessage = (event) => {
        this.options.onMessage(JSON.parse(event.data));
      };

      ws.onclose = () => {
        if (this.mode === "ws") {
          this.handleDisconnect();
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket failed"));
      };
    });
  }

  private async trySSE(auth: { teamId: string; userId: string }): Promise<void> {
    const res = await fetch(`${this.options.baseUrl}/sse/browser/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(auth),
    });

    if (!res.ok) throw new Error("SSE subscribe failed");
    const { sessionId } = await res.json();
    this.sessionId = sessionId;
    this.mode = "sse";

    const es = new EventSource(`${this.options.baseUrl}/sse/browser/stream?sessionId=${sessionId}`);
    this.eventSource = es;

    es.onmessage = (event) => {
      this.options.onMessage(JSON.parse(event.data));
    };

    es.onopen = () => {
      this.options.onStatus("connected");
      this.retryCount = 0;
    };

    es.onerror = () => {
      this.handleDisconnect();
    };
  }

  private async tryPolling(auth: { teamId: string; userId: string }): Promise<void> {
    const res = await fetch(`${this.options.baseUrl}/poll/browser/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(auth),
    });

    if (!res.ok) throw new Error("Polling subscribe failed");
    const { sessionId } = await res.json();
    this.sessionId = sessionId;
    this.mode = "poll";
    this.options.onStatus("connected");
    this.retryCount = 0;

    this.pollInterval = setInterval(async () => {
      try {
        const res = await fetch(
          `${this.options.baseUrl}/poll/browser/messages?sessionId=${sessionId}`,
        );
        const { messages } = await res.json();
        for (const msg of messages) {
          this.options.onMessage(msg);
        }
      } catch {
        this.handleDisconnect();
      }
    }, 2000);
  }

  send(msg: unknown): void {
    if (this.mode === "ws" && this.ws) {
      this.ws.send(JSON.stringify(msg));
    } else if (this.sessionId) {
      const endpoint = this.mode === "sse" ? "sse" : "poll";
      fetch(`${this.options.baseUrl}/${endpoint}/browser/send?sessionId=${this.sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg),
      });
    }
  }

  private handleDisconnect(): void {
    this.disconnect();
    this.retryCount++;
    if (this.retryCount >= this.maxRetries) {
      this.options.onStatus("offline");
      return;
    }

    this.options.onStatus("reconnecting");
    const delay = Math.min(1000 * 2 ** (this.retryCount - 1), 30_000);
    setTimeout(() => {
      if (this.lastAuth) {
        this.connect(this.lastAuth).catch(() => this.handleDisconnect());
      }
    }, delay);
  }

  disconnect(): void {
    this.ws?.close();
    this.eventSource?.close();
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.mode = null;
    this.sessionId = null;
  }
}
