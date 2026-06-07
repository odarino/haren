import type { JiraConfig, JiraIssue } from "./jira-types";

export class JiraClient {
  private config: JiraConfig;
  private authHeader: string;

  constructor(config: JiraConfig) {
    this.config = config;
    this.authHeader = `Basic ${btoa(`${config.email}:${config.apiToken}`)}`;
  }

  private get apiBase(): string {
    return `${this.config.baseUrl}/rest/api/3`;
  }

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const res = await fetch(`${this.apiBase}${path}`, {
      ...options,
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Jira API error (${res.status}): ${body}`);
    }

    return res.json();
  }

  async createIssue(fields: {
    summary: string;
    description: string;
    issuetype: { name: string };
    project: { key: string };
    parent?: { key: string };
    labels?: string[];
  }): Promise<JiraIssue> {
    return this.request("/issue", {
      method: "POST",
      body: JSON.stringify({ fields }),
    });
  }

  async searchIssues(jql: string, maxResults = 50): Promise<{ issues: JiraIssue[] }> {
    return this.request(`/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}`);
  }

  async findEpicByLabel(label: string): Promise<JiraIssue | null> {
    const result = await this.searchIssues(
      `project = "${this.config.projectKey}" AND issuetype = Epic AND labels = "${label}"`,
      1,
    );
    return result.issues[0] ?? null;
  }
}

export function buildJiraDescription(module: string, feature: string, status: string): string {
  return [
    `*Haren Module:* ${module}`,
    `*Feature:* ${feature}`,
    `*Status:* ${status}`,
    "",
    "_Auto-created by Haren Portal_",
  ].join("\n");
}
