import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { useThemeStore } from "../stores/theme-store";

export interface Preferences {
  id?: string;
  user_id: string;
  project_id: string | null;
  theme: "light" | "dark";
  accent: string;
  density: "compact" | "comfy";
  sidebar_collapsed: boolean;
  pinned_items: Array<{ view: string; target: string; label: string }>;
}

export interface UpsertPreferencesInput {
  project_id?: string | null;
  theme: "light" | "dark";
  accent: string;
  density: "compact" | "comfy";
  sidebar_collapsed: boolean;
  pinned_items?: Array<{ view: string; target: string; label: string }>;
}

export function usePreferences(userId: string | undefined, projectId?: string) {
  return useQuery<Preferences>({
    queryKey: ["preferences", userId, projectId ?? null],
    queryFn: async () => {
      const params = projectId ? `?projectId=${projectId}` : "";
      const res = await apiFetch<{ preferences: Preferences }>(
        `/api/users/${userId}/preferences${params}`,
      );
      return res.preferences;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}

export function useUpdatePreferences(userId: string) {
  const qc = useQueryClient();
  const setTheme = useThemeStore((s) => s.setTheme);
  const setAccent = useThemeStore((s) => s.setAccent);
  const setDensity = useThemeStore((s) => s.setDensity);

  return useMutation({
    mutationFn: (input: UpsertPreferencesInput) =>
      apiFetch<{ preferences: Preferences }>(`/api/users/${userId}/preferences`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      const prefs = data.preferences;
      // Sync to Zustand theme store
      setTheme(prefs.theme);
      setAccent(prefs.accent);
      setDensity(prefs.density);
      // Invalidate cached queries
      qc.invalidateQueries({ queryKey: ["preferences", userId] });
    },
  });
}
