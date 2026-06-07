import React, { useState, useCallback, useEffect } from "react";
import { TopRail } from "./chrome/TopRail";
import { ChromeSidebar } from "./chrome/Sidebar";
import { SetupScreen } from "./SetupScreen";
import { ProgressView } from "./views/progress/ProgressView";
import { IterationsView } from "./views/iterations/IterationsView";
import { TasksView } from "./views/tasks/TasksView";
import { ArtifactsView } from "./views/artifacts/ArtifactsView";
import { ActivityView } from "./views/activity/ActivityView";
import { AgentView } from "./views/agent/AgentView";
import { usePortal } from "../lib/use-portal";
import { useViewStore } from "../stores/view-store";
import { useSidebarStore } from "../stores/sidebar-store";

interface Session {
  teamId: string;
  teamName: string;
  teamCode: string;
  userId: string;
  userName: string;
}

interface CommandOutput {
  commandId: string;
  chunks: string[];
  done: boolean;
}

const STORAGE_KEY = "haren-portal-session";
const BASE_URL = window.location.origin;

const VIEW_LABELS: Record<string, string> = {
  progress: "Progress",
  iterations: "Iterations",
  tasks: "Tasks",
  artifacts: "Artifacts",
  activity: "Activity",
  agent: "Agent",
};

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session: Session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [commandOutput, setCommandOutput] = useState<CommandOutput[]>([]);
  const [commandEvents, setCommandEvents] = useState<
    { commandId: string; event: import("@haren/shared").AgentEventType }[]
  >([]);

  const activeView = useViewStore((s) => s.activeView);
  const setActiveView = useViewStore((s) => s.setActiveView);
  const navigate = useViewStore((s) => s.navigate);

  const portal = usePortal(BASE_URL, session?.teamId ?? null, session?.userId ?? null);

  // When projects load, auto-select first one
  useEffect(() => {
    if (portal.projects.length > 0 && !activeProjectId) {
      setActiveProjectId(portal.projects[0].id);
    }
  }, [portal.projects, activeProjectId]);

  // Request data when project is selected and agent is connected
  useEffect(() => {
    if (portal.status !== "connected" || !activeProjectId) return;

    portal.requestData(activeProjectId, "progress");
    portal.requestData(activeProjectId, "artifacts");
    portal.requestData(activeProjectId, "git-log");
  }, [portal.status, activeProjectId]);

  // Process command output chunks — merge into the pending entry
  useEffect(() => {
    const chunk = portal.data.lastCommandChunk;
    if (!chunk) return;

    setCommandOutput((prev) => {
      const existing = prev.find((c) => c.commandId === chunk.commandId);
      if (existing) {
        return prev.map((c) =>
          c.commandId === chunk.commandId
            ? {
                ...c,
                chunks: [...c.chunks, chunk.chunk],
                done: chunk.done,
              }
            : c,
        );
      }

      const pendingIdx = prev.findLastIndex((c) => c.commandId.startsWith("pending-"));
      if (pendingIdx >= 0) {
        const updated = [...prev];
        updated[pendingIdx] = {
          commandId: chunk.commandId,
          chunks: [...updated[pendingIdx].chunks, chunk.chunk],
          done: chunk.done,
        };
        return updated;
      }

      return [
        ...prev,
        {
          commandId: chunk.commandId,
          chunks: [chunk.chunk],
          done: chunk.done,
        },
      ];
    });
  }, [portal.data.lastCommandChunk]);

  // Accumulate structured command events
  useEffect(() => {
    const evt = portal.data.lastCommandEvent;
    if (!evt) return;
    setCommandEvents((prev) => [...prev, evt]);
  }, [portal.data.lastCommandEvent]);

  const agentOnline = portal.projects.some((p) => p.agentOnline);

  const handleSendCommand = useCallback(
    (prompt: string, cli: string) => {
      if (!activeProjectId) return;
      setCommandOutput((prev) => [
        ...prev,
        {
          commandId: `pending-${Date.now()}`,
          chunks: [`> ${cli}: ${prompt}\n`],
          done: false,
        },
      ]);
      portal.sendCommand(activeProjectId, prompt, cli);
    },
    [activeProjectId, portal.sendCommand],
  );

  const handleJoin = async (teamCode: string, userName: string) => {
    setSetupError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/teams/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: teamCode, userName }),
      });
      if (!res.ok) {
        const body = await res.json();
        setSetupError(body.error || "Failed to join team");
        return;
      }
      const { team, user } = await res.json();
      const s: Session = {
        teamId: team.id,
        teamName: team.name,
        teamCode: team.code,
        userId: user.id,
        userName: user.name,
      };
      saveSession(s);
      setSession(s);
    } catch {
      setSetupError("Connection failed");
    }
  };

  const handleCreate = async (teamName: string, userName: string) => {
    setSetupError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: teamName, userName }),
      });
      if (!res.ok) {
        const body = await res.json();
        setSetupError(body.error || "Failed to create team");
        return;
      }
      const { team, user } = await res.json();
      const s: Session = {
        teamId: team.id,
        teamName: team.name,
        teamCode: team.code,
        userId: user.id,
        userName: user.name,
      };
      saveSession(s);
      setSession(s);
    } catch {
      setSetupError("Connection failed");
    }
  };

  if (!session) {
    return <SetupScreen onJoin={handleJoin} onCreate={handleCreate} error={setupError} />;
  }

  const activeProject = portal.projects.find((p) => p.id === activeProjectId);
  const viewLabel = VIEW_LABELS[activeView] ?? activeView;

  // Map portal status to TopRail agentStatus
  const agentStatus: "online" | "offline" | "reconnecting" =
    portal.status === "connected"
      ? agentOnline
        ? "online"
        : "offline"
      : portal.status === "reconnecting"
        ? "reconnecting"
        : "offline";

  function renderView() {
    const projectId = activeProjectId ?? "";
    switch (activeView) {
      case "progress":
        return <ProgressView projectId={projectId} />;
      case "iterations":
        return <IterationsView projectId={projectId} />;
      case "tasks":
        return <TasksView projectId={projectId} />;
      case "artifacts":
        return <ArtifactsView projectId={projectId} />;
      case "activity":
        return <ActivityView projectId={projectId} />;
      case "agent":
        return (
          <AgentView
            projectId={projectId}
            availableCLIs={["claude", "cursor"]}
            agentOnline={agentOnline}
            onSendCommand={handleSendCommand}
            onClearChat={() => {
              setCommandOutput([]);
              setCommandEvents([]);
            }}
            commandOutput={commandOutput}
            commandEvents={commandEvents}
            userName={session?.userName}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <TopRail
        viewLabel={viewLabel}
        projectName={activeProject?.name}
        agentStatus={agentStatus}
      />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <ChromeSidebar
          activeView={activeView}
          onViewChange={(view) => setActiveView(view as Parameters<typeof setActiveView>[0])}
          onNavigate={(view, target) => navigate(view as Parameters<typeof navigate>[0], target)}
          projectName={session.teamName}
        />
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 24,
          }}
        >
          {renderView()}
        </main>
      </div>
    </div>
  );
}
