import { describe, it, expect } from "bun:test";
import { parseInitArgs } from "../../commands/init";

describe("parseInitArgs", () => {
  it("parses new flags", () => {
    expect(
      parseInitArgs([
        "--dir",
        "~/shop",
        "--layout",
        "workspace",
        "--haren-dir",
        "rules",
        "--yes",
        "--dry-run",
      ]),
    ).toMatchObject({
      dir: "~/shop",
      layout: "workspace",
      harenDir: "rules",
      yes: true,
      dryRun: true,
      force: false,
    });
  });
  it("keeps the old flags", () => {
    expect(
      parseInitArgs(["--project", "p", "--mode", "explore", "--editor", "both", "--force"]),
    ).toMatchObject({
      project: "p",
      mode: "explore",
      editor: "both",
      force: true,
    });
  });
  it("rejects a bad layout", () => {
    expect(() => parseInitArgs(["--layout", "poly"])).toThrow("Invalid layout");
  });
});
