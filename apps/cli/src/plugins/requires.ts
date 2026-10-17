import type { Requirement } from "./manifest";

export type RequirementStatus =
  | { ok: true; version?: string }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "outdated"; version: string };

export function extractVersion(text: string): string | undefined {
  return /(\d+\.\d+\.\d+)/.exec(text)?.[1];
}

export async function checkRequirement(
  req: Requirement,
  env: Record<string, string | undefined> = process.env,
): Promise<RequirementStatus> {
  const path = Bun.which(req.bin, { PATH: env.PATH ?? "" });
  if (!path) return { ok: false, reason: "missing" };
  if (!req.version) return { ok: true };
  const proc = Bun.spawn([path, "--version"], {
    stdout: "pipe",
    stderr: "pipe",
    env: env as Record<string, string>,
  });
  const [out] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  const version = extractVersion(out);
  if (!version || !Bun.semver.satisfies(version, req.version)) {
    return { ok: false, reason: "outdated", version: version ?? "unknown" };
  }
  return { ok: true, version };
}
