// Copies the repo-root content/ into apps/cli/content/ for packaging,
// plus README.md and LICENSE so the published package carries them.
import { cp, rm } from "fs/promises";
import { resolve } from "path";

const pkgRoot = resolve(import.meta.dir, "..");
const repoRoot = resolve(pkgRoot, "..", ".."); // apps/cli → apps → root
const src = resolve(repoRoot, "content");
const dest = resolve(pkgRoot, "content");

await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });
console.log(`Copied content from ${src} to ${dest}`);

// npm auto-includes README/LICENSE from the package dir, so mirror them here.
for (const file of ["README.md", "LICENSE"]) {
  await cp(resolve(repoRoot, file), resolve(pkgRoot, file));
  console.log(`Copied ${file} into ${pkgRoot}`);
}
