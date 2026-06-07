export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
}

export interface HarenTask {
  module: string;
  feature: string;
  status: string;
  jiraKey?: string;
}

export interface PushResult {
  task: HarenTask;
  jiraKey: string;
  created: boolean;
  skipped: boolean;
  error?: string;
}
