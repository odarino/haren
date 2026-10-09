import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join, relative, sep } from "path";
import { cursorRuleTemplate, editorConfigTemplate, gateCommand, renderTemplate } from "./templates";

export type Editor = "claude-code" | "cursor" | "both";

export const BLOCK_BEGIN = "<!-- haren:begin -->";
export const BLOCK_END = "<!-- haren:end -->";
const LEGACY_HEADING = "## Haren Framework";
const GATE_SCRIPT = "brainstorm-gate.ts";

const LEGACY_LAST_LINE =
  "Design specs are written to Haren artifact folders, NOT to docs/superpowers/specs/.";
const LEGACY_HEADINGS = new Set([LEGACY_HEADING, "## Brainstorming Gate"]);

/**
 * Before markers existed, init appended the editor config to CLAUDE.md and
 * .cursorrules. Users may have added their own text after it. Returns the
 * range of only the old haren section, or null.
 */
function legacyRange(existing: string): { start: number; end: number } | null {
  const start = existing.indexOf(LEGACY_HEADING);
  if (start === -1 || !existing.includes("haren/skill.md")) return null;
  const last = existing.indexOf(LEGACY_LAST_LINE, start);
  if (last !== -1) {
    const newline = existing.indexOf("\n", last);
    return { start, end: newline === -1 ? existing.length : newline + 1 };
  }
  const heading = /^## .*$/gm;
  heading.lastIndex = start + LEGACY_HEADING.length;
  for (let m = heading.exec(existing); m; m = heading.exec(existing)) {
    if (!LEGACY_HEADINGS.has(m[0].trimEnd())) return { start, end: m.index };
  }
  return { start, end: existing.length };
}

export function upsertBlock(existing: string | null, body: string): string {
  const block = `${BLOCK_BEGIN}\n${body.trimEnd()}\n${BLOCK_END}\n`;
  if (existing === null || existing.trim() === "") return `# Project Instructions\n\n${block}`;

  const begin = existing.indexOf(BLOCK_BEGIN);
  const end = existing.indexOf(BLOCK_END);
  if (begin !== -1 && end > begin) {
    const after = existing.slice(end + BLOCK_END.length).replace(/^\n/, "");
    return existing.slice(0, begin) + block + after;
  }

  const legacy = legacyRange(existing);
  if (legacy) {
    const after = existing.slice(legacy.end).replace(/^\n+/, "");
    return existing.slice(0, legacy.start) + block + (after ? `\n${after}` : "");
  }

  return `${existing.trimEnd()}\n\n${block}`;
}

function hasUserContent(existing: string | null): boolean {
  if (existing === null) return false;
  const begin = existing.indexOf(BLOCK_BEGIN);
  const end = existing.indexOf(BLOCK_END);
  const legacy = legacyRange(existing);
  const outside =
    begin !== -1 && end > begin
      ? existing.slice(0, begin) + existing.slice(end + BLOCK_END.length)
      : legacy
        ? existing.slice(0, legacy.start) + existing.slice(legacy.end)
        : existing;
  return outside.replace("# Project Instructions", "").trim().length > 0;
}

function parseJson(existing: string | null, path: string): Record<string, any> {
  if (existing === null || existing.trim() === "") return {};
  try {
    return JSON.parse(existing);
  } catch (err) {
    throw new Error(
      `Invalid JSON in ${path}: ${(err as Error).message}. Fix the file and run again.`,
    );
  }
}

function withoutGate(entries: unknown): any[] {
  return (Array.isArray(entries) ? entries : []).filter(
    (entry) => !JSON.stringify(entry).includes(GATE_SCRIPT),
  );
}

export function mergeClaudeSettings(existing: string | null, command: string): string {
  const data = parseJson(existing, ".claude/settings.json");
  data.hooks ??= {};
  data.hooks.PreToolUse = [
    ...withoutGate(data.hooks.PreToolUse),
    { matcher: "Edit|Write", hooks: [{ type: "command", command }] },
  ];
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function mergeCursorHooks(existing: string | null, command: string): string {
  const data = parseJson(existing, ".cursor/hooks.json");
  data.version ??= 1;
  data.hooks ??= {};
  data.hooks.beforeFileEdit = [
    ...withoutGate(data.hooks.beforeFileEdit),
    { command, type: "command", timeout: 10 },
  ];
  data.hooks.preToolUse = [
    ...withoutGate(data.hooks.preToolUse),
    { command, matcher: "write", type: "command", timeout: 10 },
  ];
  return `${JSON.stringify(data, null, 2)}\n`;
}

export interface RootFile {
  path: string;
  content: string;
  existed: boolean;
  changed: boolean;
  userContent: boolean;
}

export interface RootFilesOptions {
  workspaceDir: string;
  harenDir: string;
  editor: Editor;
}

async function readOrNull(path: string): Promise<string | null> {
  return existsSync(path) ? readFile(path, "utf-8") : null;
}

export async function computeRootFiles(o: RootFilesOptions): Promise<RootFile[]> {
  const name = relative(o.workspaceDir, o.harenDir).split(sep).join("/");
  const useClaude = o.editor !== "cursor";
  const useCursor = o.editor !== "claude-code";
  const command = gateCommand(name);
  const config = renderTemplate(editorConfigTemplate, name);
  const onboardSrc = join(o.harenDir, "skills", "onboard", "SKILL.md");
  const onboard = await readOrNull(onboardSrc);

  const specs: { path: string; make: (old: string | null) => string; markdown?: boolean }[] = [];
  if (useClaude) {
    specs.push({ path: "CLAUDE.md", make: (old) => upsertBlock(old, config), markdown: true });
    specs.push({ path: ".claude/settings.json", make: (old) => mergeClaudeSettings(old, command) });
    if (onboard !== null)
      specs.push({ path: ".claude/skills/haren-onboard/SKILL.md", make: () => onboard });
  }
  if (useCursor) {
    specs.push({ path: ".cursorrules", make: (old) => upsertBlock(old, config), markdown: true });
    specs.push({
      path: ".cursor/rules/haren.mdc",
      make: () => renderTemplate(cursorRuleTemplate, name),
    });
    specs.push({ path: ".cursor/hooks.json", make: (old) => mergeCursorHooks(old, command) });
    if (onboard !== null)
      specs.push({ path: ".cursor/skills/haren-onboard/SKILL.md", make: () => onboard });
  }

  const files: RootFile[] = [];
  for (const spec of specs) {
    const old = await readOrNull(join(o.workspaceDir, spec.path));
    const content = spec.make(old);
    files.push({
      path: spec.path,
      content,
      existed: old !== null,
      changed: old !== content,
      userContent: spec.markdown ? hasUserContent(old) : false,
    });
  }
  return files;
}

export async function writeRootFiles(o: RootFilesOptions): Promise<RootFile[]> {
  const files = await computeRootFiles(o);
  for (const file of files) {
    if (!file.changed) continue;
    const abs = join(o.workspaceDir, file.path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, file.content);
  }
  return files;
}

export function detectEditor(workspaceDir: string): Editor | null {
  const claude =
    existsSync(join(workspaceDir, "CLAUDE.md")) ||
    existsSync(join(workspaceDir, ".claude", "settings.json"));
  const cursor =
    existsSync(join(workspaceDir, ".cursorrules")) || existsSync(join(workspaceDir, ".cursor"));
  if (claude && cursor) return "both";
  if (claude) return "claude-code";
  if (cursor) return "cursor";
  return null;
}
