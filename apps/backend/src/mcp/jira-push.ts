import type { JiraConfig, HarenTask, PushResult } from "./jira-types";
import { JiraClient, buildJiraDescription } from "./jira-client";

export async function pushTasksToJira(
  config: JiraConfig,
  tasks: HarenTask[],
): Promise<PushResult[]> {
  const client = new JiraClient(config);
  const results: PushResult[] = [];

  // Group tasks by module
  const byModule = new Map<string, HarenTask[]>();
  for (const task of tasks) {
    const list = byModule.get(task.module) ?? [];
    list.push(task);
    byModule.set(task.module, list);
  }

  for (const [module, moduleTasks] of byModule) {
    // Find or create epic for the module
    let epicKey: string | null = null;
    try {
      const existingEpic = await client.findEpicByLabel(`haren-${module}`);

      if (existingEpic) {
        epicKey = (existingEpic as any).key;
      } else {
        const epic = await client.createIssue({
          summary: `[Haren] ${module}`,
          description: `Haren module: ${module}`,
          issuetype: { name: "Epic" },
          project: { key: config.projectKey },
          labels: [`haren-${module}`],
        });
        epicKey = epic.key;
      }
    } catch (err) {
      // If epic creation fails, continue without parent
      console.error(`Failed to create/find epic for ${module}:`, err);
    }

    for (const task of moduleTasks) {
      // Skip if already pushed
      if (task.jiraKey) {
        results.push({
          task,
          jiraKey: task.jiraKey,
          created: false,
          skipped: true,
        });
        continue;
      }

      try {
        const issue = await client.createIssue({
          summary: `[${module}] ${task.feature}`,
          description: buildJiraDescription(module, task.feature, task.status),
          issuetype: { name: "Task" },
          project: { key: config.projectKey },
          ...(epicKey ? { parent: { key: epicKey } } : {}),
          labels: [`haren-${module}`, "haren"],
        });

        results.push({
          task,
          jiraKey: issue.key,
          created: true,
          skipped: false,
        });
      } catch (err) {
        results.push({
          task,
          jiraKey: "",
          created: false,
          skipped: false,
          error: String(err),
        });
      }
    }
  }

  return results;
}

export function formatPushSummary(results: PushResult[]): string {
  const created = results.filter((r) => r.created);
  const skipped = results.filter((r) => r.skipped);
  const errors = results.filter((r) => r.error);

  const lines: string[] = [];
  lines.push(`Jira Push Summary:`);
  lines.push(`  Created: ${created.length}`);
  lines.push(`  Skipped (already pushed): ${skipped.length}`);
  if (errors.length > 0) {
    lines.push(`  Errors: ${errors.length}`);
    for (const e of errors) {
      lines.push(`    - ${e.task.module}/${e.task.feature}: ${e.error}`);
    }
  }

  if (created.length > 0) {
    lines.push("");
    lines.push("Created tickets:");
    for (const r of created) {
      lines.push(`  ${r.jiraKey} — ${r.task.module}/${r.task.feature}`);
    }
  }

  return lines.join("\n");
}
