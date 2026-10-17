import { existsSync } from "fs";
import { cp, mkdir, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { isAbsolute, join, resolve } from "path";
import { type PluginManifest, validateManifest } from "./manifest";

export type PluginSource =
  | { kind: "npm"; spec: string }
  | { kind: "git"; url: string; ref?: string }
  | { kind: "file"; path: string };

export function parseSource(text: string): PluginSource {
  const match = /^(npm|git|file):(.*)$/.exec(text);
  if (!match) throw new Error(`Plugin source must start with npm:, git:, or file: — got ${text}`);
  const [, kind, rest] = match as unknown as [string, "npm" | "git" | "file", string];
  if (!rest) throw new Error(`Plugin source is empty: ${text}`);
  if (kind === "npm") return { kind, spec: rest };
  if (kind === "file") return { kind, path: rest };
  const hash = rest.lastIndexOf("#");
  return hash > 0
    ? { kind, url: rest.slice(0, hash), ref: rest.slice(hash + 1) }
    : { kind, url: rest };
}

async function run(cmd: string[], cwd?: string): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`${cmd.join(" ")} failed: ${stderr.trim().split("\n").pop()}`);
}

/** Fetch a plugin into `destDir` (replaced) and return its validated manifest. */
export async function fetchPlugin(source: string, destDir: string, cwd: string): Promise<PluginManifest> {
  const parsed = parseSource(source);
  const work = await mkdtemp(join(tmpdir(), "haren-plugin-"));
  let root: string;
  try {
    if (parsed.kind === "file") {
      root = isAbsolute(parsed.path) ? parsed.path : resolve(cwd, parsed.path);
    } else if (parsed.kind === "git") {
      root = join(work, "repo");
      const ref = parsed.ref ? ["--branch", parsed.ref] : [];
      await run(["git", "clone", "--depth", "1", "-q", ...ref, parsed.url, root]);
      await rm(join(root, ".git"), { recursive: true, force: true });
    } else {
      // npm pack never runs lifecycle scripts.
      await run(["npm", "pack", parsed.spec, "--silent", "--pack-destination", work], work);
      const tgz = (await Array.fromAsync(new Bun.Glob("*.tgz").scan(work)))[0];
      if (!tgz) throw new Error(`npm pack ${parsed.spec} produced no archive`);
      await run(["tar", "-xzf", tgz], work);
      root = join(work, "package");
    }

    const manifestPath = join(root, "haren-plugin.json");
    if (!existsSync(manifestPath)) throw new Error(`No haren-plugin.json in ${source}`);
    const raw = JSON.parse(await readFile(manifestPath, "utf-8"));
    let packageVersion: string | undefined;
    if (parsed.kind === "npm") {
      packageVersion = JSON.parse(await readFile(join(root, "package.json"), "utf-8")).version;
    }
    const manifest = validateManifest(raw, packageVersion);

    await rm(destDir, { recursive: true, force: true });
    await mkdir(destDir, { recursive: true });
    await cp(root, destDir, { recursive: true });
    return manifest;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
