import { describe, test, expect } from "bun:test";
import { detectCLIs, checkCLI } from "../../agent/cli-detector";

describe("cli-detector", () => {
  test("detectCLIs returns an array", async () => {
    const clis = await detectCLIs();
    expect(Array.isArray(clis)).toBe(true);
  });

  test("checkCLI returns true for existing command", async () => {
    const result = await checkCLI("echo");
    expect(result).toBe(true);
  });

  test("checkCLI returns false for nonexistent command", async () => {
    const result = await checkCLI("nonexistent-cli-xyz-12345");
    expect(result).toBe(false);
  });
});
