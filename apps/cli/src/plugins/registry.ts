export interface RegistryEntry {
  name: string;
  source: string;
  description: string;
}

/** Official plugins. `haren init` offers these; other sources need a confirmation. */
export const REGISTRY: RegistryEntry[] = [
  {
    name: "backlog",
    source: "npm:@odarino/haren-plugin-backlog",
    description: "Two-way sync between haren tasks and a Backlog.md board",
  },
];

/** A bare name must be in the registry. A source (npm:/git:/file:) passes through. */
export function resolvePluginRef(ref: string): { source: string; official: boolean } {
  if (/^(npm|git|file):/.test(ref)) {
    return { source: ref, official: REGISTRY.some((e) => e.source === ref) };
  }
  const entry = REGISTRY.find((e) => e.name === ref);
  if (!entry)
    throw new Error(`Unknown plugin: ${ref}. Use a registry name or npm:/git:/file: source.`);
  return { source: entry.source, official: true };
}
