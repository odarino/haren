import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

const SCRIPT = resolve(import.meta.dir, "..", "..", "..", "..", "..", "install.ps1");

describe("install.ps1 (static)", () => {
  const text = readFileSync(SCRIPT, "utf-8");

  it("stays under 100 lines and stops on errors", () => {
    expect(text.split("\n").length).toBeLessThan(100);
    expect(text).toContain("$ErrorActionPreference = 'Stop'");
  });

  it("installs Bun with the official installer and haren with the pinned version", () => {
    expect(text).toContain("irm bun.sh/install.ps1 | iex");
    expect(text).toContain('bun add -g "@odarino/haren@$version"');
    expect(text).toContain("$env:HAREN_VERSION");
  });

  it("skips the prompt in CI or when input is redirected, and runs haren init --dir", () => {
    expect(text).toContain("$env:CI");
    expect(text).toContain("[Console]::IsInputRedirected");
    expect(text).toContain("haren init --dir $workspace");
  });

  it("runs everything inside one scriptblock so nothing leaks into the caller's session", () => {
    const firstCode = text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line !== "" && !line.startsWith("#"));
    expect(firstCode).toBe("& {");
  });

  it("respects BUN_INSTALL when adding Bun to PATH", () => {
    expect(text).toContain("$env:BUN_INSTALL");
  });

  it("never exits the caller's PowerShell session", () => {
    // `irm | iex` runs in the caller's session: `exit` would close the window.
    expect(text).not.toMatch(/^\s*exit\b/m);
  });
});
