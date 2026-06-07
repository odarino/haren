import { existsSync } from "fs";
import { join, resolve } from "path";

/**
 * Resolve the bundled `content/` directory in both layouts:
 *  - Published package: `dist/index.js` with sibling `content/`
 *    → one level up from the (bundled) module dir.
 *  - Monorepo dev: this file lives at `apps/cli/src/lib/`, content is at
 *    repo root → four levels up.
 * Probes candidates in order and returns the first that contains `agents/`.
 */
export function resolveContentDir(candidates?: string[]): string {
  const probes = candidates ?? [
    // published: <pkg>/dist + <pkg>/content  (import.meta.dir === <pkg>/dist)
    resolve(import.meta.dir, "..", "content"),
    // dev: apps/cli/src/lib → repo root
    resolve(import.meta.dir, "..", "..", "..", "..", "content"),
  ];

  for (const dir of probes) {
    if (existsSync(join(dir, "agents"))) return dir;
  }

  throw new Error(`Could not locate the Haren content directory. Tried:\n  ${probes.join("\n  ")}`);
}
