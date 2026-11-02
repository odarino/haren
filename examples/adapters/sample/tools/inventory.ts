// Lists the units (screens) under --root. Prints { units } as JSON.
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const root = process.argv[process.argv.indexOf("--root") + 1];
if (!root) throw new Error("Usage: inventory.ts --root <legacyRoot>");

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

function* screenFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* screenFiles(full);
    else if (entry.name.endsWith(".screen.xml")) yield full;
  }
}

const units = [...screenFiles(root)].sort().map((file) => {
  const tag = /<screen\b[^>]*>/.exec(readFileSync(file, "utf-8"))?.[0] ?? "";
  const id = attr(tag, "id");
  if (!id) throw new Error(`No screen id in ${file}`);
  return {
    id,
    parent: attr(tag, "parent") ?? null,
    family: attr(tag, "family"),
    title: attr(tag, "title"),
  };
});
console.log(JSON.stringify({ units }));
