export type PluginSource =
  | { kind: "npm"; spec: string }
  | { kind: "git"; url: string; ref?: string }
  | { kind: "file"; path: string };

export function parseSource(text: string): PluginSource {
  const match = /^(npm|git|file):(.*)$/.exec(text);
  if (!match) throw new Error(`Plugin source must start with npm:, git:, or file: — got ${text}`);
  const [, kind, rest] = match as unknown as [string, "npm" | "git" | "file", string];
  if (!rest) throw new Error(`Plugin source is empty: ${text}`);
  if (kind === "npm") return { kind, spec: rest };
  if (kind === "file") return { kind, path: rest };
  const hash = rest.lastIndexOf("#");
  return hash > 0
    ? { kind, url: rest.slice(0, hash), ref: rest.slice(hash + 1) }
    : { kind, url: rest };
}
