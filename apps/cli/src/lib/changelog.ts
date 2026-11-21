import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

export interface ChangelogSection {
  version: string;
  body: string;
}

/**
 * Find CHANGELOG.md in both layouts:
 *  - Published package: <pkg>/dist → <pkg>/CHANGELOG.md
 *  - Monorepo dev: apps/cli/src/lib → repo root
 */
export function readChangelog(candidates?: string[]): string | null {
  const probes = candidates ?? [
    resolve(import.meta.dir, "..", "CHANGELOG.md"),
    resolve(import.meta.dir, "..", "..", "..", "..", "CHANGELOG.md"),
  ];
  for (const path of probes) {
    if (existsSync(path)) return readFileSync(path, "utf-8");
  }
  return null;
}

/** Compare two x.y.z versions. Missing or non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Split a changelog into sections. A section starts at `## 1.7.0` or `## [1.7.0]`. */
export function parseChangelog(text: string): ChangelogSection[] {
  const sections: ChangelogSection[] = [];
  let current: ChangelogSection | null = null;
  for (const line of text.split(/\r?\n/)) {
    const m = /^##\s+\[?v?(\d+\.\d+\.\d+)\]?/.exec(line);
    if (m) {
      current = { version: m[1], body: "" };
      sections.push(current);
    } else if (current) {
      current.body += `${line}\n`;
    }
  }
  for (const s of sections) s.body = s.body.trim();
  return sections;
}

/**
 * The sections newer than `from` and not newer than `to`, newest first.
 * With no `from` (a workspace without a version marker), only the `to` section.
 */
export function whatsNew(text: string, from: string | undefined, to: string): ChangelogSection[] {
  return parseChangelog(text)
    .filter((s) => compareVersions(s.version, to) <= 0)
    .filter((s) =>
      from ? compareVersions(s.version, from) > 0 : compareVersions(s.version, to) === 0,
    )
    .sort((a, b) => compareVersions(b.version, a.version));
}
