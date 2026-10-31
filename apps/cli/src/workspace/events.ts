import { appendFile, readFile } from "fs/promises";

/** Phase values allowed in the `phase` field of an event. */
export const EVENT_PHASES = [
  "ideate",
  "discover",
  "research",
  "decompose",
  "plan",
  "implement",
  "evaluate",
  "release",
  "blocked",
] as const;

export type EventPhase = (typeof EVENT_PHASES)[number];

/** Event types that `haren track` writes. Other types are allowed through `haren track event`. */
export const EVENT_TYPES = [
  "module-status",
  "feature-status",
  "commit",
  "artifact",
  "gate-override",
] as const;

/** Event types that skills write with `haren track event <type>`. Any other type is also accepted. */
export const WORKFLOW_EVENT_TYPES = [
  "ideate-complete",
  "discover-complete",
  "feature-ready",
  "escalate-human",
  "iteration-complete",
  "release-step",
] as const;

export function isEventPhase(value: unknown): value is EventPhase {
  return typeof value === "string" && (EVENT_PHASES as readonly string[]).includes(value);
}

export interface HarenEvent {
  type: string;
  module?: string;
  phase?: string;
  feature?: string;
  attempt?: number;
  timestamp: string;
  [key: string]: unknown;
}

export async function appendEvent(path: string, event: HarenEvent): Promise<void> {
  const line = JSON.stringify(event) + "\n";
  await appendFile(path, line);
}

export async function readEvents(path: string): Promise<HarenEvent[]> {
  try {
    const raw = await readFile(path, "utf-8");
    if (!raw.trim()) return [];

    return raw
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as HarenEvent);
  } catch {
    return [];
  }
}
