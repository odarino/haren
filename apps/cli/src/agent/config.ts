import { join } from "path";

export interface AgentConfig {
  portalUrl: string;
  teamCode: string;
  userId: string;
  userName: string;
}

const CONFIG_FILE = ".agent.json";

export async function readAgentConfig(harenDir: string): Promise<AgentConfig | null> {
  const file = Bun.file(join(harenDir, CONFIG_FILE));
  if (!(await file.exists())) return null;
  return file.json();
}

export async function writeAgentConfig(harenDir: string, config: AgentConfig): Promise<void> {
  const path = join(harenDir, CONFIG_FILE);
  await Bun.write(path, JSON.stringify(config, null, 2));
}
