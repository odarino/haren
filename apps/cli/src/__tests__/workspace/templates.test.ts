import { describe, it, expect } from "bun:test";
import {
  renderTemplate,
  editorConfigTemplate,
  cursorRuleTemplate,
  gateCommand,
  brainstormGateScript,
  HAREN_DIR_TOKEN,
} from "../../workspace/templates";

const LITERAL_HAREN_PATH = /(^|[^\w{])haren\//;

describe("templates", () => {
  it("uses the token, never a literal haren/ path", () => {
    expect(editorConfigTemplate).toContain(HAREN_DIR_TOKEN);
    expect(cursorRuleTemplate).toContain(HAREN_DIR_TOKEN);
    expect(editorConfigTemplate).not.toMatch(LITERAL_HAREN_PATH);
    expect(cursorRuleTemplate).not.toMatch(LITERAL_HAREN_PATH);
  });

  it("renders a renamed folder", () => {
    const out = renderTemplate(editorConfigTemplate, "haren-rules");
    expect(out).toContain("haren-rules/skill.md");
    expect(out).not.toContain(HAREN_DIR_TOKEN);
    expect(renderTemplate(cursorRuleTemplate, "haren-rules")).toContain("  - haren-rules/**");
  });

  it("builds the gate command", () => {
    expect(gateCommand("haren-rules")).toBe("bun haren-rules/hooks/brainstorm-gate.ts");
  });

  it("gate script finds its folder from its own location", () => {
    expect(brainstormGateScript).toContain('resolve(import.meta.dir, "..")');
    expect(brainstormGateScript).not.toContain('includes("/haren/")');
  });
});
