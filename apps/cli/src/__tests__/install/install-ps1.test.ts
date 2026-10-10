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
    expect(text).toContain("& $harenCmd.Source init --dir $workspace");
  });

  it("runs the haren that bun installed, not an older one earlier on PATH", () => {
    expect(text).toContain("bun pm bin -g");
    expect(text).toContain("Get-Command haren -All");
    expect(text).toContain("StartsWith($bunBin, [StringComparison]::OrdinalIgnoreCase)");
  });

  it("asks again instead of defaulting to the home folder", () => {
    expect(text).toContain("Workspace path (a project folder, not your home folder)");
  });

  it("runs everything inside one scriptblock so nothing leaks into the caller's session", () => {
    const firstCode = text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line !== "" && !line.startsWith("#"));
    expect(firstCode).toBe("& {");
  });

  it("treats CI as set only when it is not empty, false or 0", () => {
    expect(text).toContain("$isCI = $env:CI -and $env:CI.Trim() -notmatch '^(false|0)?$'");
    expect(text).toContain("if ($isCI -or [Console]::IsInputRedirected");
  });

  it("does not use UserInteractive to skip the prompt", () => {
    // [Environment]::UserInteractive is False in every OpenSSH session, even with
    // a PTY (`ssh -t`), so it would skip the prompt for SSH users who can answer it.
    expect(text).not.toContain("UserInteractive");
  });

  it("rejects ~user paths", () => {
    expect(text).toContain("$workspace.StartsWith('~')");
    expect(text).toContain("Use a full path, for example $HOME\\project");
  });

  it("checks the exit code of the nested Bun installer", () => {
    const install = text.indexOf("irm bun.sh/install.ps1 | iex");
    const check = text.indexOf('if ($LASTEXITCODE -ne 0) { throw "The Bun installer failed');
    expect(install).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(install);
    expect(check).toBeLessThan(text.indexOf("$bunHome ="));
  });

  it("respects BUN_INSTALL when adding Bun to PATH", () => {
    expect(text).toContain("$env:BUN_INSTALL");
  });

  it("never exits the caller's PowerShell session", () => {
    // `irm | iex` runs in the caller's session: `exit` would close the window.
    expect(text).not.toMatch(/^\s*exit\b/m);
  });
});
