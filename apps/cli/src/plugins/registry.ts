export interface RegistryEntry {
  name: string;
  source: string;
  description: string;
}

/** Official plugins. `haren init` offers these; other sources need a confirmation. */
export const REGISTRY: RegistryEntry[] = [
  {
    name: "backlog",
    source: "npm:@odarino/backlog.md",
    description: "Two-way sync between haren tasks and a Backlog.md board",
  },
];

/** Package name of an npm spec, without its version or tag. */
export function npmPackageName(spec: string): string {
  const at = spec.indexOf("@", spec.startsWith("@") ? 1 : 0);
  return at === -1 ? spec : spec.slice(0, at);
}

/** An npm source is official when its package matches a registry npm package. Other sources match exactly. */
function isOfficialSource(source: string): boolean {
  if (source.startsWith("npm:")) {
    const name = npmPackageName(source.slice(4));
    return REGISTRY.some(
      (e) => e.source.startsWith("npm:") && npmPackageName(e.source.slice(4)) === name,
    );
  }
  return REGISTRY.some((e) => e.source === source);
}

/** A bare name must be in the registry. A source (npm:/git:/file:) passes through. */
export function resolvePluginRef(ref: string): { source: string; official: boolean } {
  if (/^(npm|git|file):/.test(ref)) {
    return { source: ref, official: isOfficialSource(ref) };
  }
  const entry = REGISTRY.find((e) => e.name === ref);
  if (!entry)
    throw new Error(`Unknown plugin: ${ref}. Use a registry name or npm:/git:/file: source.`);
  return { source: entry.source, official: true };
}
