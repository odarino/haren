import { describe, test, expect } from "bun:test";
import { formatPushSummary, type PushResult } from "../../src/mcp/jira-push";
import { buildJiraDescription } from "../../src/mcp/jira-client";

describe("jira-push", () => {
  test("formatPushSummary shows created and skipped counts", () => {
    const results: PushResult[] = [
      {
        task: { module: "auth", feature: "login", status: "pending" },
        jiraKey: "PROJ-1",
        created: true,
        skipped: false,
      },
      {
        task: {
          module: "auth",
          feature: "signup",
          status: "in-progress",
          jiraKey: "PROJ-2",
        },
        jiraKey: "PROJ-2",
        created: false,
        skipped: true,
      },
    ];

    const summary = formatPushSummary(results);
    expect(summary).toContain("Created: 1");
    expect(summary).toContain("Skipped (already pushed): 1");
    expect(summary).toContain("PROJ-1");
  });

  test("formatPushSummary shows errors", () => {
    const results: PushResult[] = [
      {
        task: { module: "auth", feature: "login", status: "pending" },
        jiraKey: "",
        created: false,
        skipped: false,
        error: "API error",
      },
    ];

    const summary = formatPushSummary(results);
    expect(summary).toContain("Errors: 1");
    expect(summary).toContain("API error");
  });

  test("formatPushSummary handles empty results", () => {
    const summary = formatPushSummary([]);
    expect(summary).toContain("Created: 0");
    expect(summary).toContain("Skipped (already pushed): 0");
  });
});

describe("jira-client helpers", () => {
  test("buildJiraDescription includes module and feature", () => {
    const desc = buildJiraDescription("auth", "login-flow", "pending");
    expect(desc).toContain("auth");
    expect(desc).toContain("login-flow");
    expect(desc).toContain("pending");
    expect(desc).toContain("Haren Portal");
  });
});
