/**
 * Brainstorm Gate Hook
 * Blocks Edit/Write tool use outside the haren folder unless a module that
 * owns the target repo has reached 'planned' status (or later).
 * For shell commands (Bash) it only blocks writes into readOnly repos (best effort).
 *
 * Override (for a fix the user asked for): HAREN_GATE=off, or
 * progress.json "gateOverride": { "reason": "...", "until": "<ISO>" }
 * (set it with: haren track override on --reason "...").
 *
 * Works with both Claude Code and Cursor:
 * - Exit 0 = allow
 * - Exit 2 = block
 * - Other exit codes = hook failure, action proceeds (fail-open)
 */

import { existsSync, realpathSync } from "fs";
import { basename, dirname, join, resolve, sep } from "path";

// The hook lives in <harenDir>/hooks/, so the haren folder is one level up.
// This works for any folder name. Use the real path so symlinks compare equal.
const harenDir = realpathSync(resolve(import.meta.dir, ".."));
const workspaceDir = dirname(harenDir);

const IMPLEMENTABLE = ["planned", "implementing", "evaluating", "completed", "released"];
const OVERRIDE_HINT =
  "If the user explicitly asked for this change, run `haren track override on --reason \"...\"` (or set HAREN_GATE=off) and try again.";

// Editors send logical paths that can go through symlinks. Resolve the nearest
// existing ancestor to its real path, then add back the missing segments.
function realTarget(abs: string): string {
  const rest: string[] = [];
  let dir = abs;
  while (!existsSync(dir) && dirname(dir) !== dir) {
    rest.unshift(basename(dir));
    dir = dirname(dir);
  }
  try {
    return join(realpathSync(dir), ...rest);
  } catch {
    return abs;
  }
}

function inside(path: string, root: string): boolean {
  return path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);
}

function allow(): never {
  console.log(JSON.stringify({
    allow: true,           // Claude Code
    permission: "allow",   // Cursor
  }));
  process.exit(0);
}

// Set by readInput(). "unknown" writes both the Claude and the Cursor denial.
let source: "claude" | "cursor" | "unknown" = "unknown";

// Claude Code sends hook_event_name "PreToolUse" with session_id and transcript_path.
// Cursor sends its own hook_event_name values (beforeShellExecution, preToolUse, ...).
function detectSource(input: any): typeof source {
  const event = input?.hook_event_name;
  if (event === "PreToolUse") return "claude";
  if (typeof event === "string" && event) return "cursor";
  if (typeof input?.session_id === "string" && typeof input?.transcript_path === "string") return "claude";
  return "unknown";
}

function deny(message: string): never {
  if (source !== "cursor") {
    // Claude Code reads stderr on exit 2 and shows it to the model.
    console.error(message);
  }
  if (source !== "claude") {
    console.log(JSON.stringify({
      permission: "deny",        // Cursor
      user_message: message,     // Cursor — shown in UI
      agent_message: message,    // Cursor — sent to model
    }));
  }
  process.exit(2);
}

interface Repo { path: string; role?: string; readOnly?: boolean }

// Same rules as the CLI: repos is a map key -> {path} | key -> string, or an array.
function normalizeRepos(repos: unknown): Record<string, Repo> {
  const out: Record<string, Repo> = {};
  if (Array.isArray(repos)) {
    for (const item of repos) {
      const path = typeof item === "string" ? item : item?.path;
      if (typeof path === "string" && path) out[basename(path)] = { path, role: item?.role, readOnly: item?.readOnly === true };
    }
  } else if (repos && typeof repos === "object") {
    for (const [key, value] of Object.entries(repos as Record<string, any>)) {
      if (typeof value === "string") out[key] = { path: value };
      else if (value && typeof value === "object" && typeof value.path === "string") {
        out[key] = { path: value.path, role: value.role, readOnly: value.readOnly === true };
      }
    }
  }
  return out;
}

const BROKEN_MANIFEST_MESSAGE =
  "manifest.yaml does not parse and declares a readOnly repo. Fix manifest.yaml first.";

// brokenReadOnly: the manifest does not parse but its text declares a readOnly repo.
// Then writes outside the haren folder are blocked (fail-closed). Otherwise fail-open.
async function readManifest(): Promise<{ repos: Record<string, Repo>; brokenReadOnly: boolean }> {
  const file = Bun.file(join(harenDir, "manifest.yaml"));
  let text = "";
  try {
    if (!(await file.exists())) return { repos: {}, brokenReadOnly: false };
    text = await file.text();
    const data: any = Bun.YAML.parse(text);
    return { repos: normalizeRepos(data?.repos), brokenReadOnly: false };
  } catch {
    return { repos: {}, brokenReadOnly: /readOnly\s*:\s*true/.test(text) };
  }
}

async function readRepos(): Promise<Record<string, Repo>> {
  return (await readManifest()).repos;
}

function realRoot(path: string): string {
  return realTarget(resolve(harenDir, path));
}

function overrideActive(progress: any): boolean {
  if (process.env.HAREN_GATE === "off") return true;
  const o = progress?.gateOverride;
  if (!o || typeof o !== "object" || typeof o.reason !== "string") return false;
  if (o.until === undefined || o.until === null || o.until === "") return true;
  const until = Date.parse(o.until);
  return !Number.isNaN(until) && until > Date.now();
}

// --- Shell commands (Bash tool, Cursor beforeShellExecution) ---
// Best effort: only the readOnly repo check applies to shell commands. It looks
// for a write signal that touches a readOnly repo. A shell can always hide a write,
// so keep the legacy repo read-only at the filesystem or git level too.

const GIT_WRITES = ["commit", "add", "rm", "mv", "checkout", "reset", "apply", "am", "stash", "clean", "restore"];
const PKG_MANAGERS = ["npm", "bun", "pnpm", "yarn"];
const PLAIN_WRITERS = ["rm", "rmdir", "mv", "touch", "mkdir", "chmod", "chown", "ln", "truncate", "tee"];

interface Segment { words: string[]; redirects: string[] }

// Splits a command into segments (&&, ||, ;, |, &, newline) with quote awareness.
// Quotes are removed from words. Redirect targets (> f, >> f, 2> f) go to redirects;
// fd duplications (>&2, 2>&1) are dropped.
function parseShell(command: string): Segment[] {
  const segments: Segment[] = [];
  let seg: Segment = { words: [], redirects: [] };
  let word = "";
  let hasWord = false;
  let quote = "";
  let redirectNext = false;
  const endWord = () => {
    if (hasWord) {
      if (redirectNext) seg.redirects.push(word);
      else seg.words.push(word);
      redirectNext = false;
    }
    word = "";
    hasWord = false;
  };
  const endSegment = () => {
    endWord();
    redirectNext = false;
    if (seg.words.length || seg.redirects.length) segments.push(seg);
    seg = { words: [], redirects: [] };
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = "";
      else word += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      hasWord = true;
      continue;
    }
    if (c === "\\" && i + 1 < command.length) {
      word += command[++i];
      hasWord = true;
      continue;
    }
    if (c === ";" || c === "\n" || c === "|" || c === "&") {
      if (c === "&" && command[i - 1] === ">") continue;
      if ((c === "|" || c === "&") && command[i + 1] === c) i++;
      endSegment();
      continue;
    }
    if (c === ">") {
      if (/^\d+$/.test(word)) {
        word = "";
        hasWord = false;
      } else endWord();
      if (command[i + 1] === ">") i++;
      if (command[i + 1] === "&") {
        // fd duplication: skip the fd target.
        i++;
        while (i + 1 < command.length && /[\w-]/.test(command[i + 1])) i++;
        continue;
      }
      redirectNext = true;
      continue;
    }
    if (c === " " || c === "\t" || c === "<") {
      endWord();
      continue;
    }
    word += c;
    hasWord = true;
  }
  endSegment();
  return segments;
}

// A token refers to a root only when it resolves (relative to cwd) into the root
// and not into an excluded folder.
function makeRefersTo(roots: string[], exclude: string[] = []) {
  return (token: string, cwd: string): boolean => {
    if (!token || token.startsWith("-")) return false;
    const abs = realTarget(resolve(cwd, token));
    if (exclude.some((dir) => inside(abs, dir))) return false;
    return roots.some((root) => inside(abs, root));
  };
}

// Drops git commit message values (-m/--message/-F/--file and their = forms).
// -C/-c <commit> (reuse the message of a commit) take a commit, not a path.
function gitPathArgs(sub: string, args: string[]): string[] {
  if (sub !== "commit") return args;
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-m" || a === "--message" || a === "-F" || a === "--file" || a === "-C" || a === "-c") i++;
    else if (/^(-m|-F)./.test(a) || /^--(message|file)=/.test(a)) continue;
    else out.push(a);
  }
  return out;
}

/** True when the command looks like it writes into one of the roots. */
function shellWritesTo(command: string, startCwd: string, roots: string[], exclude: string[] = []): boolean {
  const refersTo = makeRefersTo(roots, exclude);
  let cwd = startCwd;
  let cwdInRoot = refersTo(cwd, cwd);
  for (const segment of parseShell(command)) {
    if (segment.redirects.some((target) => refersTo(target, cwd))) return true;
    let words = segment.words;
    while (words.length && (/^\w+=/.test(words[0]) || words[0] === "sudo" || words[0] === "env")) words = words.slice(1);
    if (!words.length) continue;
    const [cmd, ...args] = words;
    const name = basename(cmd);
    const anyArg = () => args.some((a) => refersTo(a, cwd));
    if (name === "cd") {
      if (args[0]) {
        cwdInRoot = refersTo(args[0], cwd);
        cwd = resolve(cwd, args[0]);
      }
      continue;
    }
    if (PLAIN_WRITERS.includes(name) && anyArg()) return true;
    if (name === "cp") {
      const operands = args.filter((a) => !a.startsWith("-"));
      const t = args.indexOf("-t");
      const target = t >= 0 ? args[t + 1] : operands[operands.length - 1];
      if (target && refersTo(target, cwd)) return true;
    }
    if (name === "sed" && args.some((a) => a === "--in-place" || /^-[a-zA-Z]*i/.test(a)) && anyArg()) return true;
    if (name === "perl" && args.some((a) => /^-[a-zA-Z]*i/.test(a)) && anyArg()) return true;
    if (name === "dd" && args.some((a) => a.startsWith("of=") && refersTo(a.slice(3), cwd))) return true;
    if (name === "git") {
      let dir = cwd;
      let inLegacy = cwdInRoot;
      let i = 0;
      while (i < args.length && args[i].startsWith("-")) {
        if (args[i] === "-C" && args[i + 1]) {
          inLegacy = refersTo(args[i + 1], dir);
          dir = resolve(dir, args[i + 1]);
          i += 2;
        } else i += 1;
      }
      const sub = args[i] || "";
      if (GIT_WRITES.includes(sub) && (inLegacy || gitPathArgs(sub, args.slice(i + 1)).some((a) => refersTo(a, dir)))) return true;
    }
    if (PKG_MANAGERS.includes(name) && (args.includes("install") || args.includes("i"))) {
      if (cwdInRoot || anyArg()) return true;
    }
  }
  return false;
}

// shell: the payload is a shell event (Claude Bash, Cursor beforeShellExecution).
interface HookInput { target: string; command: string | null; cwd: string; shell: boolean }

async function readInput(): Promise<HookInput> {
  try {
    const stdin = await Bun.stdin.text();
    if (!stdin) return { target: "", command: null, cwd: process.cwd(), shell: false };
    const input = JSON.parse(stdin);
    source = detectSource(input);
    const shell = input?.tool_name === "Bash"
      || input?.hook_event_name === "beforeShellExecution"
      || (input !== null && typeof input === "object" && "command" in input);
    const cwd = typeof input?.cwd === "string" && input.cwd ? input.cwd : process.cwd();
    // Claude Code Bash: tool_input.command. Cursor beforeShellExecution: command.
    const command = typeof input?.tool_input?.command === "string"
      ? input.tool_input.command
      : typeof input?.command === "string" ? input.command : null;
    const filePath = input?.tool_input?.file_path
      || input?.tool_input?.path
      || input?.file_path
      || input?.path
      || "";
    return {
      target: filePath ? realTarget(resolve(cwd, filePath)) : "",
      command: filePath ? null : command,
      cwd,
      shell: shell && !filePath,
    };
  } catch {
    return { target: "", command: null, cwd: process.cwd(), shell: false }; // stdin parse failed — continue with gate check
  }
}

const READ_ONLY_MESSAGE =
  "This repo is read-only (manifest readOnly: true). It is the legacy source of truth. The gate override does not lift this block.";

async function main() {
  const { target, command, cwd, shell } = await readInput();

  // Shell commands: only the readOnly repo check applies. Everything else is allowed.
  // A shell event without a usable command is allowed too (not the Edit/Write gate).
  if (command !== null || shell) {
    if (command === null) allow();
    const manifest = await readManifest();
    const roots = Object.values(manifest.repos)
      .filter((repo) => repo.readOnly)
      .map((repo) => realRoot(repo.path));
    // Broken manifest with a readOnly repo: the repo can be anywhere, so any write
    // outside the haren folder (and /dev) is blocked.
    if (manifest.brokenReadOnly && shellWritesTo(command, cwd, [resolve("/")], [harenDir, realTarget("/dev")])) {
      deny(BROKEN_MANIFEST_MESSAGE);
    }
    if (roots.length && shellWritesTo(command, cwd, roots)) {
      deny(READ_ONLY_MESSAGE + " Shell commands that write into it are blocked too.");
    }
    allow();
  }

  // Allow writes inside the haren folder — planning/discovery phases write artifacts there
  if (target && inside(target, harenDir)) allow();

  if ((await readManifest()).brokenReadOnly) deny(BROKEN_MANIFEST_MESSAGE);

  // Read-only repos (legacy source of truth) are blocked before any override check.
  if (target) {
    for (const repo of Object.values(await readRepos())) {
      if (repo.readOnly && inside(target, realRoot(repo.path))) {
        deny(READ_ONLY_MESSAGE);
      }
    }
  }

  if (process.env.HAREN_GATE === "off") allow();

  const progressFile = Bun.file(resolve(harenDir, "progress.json"));
  if (!(await progressFile.exists())) allow();

  const progress = await progressFile.json();
  if (overrideActive(progress)) allow();

  const modules: Record<string, any> = progress.modules || {};
  const hasModules = Object.keys(modules).length > 0;
  const active = Object.entries(modules).filter(([, m]) =>
    IMPLEMENTABLE.includes(m?.status || m?.currentPhase),
  );

  if (active.length === 0) {
    const message = !hasModules
      ? "No modules or discovery found. Run the discover phase first. Say \"let's build X\" or \"start discovery\" to begin. " + OVERRIDE_HINT
      : "No module has reached 'planned' status yet. Run the plan phase on a module before writing code. " + OVERRIDE_HINT;
    deny(message);
  }

  // No file path, or a file outside the workspace (temp files): legacy rule.
  if (!target || !inside(target, workspaceDir)) allow();

  const repos = await readRepos();
  const roots: string[] = [];
  const described: string[] = [];
  for (const [name, m] of active) {
    const keys: unknown = m?.repos;
    if (!Array.isArray(keys) || keys.length === 0) allow(); // no repo info: allow all
    const paths: string[] = [];
    for (const key of keys) {
      if (key === "default" || typeof key !== "string" || !repos[key]) allow();
      paths.push(repos[key].path);
      roots.push(realRoot(repos[key].path));
    }
    described.push(name + " (" + paths.join(", ") + ")");
  }
  for (const repo of Object.values(repos)) {
    if (repo.role === "e2e") roots.push(realRoot(repo.path));
  }

  if (roots.some((root) => inside(target, root))) allow();

  deny(
    "This file is outside the repos of the modules at 'planned' or later. Active modules: " +
      described.join("; ") + ". " + OVERRIDE_HINT,
  );
}

// Top-level await: on Windows, Bun exits early (code 0, no output) if main() is
// not awaited while it waits on stdin, which would allow every write.
await main().catch((err) => {
  console.error("brainstorm-gate hook error:", err);
  process.exit(1);
});
