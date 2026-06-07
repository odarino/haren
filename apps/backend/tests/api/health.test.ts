import { describe, test, expect } from "bun:test";

const BASE = `http://localhost:${process.env.TEST_PORT ?? 3001}`;

describe("GET /api/health", () => {
  test("returns 200 with status ok", async () => {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
