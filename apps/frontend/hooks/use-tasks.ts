import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface Task {
  id: string;
  project_id: string;
  module_id: string | null;
  iteration_id: string | null;
  code: string;
  title: string;
  description: string | null;
  status: "backlog" | "planned" | "doing" | "review" | "blocked" | "done" | "cancelled";
  priority: "p0" | "p1" | "p2" | "p3";
  points: number;
  assignee_user_id: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface TaskFilters {
  module?: string;
  status?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}

export function useTasks(projectId: string | undefined, filters?: TaskFilters) {
  return useQuery<Task[]>({
    queryKey: ["tasks", projectId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.module) params.set("module", filters.module);
      if (filters?.status) params.set("status", filters.status);
      if (filters?.priority) params.set("priority", filters.priority);
      if (filters?.limit !== undefined) params.set("limit", String(filters.limit));
      if (filters?.offset !== undefined) params.set("offset", String(filters.offset));
      const qs = params.toString();
      const url = `/api/projects/${projectId}/tasks${qs ? `?${qs}` : ""}`;
      const res = await apiFetch<{ tasks: Task[] }>(url);
      return res.tasks;
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      title: string;
      module_id?: string;
      iteration_id?: string;
      status?: Task["status"];
      priority?: Task["priority"];
      points?: number;
      description?: string;
      tags?: string[];
    }) =>
      apiFetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["progress", projectId] });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      title?: string;
      status?: Task["status"];
      priority?: Task["priority"];
      points?: number;
      module_id?: string | null;
      iteration_id?: string | null;
      description?: string | null;
      assignee_user_id?: string | null;
      tags?: string[];
    }) =>
      apiFetch(`/api/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useParseNL(projectId: string) {
  return useMutation({
    mutationFn: (input: { text: string; modules?: string[]; assignees?: string[] }) =>
      apiFetch(`/api/projects/${projectId}/tasks/parse-nl`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}
