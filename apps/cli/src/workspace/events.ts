import { appendFile, readFile } from "fs/promises";

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
