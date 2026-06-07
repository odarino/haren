// Copies the repo-root content/ into apps/cli/content/ for packaging.
import { cp, rm } from "fs/promises";
import { resolve } from "path";

const pkgRoot = resolve(import.meta.dir, "..");
const src = resolve(pkgRoot, "..", "..", "content"); // apps/cli → apps → root → content
const dest = resolve(pkgRoot, "content");

await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });
console.log(`Copied content from ${src} to ${dest}`);
