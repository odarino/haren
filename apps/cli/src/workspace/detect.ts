import { existsSync } from "fs";
import { dirname } from "path";
import { type ChildRepo, hasGitDir, isInsideWorkTree, listChildRepos } from "./git";
import type { Layout } from "./manifest";
import { type HarenLocation, type ResolveOptions, resolveHarenDir } from "./resolve";

export type LayoutKind = "existing" | "monorepo" | "workspace-new" | "unknown";

export interface Detection {
  kind: LayoutKind;
  location: HarenLocation | null;
  childRepos: ChildRepo[];
}

export async function inferLayout(
  dir: string,
): Promise<{ layout: Layout | null; childRepos: ChildRepo[] }> {
  if (hasGitDir(dir)) return { layout: "monorepo", childRepos: [] };
  const childRepos = await listChildRepos(dir);
  if (childRepos.length > 0) return { layout: "workspace", childRepos };
  // init creates a new --dir only when it applies the plan; probe its nearest
  // existing ancestor so a new folder inside a git repo still reads as monorepo.
  let probe = dir;
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
  if (await isInsideWorkTree(probe)) return { layout: "monorepo", childRepos: [] };
  return { layout: null, childRepos: [] };
}

export async function detectLayout(dir: string, opts: ResolveOptions = {}): Promise<Detection> {
  const location = await resolveHarenDir(dir, opts);
  if (location) return { kind: "existing", location, childRepos: [] };

  const { layout, childRepos } = await inferLayout(dir);
  if (layout === "monorepo") return { kind: "monorepo", location: null, childRepos: [] };
  if (layout === "workspace") return { kind: "workspace-new", location: null, childRepos };
  return { kind: "unknown", location: null, childRepos: [] };
}
