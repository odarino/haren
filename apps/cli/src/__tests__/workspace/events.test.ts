import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { appendEvent, readEvents, type HarenEvent } from "../../workspace/events";

describe("events", () => {
  let testDir: string;
  let eventsPath: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "haren-events-"));
    await mkdir(join(testDir, "events"), { recursive: true });
    eventsPath = join(testDir, "events", "events.jsonl");
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("appends an event to the JSONL file", async () => {
    const event: HarenEvent = {
      type: "phase-complete",
      module: "auth",
      phase: "plan",
      timestamp: "2026-04-04T10:00:00Z",
    };

    await appendEvent(eventsPath, event);

    const raw = await readFile(eventsPath, "utf-8");
    const parsed = JSON.parse(raw.trim());
    expect(parsed.type).toBe("phase-complete");
    expect(parsed.module).toBe("auth");
  });

  it("appends multiple events as separate lines", async () => {
    await appendEvent(eventsPath, {
      type: "phase-complete",
      module: "auth",
      phase: "discover",
      timestamp: "2026-04-04T10:00:00Z",
    });
    await appendEvent(eventsPath, {
      type: "phase-complete",
      module: "auth",
      phase: "decompose",
      timestamp: "2026-04-04T11:00:00Z",
    });

    const events = await readEvents(eventsPath);
    expect(events).toHaveLength(2);
    expect(events[0].phase).toBe("discover");
    expect(events[1].phase).toBe("decompose");
  });

  it("reads empty file as empty array", async () => {
    await Bun.write(eventsPath, "");
    const events = await readEvents(eventsPath);
    expect(events).toEqual([]);
  });
});
