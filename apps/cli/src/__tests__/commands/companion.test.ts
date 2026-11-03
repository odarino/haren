import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { companion, latestSession } from "../../commands/companion";
import { scaffoldWorkspace } from "../../commands/init";
import { parseArgs } from "../../index";

describe("haren companion", () => {
  let root: string;
  let harenDir: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "haren-companion-"));
    harenDir = join(root, "haren-dev");
    await mkdir(harenDir, { recursive: true });
    await writeFile(join(harenDir, "manifest.yaml"), 'haren:\n  version: "1.5.0"\n');
    await writeFile(
      join(harenDir, "progress.json"),
      '{"project":"t","version":3,"modules":{},"dependencies":{}}',
    );
  });

  afterEach(async () => {
    const s = latestSession(harenDir);
    if (s?.running) await companion(["stop"], root);
    await rm(root, { recursive: true, force: true });
  });

  it("starts in the background, reports status, stops", async () => {
    await companion(["start"], root);
    const s = latestSession(harenDir)!;
    expect(s.running).toBe(true);
    const r = await fetch(s.info!.url);
    expect(r.status).toBe(200);
    await companion(["status"], root);
    await companion(["stop"], root);
    expect(latestSession(harenDir)!.running).toBe(false);
    await expect(companion(["status"], root)).rejects.toThrow();
  }, 15000);

  it("reuses the previous port on restart", async () => {
    await companion(["start"], root);
    const p1 = latestSession(harenDir)!.info!.port;
    await companion(["stop"], root);
    await companion(["start"], root);
    expect(latestSession(harenDir)!.info!.port).toBe(p1);
    await companion(["stop"], root);
  }, 15000);

  it("init writes .companion/ into the haren .gitignore", async () => {
    const dir = join(root, "fresh");
    await mkdir(dir, { recursive: true });
    await scaffoldWorkspace(dir, { project: "test", mode: "blueprint", language: "English" });
    const lines = (await readFile(join(dir, ".gitignore"), "utf-8")).split("\n");
    expect(lines).toContain(".companion/");
  });

  it("is wired in the CLI", () => {
    expect(parseArgs(["companion", "start"])).toEqual({ command: "companion", args: ["start"] });
  });
});
