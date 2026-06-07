import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ThemeState {
  theme: "light" | "dark";
  accent: string;
  density: "compact" | "comfy";
  setTheme: (t: "light" | "dark") => void;
  setAccent: (a: string) => void;
  setDensity: (d: "compact" | "comfy") => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "light",
      accent: "blue-yellow-green-purple",
      density: "comfy",
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setDensity: (density) => set({ density }),
    }),
    { name: "haren-theme" },
  ),
);
