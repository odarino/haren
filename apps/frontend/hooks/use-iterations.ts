import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface Iteration {
  id: string;
  project_id: string;
  code: string;
  label: string;
  status: "planned" | "active" | "shipped";
  start_date: string;
  end_date: string;
  scope: number;
  velocity: number;
  notes: string | null;
  created_at: string;
}

export interface BurnupSnapshot {
  snapshot_date: string;
  points_done: number;
  scope: number;
}

export interface IterationDetail {
  iteration: Iteration;
  burnup: BurnupSnapshot[];
}

export function useIterations(projectId: string | undefined) {
  return useQuery<Iteration[]>({
    queryKey: ["iterations", projectId],
    queryFn: async () => {
      const res = await apiFetch<{ iterations: Iteration[] }>(
        `/api/projects/${projectId}/iterations`,
      );
      return res.iterations;
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useIteration(id: string | undefined) {
  return useQuery<IterationDetail>({
    queryKey: ["iteration", id],
    queryFn: () => apiFetch<IterationDetail>(`/api/iterations/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateIteration(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      code: string;
      label: string;
      start_date: string;
      end_date: string;
      scope: number;
      notes?: string;
    }) =>
      apiFetch(`/api/projects/${projectId}/iterations`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["iterations", projectId] }),
  });
}
