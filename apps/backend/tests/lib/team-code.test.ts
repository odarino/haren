import { describe, test, expect } from "bun:test";
import { generateTeamCode } from "../../src/lib/team-code";

describe("generateTeamCode", () => {
  test("returns a 6-character uppercase alphanumeric string", () => {
    const code = generateTeamCode();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(code.length).toBe(6);
  });

  test("generates unique codes", () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateTeamCode()));
    expect(codes.size).toBeGreaterThan(90);
  });
});
