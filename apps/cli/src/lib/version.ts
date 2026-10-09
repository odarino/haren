import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

/**
 * Read the version of the @odarino/haren package in both layouts:
 *  - Published package: dist/index.js → ../package.json
 *  - Monorepo dev: src/lib/version.ts → ../../package.json
 */
export function readHarenVersion(candidates?: string[]): string {
  const probes = candidates ?? [
    resolve(import.meta.dir, "..", "package.json"),
    resolve(import.meta.dir, "..", "..", "package.json"),
  ];
  for (const path of probes) {
    if (!existsSync(path)) continue;
    const pkg = JSON.parse(readFileSync(path, "utf-8"));
    if (pkg.name === "@odarino/haren" && typeof pkg.version === "string") return pkg.version;
  }
  return "0.0.0";
}

export const HAREN_VERSION = readHarenVersion();
