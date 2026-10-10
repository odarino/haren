const KNOWN_CLIS = ["claude", "cursor", "github-copilot-cli"] as const;

export async function checkCLI(command: string): Promise<boolean> {
  // Bun.which works on every OS; the `which` command does not exist on Windows.
  return Bun.which(command) !== null;
}

export async function detectCLIs(): Promise<string[]> {
  const results = await Promise.all(
    KNOWN_CLIS.map(async (cli) => ({
      name: cli,
      available: await checkCLI(cli),
    })),
  );
  return results.filter((r) => r.available).map((r) => r.name);
}
