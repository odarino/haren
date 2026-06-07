import { create } from "zustand";

type ViewId = "setup" | "progress" | "iterations" | "tasks" | "artifacts" | "activity" | "agent";

interface NavTarget {
  view: ViewId;
  target: string;
  nonce: number;
}

interface ViewState {
  activeView: ViewId;
  navTarget: NavTarget | null;
  setActiveView: (view: ViewId) => void;
  navigate: (view: ViewId, target: string) => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  activeView: "progress",
  navTarget: null,
  setActiveView: (activeView) => set({ activeView }),
  navigate: (view, target) => set({ activeView: view, navTarget: { view, target, nonce: Date.now() } }),
}));
