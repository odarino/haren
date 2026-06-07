import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

interface ModuleStat {
  id: string;
  code: string;
  name: string;
  status: string;
  totalTasks: number;
  doneTasks: number;
  blockers: number;
  progress: number;
  eta: string | null;
  owner_user_id: string | null;
  tags: string[];
}

interface ProgressData {
  totalTasks: number;
  doneTasks: number;
  blockedTasks: number;
  overallPercent: number;
  activeIteration: {
    id: string;
    code: string;
    label: string;
    scope: number;
    velocity: number;
    start_date: string;
    end_date: string;
  } | null;
  moduleStats: ModuleStat[];
}

export function useProgress(projectId: string | undefined) {
  return useQuery<ProgressData>({
    queryKey: ["progress", projectId],
    queryFn: () => apiFetch<ProgressData>(`/api/projects/${projectId}/progress`),
    enabled: !!projectId,
    staleTime: 30_000,
  });
}
