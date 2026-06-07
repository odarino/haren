import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useThemeStore } from "./stores/theme-store";
import { App } from "./components/App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function ThemeSync() {
  const { theme, accent, density } = useThemeStore();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-accent", accent);
    document.documentElement.setAttribute("data-density", density);
  }, [theme, accent, density]);

  return null;
}

function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <App />
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
