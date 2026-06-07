const KNOWN_CLIS = ["claude", "cursor", "github-copilot-cli"] as const;

export async function checkCLI(command: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", command], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
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
