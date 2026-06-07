import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface ActivityEvent {
  id: string;
  project_id: string;
  actor_user_id: string | null;
  actor_type: string;
  kind: string;
  ref: string;
  message: string;
  created_at: string;
}

export interface ActivityFilters {
  kind?: string;
  actor?: string;
  since?: string;
  limit?: number;
  offset?: number;
}

export function useActivity(projectId: string | undefined, filters?: ActivityFilters) {
  const params = new URLSearchParams();
  if (filters?.kind) params.set("kind", filters.kind);
  if (filters?.actor) params.set("actor", filters.actor);
  if (filters?.since) params.set("since", filters.since);
  if (filters?.limit != null) params.set("limit", String(filters.limit));
  if (filters?.offset != null) params.set("offset", String(filters.offset));

  const qs = params.toString();
  const url = `/api/projects/${projectId}/activity${qs ? `?${qs}` : ""}`;

  return useQuery<ActivityEvent[]>({
    queryKey: ["activity", projectId, filters],
    queryFn: async () => {
      const res = await apiFetch<{ events: ActivityEvent[] }>(url);
      return res.events;
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}
