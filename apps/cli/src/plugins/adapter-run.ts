import type { AdapterCommand } from "./adapter-spec";

export interface InventoryOut {
  units: { id: string; parent: string | null; family?: string; title?: string }[];
}

export interface ExtractOut {
  unit: string;
  files: string[];
}

export interface GateOut {
  unit: string;
  pass: boolean;
  findings: { severity: "error" | "warning"; rule: string; message: string }[];
}

/** An adapter failure. Callers use the name to tell it from a gate FAIL. */
export class AdapterError extends Error {
  name = "AdapterError";
}

/** Split a command template into argv. Placeholders never go through a shell. */
export function buildArgv(template: string, values: Record<string, string>): string[] {
  return template
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const whole = /^\{(\w+)\}$/.exec(tok);
      if (whole) {
        if (!Object.hasOwn(values, whole[1]))
          throw new AdapterError(`No value for placeholder {${whole[1]}}`);
        return values[whole[1]];
      }
      return tok.replace(/\{(\w+)\}/g, (_, k) => {
        if (!Object.hasOwn(values, k)) throw new AdapterError(`No value for placeholder {${k}}`);
        return values[k];
      });
    });
}

const isStr = (v: unknown) => typeof v === "string" && v.length > 0;
const VALIDATORS: Record<AdapterCommand, (o: any) => boolean> = {
  inventory: (o) =>
    Array.isArray(o?.units) &&
    o.units.every((u: any) => isStr(u?.id) && (u.parent === null || isStr(u.parent))),
  extract: (o) => isStr(o?.unit) && Array.isArray(o.files) && o.files.every(isStr),
  gate: (o) =>
    isStr(o?.unit) &&
    typeof o.pass === "boolean" &&
    Array.isArray(o.findings) &&
    o.findings.every(
      (f: any) =>
        (f?.severity === "error" || f?.severity === "warning") &&
        isStr(f.rule) &&
        typeof f.message === "string",
    ),
};

function spawnAdapter(command: AdapterCommand, argv: string[], cwd: string) {
  try {
    return Bun.spawn(argv, { cwd, stdout: "pipe", stderr: "pipe" });
  } catch (e) {
    throw new AdapterError(
      `adapter ${command} could not start: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export async function runAdapter<T>(
  command: AdapterCommand,
  template: string,
  values: Record<string, string>,
  cwd: string,
): Promise<T> {
  const proc = spawnAdapter(command, buildArgv(template, values), cwd);
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0)
    throw new AdapterError(`adapter ${command} exited ${code}: ${err.trim().slice(0, 500)}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(out);
  } catch {
    throw new AdapterError(`adapter ${command} printed non-JSON output (schema)`);
  }
  if (!VALIDATORS[command](parsed)) {
    throw new AdapterError(`adapter ${command} output does not match the schema`);
  }
  return parsed as T;
}
