import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";

interface Module {
  id: string;
  project_id: string;
  code: string;
  name: string;
  owner_user_id: string | null;
  status: string;
  eta: string | null;
  tags: string[];
  created_at: string;
}

export function useModules(projectId: string | undefined) {
  return useQuery<Module[]>({
    queryKey: ["modules", projectId],
    queryFn: async () => {
      const res = await apiFetch<{ modules: Module[] }>(`/api/projects/${projectId}/modules`);
      return res.modules;
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useCreateModule(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { code: string; name: string; status?: string; tags?: string[] }) =>
      apiFetch(`/api/projects/${projectId}/modules`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["modules", projectId] }),
  });
}
