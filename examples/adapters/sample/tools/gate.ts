// Checks a spec against the extracted IR. Prints { unit, pass, findings } as JSON.
import { readFileSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const specPath = args[0];
const irDir = flag("--ir");
if (!specPath || !irDir) throw new Error("Usage: gate.ts <specPath> --ir <dir>");

const xml = readFileSync(join(irDir, "ir.xml"), "utf-8");
const spec = readFileSync(specPath, "utf-8");
const unit = /<screen\b[^>]*\bid="([^"]*)"/.exec(xml)?.[1] ?? "";

/** Text of the "## Writes" section, up to the next heading. */
const writes = /^## Writes\s*$([\s\S]*?)(?=^#{1,6} |(?![\s\S]))/m.exec(spec)?.[1] ?? "";

/** True when `token` appears in `text` as a whole token, not inside a longer name. */
const hasToken = (text: string, token: string) =>
  new RegExp(
    `(?<![A-Za-z0-9_.])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_]|\\.[A-Za-z0-9_])`,
  ).test(text);

const findings: { severity: "error"; rule: string; message: string }[] = [];
for (const [, bind] of xml.matchAll(/\bbind="([^"]+)"/g)) {
  if (!hasToken(spec, bind)) {
    findings.push({
      severity: "error",
      rule: "missing-binding",
      message: `Binding ${bind} is not in the spec`,
    });
  }
}
for (const [, table] of xml.matchAll(/<writes\b[^>]*\btable="([^"]+)"/g)) {
  if (!hasToken(writes, table)) {
    findings.push({
      severity: "error",
      rule: "missing-writes",
      message: `Table ${table} is not under the Writes heading`,
    });
  }
}
console.log(JSON.stringify({ unit, pass: findings.length === 0, findings }));
