import { existsSync } from "fs";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { basename, dirname, join, relative, sep } from "path";
import { resolveContentDir } from "../lib/content-dir";
import { type PluginManifest, validateManifest } from "../plugins/manifest";
import { pluginDir, readPlugins } from "../plugins/state";
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

export function upsertBlock(existing: string | null, body: string, file = "The file"): string {
  const block = `${BLOCK_BEGIN}\n${body.trimEnd()}\n${BLOCK_END}\n`;
  if (existing === null || existing.trim() === "") return `# Project Instructions\n\n${block}`;

  const begin = existing.indexOf(BLOCK_BEGIN);
  const end = existing.indexOf(BLOCK_END);
  if ((begin === -1) !== (end === -1) || (begin !== -1 && end < begin)) {
    throw new Error(
      `${file} has a broken haren block (${BLOCK_BEGIN} / ${BLOCK_END}). Fix or remove the markers and run again.`,
    );
  }
  if (begin !== -1) {
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
  let data: unknown;
  try {
    data = JSON.parse(existing);
  } catch (err) {
    throw new Error(
      `Invalid JSON in ${path}: ${(err as Error).message}. Fix the file and run again.`,
    );
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Invalid JSON in ${path}: expected an object. Fix the file and run again.`);
  }
  return data as Record<string, any>;
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
  /** Set on framework copies (skills, agents): the folder they are listed under in a plan. */
  group?: string;
}

export interface RootFilesOptions {
  workspaceDir: string;
  harenDir: string;
  editor: Editor;
  /** Packaged content folder; defaults to resolveContentDir(). */
  contentDir?: string;
}

async function readOrNull(path: string): Promise<string | null> {
  return existsSync(path) ? readFile(path, "utf-8") : null;
}

/** Framework files Claude Code and Cursor load natively, keyed by path inside the editor folder. */
export interface FrameworkFile {
  path: string;
  content: string;
  group: "skills" | "agents";
}

/** Prefix a skill or agent name with "haren-" so it does not clash with the user's own. */
export function harenName(name: string): string {
  return name.startsWith("haren-") ? name : `haren-${name}`;
}

/** Set the `name:` field in the frontmatter to `name`. Text without frontmatter is unchanged. */
export function withFrontmatterName(text: string, name: string): string {
  const fm = /^---\r?\n[\s\S]*?\r?\n---/.exec(text);
  if (!fm) return text;
  const head = fm[0].replace(/^name:.*$/m, `name: ${name}`);
  return head + text.slice(fm[0].length);
}

function frontmatterName(text: string): string | undefined {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return fm?.[1]?.match(/^name:\s*(.+?)\s*$/m)?.[1]?.replace(/^["']|["']$/g, "");
}

async function listFiles(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await listFiles(join(dir, entry.name), rel)));
    else if (entry.isFile()) out.push(rel);
  }
  return out.sort();
}

/**
 * The skills and agents to copy into .claude/ and .cursor/, renamed with a
 * "haren-" prefix. Reads the haren folder; a new haren folder (init's plan
 * preview) has none yet, so it falls back to the packaged content.
 */
export async function frameworkFiles(
  harenDir: string,
  contentDir?: string,
): Promise<FrameworkFile[]> {
  let source = harenDir;
  if (!existsSync(join(harenDir, "skills")) && !existsSync(join(harenDir, "agents"))) {
    try {
      source = contentDir ?? resolveContentDir();
    } catch {
      return [];
    }
  }
  const files: FrameworkFile[] = [];
  const skillsDir = join(source, "skills");
  if (existsSync(skillsDir)) {
    for (const entry of await readdir(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(skillsDir, entry.name);
      const main = await readOrNull(join(dir, "SKILL.md"));
      if (main === null) continue;
      const name = harenName(frontmatterName(main) ?? entry.name);
      for (const rel of await listFiles(dir)) {
        const text = await readFile(join(dir, rel), "utf-8");
        files.push({
          path: `skills/${name}/${rel}`,
          content: rel === "SKILL.md" ? withFrontmatterName(text, name) : text,
          group: "skills",
        });
      }
    }
  }
  const agentsDir = join(source, "agents");
  if (existsSync(agentsDir)) {
    for (const file of (await readdir(agentsDir)).filter((f) => f.endsWith(".md")).sort()) {
      const text = await readFile(join(agentsDir, file), "utf-8");
      const name = harenName(frontmatterName(text) ?? file.slice(0, -3));
      files.push({
        path: `agents/${name}.md`,
        content: withFrontmatterName(text, name),
        group: "agents",
      });
    }
  }
  files.push(...(await pluginFiles(harenDir)));
  return files.sort((x, y) => x.path.localeCompare(y.path));
}

/**
 * Skills and agents of enabled plugins, renamed with a "<plugin>-" prefix.
 * A broken plugin is skipped; `haren plugin doctor` reports it.
 */
export async function pluginFiles(harenDir: string, only?: string): Promise<FrameworkFile[]> {
  const files: FrameworkFile[] = [];
  const state = await readPlugins(harenDir);
  for (const [plugin, entry] of Object.entries(state.plugins)) {
    if (only !== undefined ? plugin !== only : !entry.enabled) continue;
    const dir = pluginDir(harenDir, plugin);
    let manifest: PluginManifest;
    try {
      manifest = validateManifest(
        JSON.parse(await readFile(join(dir, "haren-plugin.json"), "utf-8")),
      );
    } catch {
      continue;
    }
    const prefixed = (n: string) => (n.startsWith(`${plugin}-`) ? n : `${plugin}-${n}`);
    for (const skill of manifest.skills) {
      const skillDir = join(dir, skill);
      const main = await readOrNull(join(skillDir, "SKILL.md"));
      if (main === null) continue;
      const name = prefixed(frontmatterName(main) ?? basename(skillDir));
      for (const rel of await listFiles(skillDir)) {
        const text = await readFile(join(skillDir, rel), "utf-8");
        files.push({
          path: `skills/${name}/${rel}`,
          content: rel === "SKILL.md" ? withFrontmatterName(text, name) : text,
          group: "skills",
        });
      }
    }
    for (const agent of manifest.agents) {
      const text = await readOrNull(join(dir, agent));
      if (text === null) continue;
      const name = prefixed(frontmatterName(text) ?? basename(agent, ".md"));
      files.push({
        path: `agents/${name}.md`,
        content: withFrontmatterName(text, name),
        group: "agents",
      });
    }
  }
  return files.sort((x, y) => x.path.localeCompare(y.path));
}

export async function computeRootFiles(o: RootFilesOptions): Promise<RootFile[]> {
  const name = relative(o.workspaceDir, o.harenDir).split(sep).join("/");
  const useClaude = o.editor !== "cursor";
  const useCursor = o.editor !== "claude-code";
  const command = gateCommand(name);
  const config = renderTemplate(editorConfigTemplate, name);
  const framework = await frameworkFiles(o.harenDir, o.contentDir);

  const specs: {
    path: string;
    make: (old: string | null) => string;
    markdown?: boolean;
    group?: string;
  }[] = [];
  const addFramework = (editorDir: string) => {
    for (const f of framework) {
      specs.push({
        path: `${editorDir}/${f.path}`,
        make: () => f.content,
        group: `${editorDir}/${f.group}/`,
      });
    }
  };
  if (useClaude) {
    specs.push({
      path: "CLAUDE.md",
      make: (old) => upsertBlock(old, config, "CLAUDE.md"),
      markdown: true,
    });
    specs.push({ path: ".claude/settings.json", make: (old) => mergeClaudeSettings(old, command) });
    addFramework(".claude");
  }
  if (useCursor) {
    specs.push({
      path: ".cursorrules",
      make: (old) => upsertBlock(old, config, ".cursorrules"),
      markdown: true,
    });
    specs.push({
      path: ".cursor/rules/haren.mdc",
      make: () => renderTemplate(cursorRuleTemplate, name),
    });
    specs.push({ path: ".cursor/hooks.json", make: (old) => mergeCursorHooks(old, command) });
    addFramework(".cursor");
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
      ...(spec.group ? { group: spec.group } : {}),
    });
  }
  return files;
}

/**
 * Collapse framework copies into one entry per folder (".claude/skills/") so a
 * plan lists a few lines, not every skill file. Other files stay as they are.
 */
export function summarizeRootFiles(files: RootFile[]): (RootFile & { count?: number })[] {
  const out: (RootFile & { count?: number })[] = [];
  const groups = new Map<string, RootFile & { count: number }>();
  for (const file of files) {
    if (!file.group) {
      out.push(file);
      continue;
    }
    const g = groups.get(file.group);
    if (!g) {
      const entry = { ...file, path: file.group, content: "", count: 1 };
      groups.set(file.group, entry);
      out.push(entry);
    } else {
      g.count += 1;
      g.existed ||= file.existed;
      g.changed ||= file.changed;
    }
  }
  return out;
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
