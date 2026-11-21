import { describe, it, expect } from "bun:test";
import { compareVersions, parseChangelog, whatsNew, readChangelog } from "../../lib/changelog";
import { printWhatsNew } from "../../commands/upgrade";
import pkg from "../../../package.json";

const text = `# Changelog

## 1.8.0
- eight

## [1.7.0] - 2026-11-21
- seven

## 1.6.0
- six
`;

describe("changelog", () => {
  it("compares versions numerically", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.7.0", "1.7.0")).toBe(0);
  });

  it("parses sections with and without brackets", () => {
    expect(parseChangelog(text).map((s) => s.version)).toEqual(["1.8.0", "1.7.0", "1.6.0"]);
    expect(parseChangelog(text)[1].body).toBe("- seven");
  });

  it("returns the skipped versions, newest first, not past the installed one", () => {
    expect(whatsNew(text, "1.5.0", "1.7.0").map((s) => s.version)).toEqual(["1.7.0", "1.6.0"]);
    expect(whatsNew(text, "1.7.0", "1.7.0")).toEqual([]);
    expect(whatsNew(text, undefined, "1.7.0").map((s) => s.version)).toEqual(["1.7.0"]);
  });

  it("prints only the new sections, and nothing when the version did not change", () => {
    const same: string[] = [];
    printWhatsNew("1.7.0", "1.7.0", text, (l) => same.push(l));
    expect(same).toEqual([]);
    const lines: string[] = [];
    printWhatsNew("1.6.0", "1.7.0", text, (l) => lines.push(l));
    const out = lines.join("\n");
    expect(out).toContain("What's new since 1.6.0");
    expect(out).toContain("- seven");
    expect(out).not.toContain("- six");
    expect(out).not.toContain("- eight");
  });

  it("ships a changelog section for the package version", () => {
    const real = readChangelog();
    expect(real).not.toBeNull();
    expect(parseChangelog(real as string).some((s) => s.version === pkg.version)).toBe(true);
  });
});
