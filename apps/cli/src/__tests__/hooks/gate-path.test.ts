import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { realpathSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { brainstormGateScript } from "../../workspace/templates";

let root: string;

beforeEach(async () => {
  // realpath: macOS tmpdir is a symlink (/var → /private/var)
  root = realpathSync(await mkdtemp(join(tmpdir(), "haren-gate-")));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function setup(harenRel: string): Promise<{ workspace: string; harenDir: string }> {
  const workspace = join(root, ...harenRel.split("/").slice(0, -1));
  const harenDir = join(root, harenRel);
  await mkdir(join(harenDir, "hooks"), { recursive: true });
  await writeFile(join(harenDir, "hooks", "brainstorm-gate.ts"), brainstormGateScript);
  await writeFile(
    join(harenDir, "progress.json"),
    JSON.stringify({ version: 2, modules: { a: { status: "discovered" } } }),
  );
  return { workspace, harenDir };
}

async function runGate(harenDir: string, cwd: string, filePath: string): Promise<number> {
  const proc = Bun.spawn(["bun", join(harenDir, "hooks", "brainstorm-gate.ts")], {
    cwd,
    stdin: new Blob([JSON.stringify({ tool_input: { file_path: filePath } })]),
    stdout: "pipe",
    stderr: "pipe",
  });
  return proc.exited;
}

describe("brainstorm-gate path check", () => {
  it("allows writes inside a renamed haren folder (relative and absolute)", async () => {
    const { workspace, harenDir } = await setup("ws/cmis_ai_rules");
    expect(await runGate(harenDir, workspace, "cmis_ai_rules/artifacts/x.md")).toBe(0);
    expect(await runGate(harenDir, workspace, join(harenDir, "artifacts", "x.md"))).toBe(0);
  });

  it("blocks code writes when the workspace path contains /haren/", async () => {
    const { workspace, harenDir } = await setup("haren/shop/rules");
    expect(await runGate(harenDir, workspace, join(workspace, "backend", "x.ts"))).toBe(2);
  });

  it("blocks a sibling folder whose name starts with the haren folder name", async () => {
    const { workspace, harenDir } = await setup("ws/haren");
    expect(await runGate(harenDir, workspace, join(workspace, "haren-old", "x.ts"))).toBe(2);
  });
});
