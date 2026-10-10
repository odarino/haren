import { describe, test, expect } from "bun:test";
import { detectCLIs, checkCLI } from "../../agent/cli-detector";

describe("cli-detector", () => {
  test("detectCLIs returns an array", async () => {
    const clis = await detectCLIs();
    expect(Array.isArray(clis)).toBe(true);
  });

  test("checkCLI returns true for existing command", async () => {
    // `echo` is a shell builtin on Windows; use a real executable on every OS.
    const result = await checkCLI(process.platform === "win32" ? "cmd" : "sh");
    expect(result).toBe(true);
  });

  test("checkCLI returns false for nonexistent command", async () => {
    const result = await checkCLI("nonexistent-cli-xyz-12345");
    expect(result).toBe(false);
  });
});
