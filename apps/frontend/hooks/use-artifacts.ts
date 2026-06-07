import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface ArtifactSummary {
  id: string;
  project_id: string;
  path: string;
  kind: string;
  updated_by_user_id: string | null;
  size_bytes: number;
  updated_at: string;
  created_at: string;
}

export interface Artifact extends ArtifactSummary {
  body: string;
}

export function useArtifacts(projectId: string | undefined) {
  return useQuery<ArtifactSummary[]>({
    queryKey: ["artifacts", projectId],
    queryFn: async () => {
      const res = await apiFetch<{ artifacts: ArtifactSummary[] }>(
        `/api/projects/${projectId}/artifacts`,
      );
      return res.artifacts;
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useArtifact(id: string | null) {
  return useQuery<Artifact>({
    queryKey: ["artifact", id],
    queryFn: async () => {
      const res = await apiFetch<{ artifact: Artifact }>(`/api/artifacts/${id}`);
      return res.artifact;
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}
