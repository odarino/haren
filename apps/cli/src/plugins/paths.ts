import { isAbsolute } from "path";

/** Throw when a manifest path leaves the plugin folder. */
export function assertInsidePlugin(p: string, field: string): void {
  if (
    isAbsolute(p) ||
    p.startsWith("/") ||
    /^[A-Za-z]:/.test(p) ||
    p.split(/[\\/]/).includes("..")
  ) {
    throw new Error(`Plugin manifest: ${field} path must stay inside the plugin: ${p}`);
  }
}
