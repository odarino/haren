// Extracts one unit: copies its XML to <out>/ir.xml and writes <out>/view.txt.
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const unit = args[0];
const root = flag("--root");
const out = flag("--out");
if (!unit || !root || !out) throw new Error("Usage: extract.ts <unit> --root <dir> --out <dir>");

function find(dir: string): string | undefined {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = find(full);
      if (hit) return hit;
    } else if (entry.name === `${unit}.screen.xml`) return full;
  }
}

const file = find(root);
if (!file) throw new Error(`Unit ${unit} not found under ${root}`);
copyFileSync(file, join(out, "ir.xml"));

const xml = readFileSync(file, "utf-8");
const lines = [...xml.matchAll(/<field\b[^>]*>/g)].map((m) => {
  const name = /\bname="([^"]*)"/.exec(m[0])?.[1] ?? "?";
  const bind = /\bbind="([^"]*)"/.exec(m[0])?.[1] ?? "(computed)";
  return `${name} <- ${bind}`;
});
writeFileSync(join(out, "view.txt"), `${lines.join("\n")}\n`);
console.log(JSON.stringify({ unit, files: ["ir.xml", "view.txt"] }));
