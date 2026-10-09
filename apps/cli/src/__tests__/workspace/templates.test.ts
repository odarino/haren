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
    const out = renderTemplate(editorConfigTemplate, "cmis_ai_rules");
    expect(out).toContain("cmis_ai_rules/skill.md");
    expect(out).not.toContain(HAREN_DIR_TOKEN);
    expect(renderTemplate(cursorRuleTemplate, "cmis_ai_rules")).toContain("  - cmis_ai_rules/**");
  });

  it("builds the gate command", () => {
    expect(gateCommand("cmis_ai_rules")).toBe("bun cmis_ai_rules/hooks/brainstorm-gate.ts");
  });

  it("gate script finds its folder from its own location", () => {
    expect(brainstormGateScript).toContain('resolve(import.meta.dir, "..")');
    expect(brainstormGateScript).not.toContain('includes("/haren/")');
  });
});
