import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PinnedItem {
  view: string;
  target: string;
  label: string;
  icon: string;
}

interface SidebarState {
  collapsed: boolean;
  pinnedItems: PinnedItem[];
  toggleCollapsed: () => void;
  setCollapsed: (v: boolean) => void;
  setPinnedItems: (items: PinnedItem[]) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      pinnedItems: [],
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
      setPinnedItems: (pinnedItems) => set({ pinnedItems }),
    }),
    { name: "haren-sidebar" },
  ),
);
