import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  BLOCK_BEGIN,
  BLOCK_END,
  upsertBlock,
  mergeClaudeSettings,
  mergeCursorHooks,
  computeRootFiles,
  writeRootFiles,
  detectEditor,
} from "../../workspace/root-files";

describe("upsertBlock", () => {
  it("creates a new file with a block", () => {
    expect(upsertBlock(null, "hi")).toBe(
      `# Project Instructions\n\n${BLOCK_BEGIN}\nhi\n${BLOCK_END}\n`,
    );
  });
  it("replaces only the block and keeps user text", () => {
    const old = `# Mine\n\nkeep me\n\n${BLOCK_BEGIN}\nold\n${BLOCK_END}\n\nafter\n`;
    expect(upsertBlock(old, "new")).toBe(
      `# Mine\n\nkeep me\n\n${BLOCK_BEGIN}\nnew\n${BLOCK_END}\n\nafter\n`,
    );
  });
  it("replaces legacy unmarked haren text", () => {
    const old = "# Mine\n\n## Haren Framework\n\nRead `haren/skill.md`\n";
    expect(upsertBlock(old, "new")).toBe(`# Mine\n\n${BLOCK_BEGIN}\nnew\n${BLOCK_END}\n`);
  });
  it("appends a block to a user file", () => {
    expect(upsertBlock("# Mine\n", "new")).toBe(`# Mine\n\n${BLOCK_BEGIN}\nnew\n${BLOCK_END}\n`);
  });
});

describe("hook merges", () => {
  it("keeps other Claude settings and replaces the old gate hook", () => {
    const old = JSON.stringify({
      model: "opus",
      hooks: {
        PreToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] },
          {
            matcher: "Edit|Write",
            hooks: [{ type: "command", command: "bun haren/hooks/brainstorm-gate.ts" }],
          },
        ],
      },
    });
    const out = JSON.parse(mergeClaudeSettings(old, "bun rules/hooks/brainstorm-gate.ts"));
    expect(out.model).toBe("opus");
    expect(out.hooks.PreToolUse).toHaveLength(2);
    expect(out.hooks.PreToolUse[1].hooks[0].command).toBe("bun rules/hooks/brainstorm-gate.ts");
  });
  it("throws on invalid JSON", () => {
    expect(() => mergeClaudeSettings("{nope", "x")).toThrow();
  });
  it("merges Cursor hooks", () => {
    const out = JSON.parse(mergeCursorHooks(null, "bun rules/hooks/brainstorm-gate.ts"));
    expect(out.version).toBe(1);
    expect(out.hooks.beforeFileEdit[0].command).toBe("bun rules/hooks/brainstorm-gate.ts");
    expect(out.hooks.preToolUse[0].matcher).toBe("write");
  });
});

describe("computeRootFiles / writeRootFiles", () => {
  let ws: string;
  beforeEach(async () => {
    ws = await mkdtemp(join(tmpdir(), "haren-root-"));
    await mkdir(join(ws, "rules", "skills", "onboard"), { recursive: true });
    await writeFile(
      join(ws, "rules", "skills", "onboard", "SKILL.md"),
      "---\nname: haren-onboard\n---\n",
    );
  });
  afterEach(async () => {
    await rm(ws, { recursive: true, force: true });
  });

  it("writes all files for both editors with the real folder name", async () => {
    const files = await writeRootFiles({
      workspaceDir: ws,
      harenDir: join(ws, "rules"),
      editor: "both",
    });
    expect(files.map((f) => f.path).sort()).toEqual([
      ".claude/settings.json",
      ".claude/skills/haren-onboard/SKILL.md",
      ".cursor/hooks.json",
      ".cursor/rules/haren.mdc",
      ".cursor/skills/haren-onboard/SKILL.md",
      ".cursorrules",
      "CLAUDE.md",
    ]);
    const claudeMd = await readFile(join(ws, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("rules/skill.md");
    expect(claudeMd).not.toMatch(/(^|[^\w])haren\//);
  });

  it("reports unchanged files on a second run", async () => {
    const o = { workspaceDir: ws, harenDir: join(ws, "rules"), editor: "claude-code" as const };
    await writeRootFiles(o);
    const again = await computeRootFiles(o);
    expect(again.every((f) => f.existed && !f.changed)).toBe(true);
  });

  it("skips the onboard skill copy when the source is missing", async () => {
    await rm(join(ws, "rules", "skills"), { recursive: true });
    const files = await computeRootFiles({
      workspaceDir: ws,
      harenDir: join(ws, "rules"),
      editor: "claude-code",
    });
    expect(files.map((f) => f.path)).not.toContain(".claude/skills/haren-onboard/SKILL.md");
  });

  it("flags user content in CLAUDE.md", async () => {
    await writeFile(join(ws, "CLAUDE.md"), "# Mine\n");
    const files = await computeRootFiles({
      workspaceDir: ws,
      harenDir: join(ws, "rules"),
      editor: "claude-code",
    });
    expect(files.find((f) => f.path === "CLAUDE.md")?.userContent).toBe(true);
  });

  it("detects the editor from existing files", async () => {
    expect(detectEditor(ws)).toBeNull();
    await writeFile(join(ws, "CLAUDE.md"), "x");
    expect(detectEditor(ws)).toBe("claude-code");
    await writeFile(join(ws, ".cursorrules"), "x");
    expect(detectEditor(ws)).toBe("both");
  });
});
