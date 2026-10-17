import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { resolveContentDir } from "../../lib/content-dir";
import { editorConfigTemplate, renderTemplate } from "../../workspace/templates";
import {
  BLOCK_BEGIN,
  BLOCK_END,
  upsertBlock,
  mergeClaudeSettings,
  mergeCursorHooks,
  computeRootFiles,
  frameworkFiles,
  pluginFiles,
  summarizeRootFiles,
  writeRootFiles,
  detectEditor,
} from "../../workspace/root-files";
import { writePlugins } from "../../plugins/state";

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
  it("keeps user text before and after a full legacy section", () => {
    const legacy = renderTemplate(editorConfigTemplate, "haren");
    const old = `# Mine\n\nbefore\n\n${legacy}\n## My Notes\n\nkeep after\n`;
    expect(upsertBlock(old, "new")).toBe(
      `# Mine\n\nbefore\n\n${BLOCK_BEGIN}\nnew\n${BLOCK_END}\n\n## My Notes\n\nkeep after\n`,
    );
  });
  it("ends a truncated legacy section at the next user heading", () => {
    const old =
      "# Mine\n\n## Haren Framework\n\nRead `haren/skill.md`\n\n## Brainstorming Gate\n\ngate\n\n## My Notes\n\nkeep\n";
    expect(upsertBlock(old, "new")).toBe(
      `# Mine\n\n${BLOCK_BEGIN}\nnew\n${BLOCK_END}\n\n## My Notes\n\nkeep\n`,
    );
  });
  it("throws on a broken block with one marker or reversed markers", () => {
    const msg =
      "CLAUDE.md has a broken haren block (<!-- haren:begin --> / <!-- haren:end -->). Fix or remove the markers and run again.";
    for (const old of [
      `# Mine\n\n${BLOCK_BEGIN}\nold\n`,
      `# Mine\n\nold\n${BLOCK_END}\n`,
      `# Mine\n\n${BLOCK_END}\nold\n${BLOCK_BEGIN}\n`,
    ]) {
      expect(() => upsertBlock(old, "new", "CLAUDE.md")).toThrow(msg);
    }
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
  it("throws the same error for valid JSON that is not an object", () => {
    for (const text of ["null", "[]", "3", '"x"']) {
      expect(() => mergeClaudeSettings(text, "x")).toThrow(
        "Invalid JSON in .claude/settings.json: expected an object",
      );
      expect(() => mergeCursorHooks(text, "x")).toThrow(
        "Invalid JSON in .cursor/hooks.json: expected an object",
      );
    }
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
      contentDir: join(ws, "no-content"),
    });
    expect(files.map((f) => f.path)).not.toContain(".claude/skills/haren-onboard/SKILL.md");
  });

  it("uses the packaged onboard skill when the haren folder has none yet", async () => {
    await rm(join(ws, "rules"), { recursive: true });
    const files = await computeRootFiles({
      workspaceDir: ws,
      harenDir: join(ws, "rules"),
      editor: "both",
    });
    const packaged = await readFile(
      join(resolveContentDir(), "skills", "onboard", "SKILL.md"),
      "utf-8",
    );
    for (const path of [
      ".claude/skills/haren-onboard/SKILL.md",
      ".cursor/skills/haren-onboard/SKILL.md",
    ]) {
      expect(files.find((f) => f.path === path)?.content).toBe(packaged);
    }
  });

  it("names the file when its haren block is broken", async () => {
    await writeFile(join(ws, "CLAUDE.md"), `# Mine\n\n${BLOCK_BEGIN}\nold\n`);
    await expect(
      computeRootFiles({ workspaceDir: ws, harenDir: join(ws, "rules"), editor: "claude-code" }),
    ).rejects.toThrow("CLAUDE.md has a broken haren block");
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

  it("flags user text after a legacy section as user content", async () => {
    const legacy = renderTemplate(editorConfigTemplate, "haren");
    const o = { workspaceDir: ws, harenDir: join(ws, "rules"), editor: "claude-code" as const };
    await writeFile(join(ws, "CLAUDE.md"), `# Project Instructions\n\n${legacy}`);
    let files = await computeRootFiles(o);
    expect(files.find((f) => f.path === "CLAUDE.md")?.userContent).toBe(false);
    await writeFile(join(ws, "CLAUDE.md"), `# Project Instructions\n\n${legacy}\n## Mine\n`);
    files = await computeRootFiles(o);
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

describe("frameworkFiles", () => {
  let h: string;
  beforeEach(async () => {
    h = await mkdtemp(join(tmpdir(), "haren-fw-"));
    await mkdir(join(h, "skills", "plan"), { recursive: true });
    await mkdir(join(h, "skills", "discover"), { recursive: true });
    await mkdir(join(h, "skills", "onboard"), { recursive: true });
    await mkdir(join(h, "agents"), { recursive: true });
    await writeFile(
      join(h, "skills", "plan", "SKILL.md"),
      "---\nname: plan\ndescription: d\n---\nname: body\n",
    );
    await writeFile(join(h, "skills", "discover", "SKILL.md"), "---\nname: discover\n---\n");
    await writeFile(join(h, "skills", "discover", "explore.md"), "name: keep me\n");
    await writeFile(join(h, "skills", "onboard", "SKILL.md"), "---\nname: haren-onboard\n---\n");
    await writeFile(join(h, "agents", "developer.md"), "---\nname: developer\n---\nbody\n");
  });
  afterEach(async () => {
    await rm(h, { recursive: true, force: true });
  });

  it("prefixes skills and agents with haren- and keeps sibling files", async () => {
    const files = await frameworkFiles(h);
    expect(files.map((f) => f.path)).toEqual([
      "agents/haren-developer.md",
      "skills/haren-discover/explore.md",
      "skills/haren-discover/SKILL.md",
      "skills/haren-onboard/SKILL.md",
      "skills/haren-plan/SKILL.md",
    ]);
  });

  it("renames only the frontmatter name field", async () => {
    const files = await frameworkFiles(h);
    const plan = files.find((f) => f.path === "skills/haren-plan/SKILL.md")!;
    expect(plan.content).toBe("---\nname: haren-plan\ndescription: d\n---\nname: body\n");
    const sibling = files.find((f) => f.path === "skills/haren-discover/explore.md")!;
    expect(sibling.content).toBe("name: keep me\n");
    const agent = files.find((f) => f.path === "agents/haren-developer.md")!;
    expect(agent.content).toBe("---\nname: haren-developer\n---\nbody\n");
  });

  it("installs every packaged skill and agent into both editors", async () => {
    const ws = await mkdtemp(join(tmpdir(), "haren-fw-ws-"));
    try {
      const files = await writeRootFiles({
        workspaceDir: ws,
        harenDir: join(ws, "haren"),
        editor: "both",
      });
      const paths = files.map((f) => f.path);
      for (const dir of [".claude", ".cursor"]) {
        expect(paths).toContain(`${dir}/skills/haren-plan/SKILL.md`);
        expect(paths).toContain(`${dir}/skills/haren-onboard/SKILL.md`);
        expect(paths).toContain(`${dir}/agents/haren-developer.md`);
      }
      const text = await readFile(join(ws, ".claude", "agents", "haren-planner.md"), "utf-8");
      expect(text).toContain("name: haren-planner");
    } finally {
      await rm(ws, { recursive: true, force: true });
    }
  });
});

describe("summarizeRootFiles", () => {
  const f = (path: string, existed: boolean, changed: boolean, group?: string) => ({
    path,
    content: "x",
    existed,
    changed,
    userContent: false,
    ...(group ? { group } : {}),
  });
  it("collapses grouped files into one entry per folder", () => {
    const out = summarizeRootFiles([
      f("CLAUDE.md", true, false),
      f(".claude/skills/a/SKILL.md", true, false, ".claude/skills/"),
      f(".claude/skills/b/SKILL.md", false, true, ".claude/skills/"),
    ]);
    expect(out.map((o) => [o.path, o.existed, o.changed, o.count])).toEqual([
      ["CLAUDE.md", true, false, undefined],
      [".claude/skills/", true, true, 2],
    ]);
  });
});

describe("pluginFiles", () => {
  it("copies enabled plugin skills and agents with the plugin prefix", async () => {
    const harenDir = await mkdtemp(join(tmpdir(), "haren-pf-"));
    const dir = join(harenDir, ".plugins", "backlog");
    await mkdir(join(dir, "skills", "board"), { recursive: true });
    await mkdir(join(dir, "agents"), { recursive: true });
    await writeFile(
      join(dir, "haren-plugin.json"),
      JSON.stringify({
        name: "backlog",
        version: "1.0.0",
        harenApi: "1",
        skills: ["skills/board"],
        agents: ["agents/syncer.md"],
      }),
    );
    await writeFile(
      join(dir, "skills", "board", "SKILL.md"),
      "---\nname: board\ndescription: d\n---\n# Board\n",
    );
    await writeFile(join(dir, "agents", "syncer.md"), "---\nname: syncer\n---\nSync\n");
    await writePlugins(harenDir, {
      version: 1,
      plugins: { backlog: { source: "file:x", version: "1.0.0", enabled: true, config: {} } },
    });

    const files = await pluginFiles(harenDir);
    expect(files.map((f) => f.path)).toEqual([
      "agents/backlog-syncer.md",
      "skills/backlog-board/SKILL.md",
    ]);
    expect(files[1]!.content).toContain("name: backlog-board");
  });
  it("returns nothing without plugins.json", async () => {
    expect(await pluginFiles(await mkdtemp(join(tmpdir(), "haren-pf-")))).toEqual([]);
  });
});
