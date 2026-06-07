type OutputCallback = (chunk: string, done: boolean) => void;

export async function executeCLI(
  cli: string,
  prompt: string,
  onOutput: OutputCallback,
): Promise<void> {
  const args = buildCLIArgs(cli, prompt);

  try {
    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
      cwd: process.cwd(),
    });

    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      onOutput(chunk, false);
    }

    const stderrReader = proc.stderr.getReader();
    while (true) {
      const { done, value } = await stderrReader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      onOutput(chunk, false);
    }

    await proc.exited;
    onOutput("", true);
  } catch (err) {
    onOutput(`Error executing ${cli}: ${err}\n`, false);
    onOutput("", true);
  }
}

export function buildCLIArgs(cli: string, prompt: string): string[] {
  switch (cli) {
    case "claude":
      return ["claude", "--print", prompt];
    case "cursor":
      return ["cursor", "--prompt", prompt];
    case "github-copilot-cli":
      return ["github-copilot-cli", prompt];
    default:
      return [cli, prompt];
  }
}
