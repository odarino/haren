import { useState, useEffect, useCallback, useRef } from "react";
import { Transport } from "./transport";
import type { AgentEventType } from "@haren/shared";

export interface CommandChunk {
  commandId: string;
  chunk: string;
  done: boolean;
}

export interface CommandEvent {
  commandId: string;
  event: AgentEventType;
}

export interface PortalData {
  progress: any | null;
  artifacts: any[] | null;
  gitLog: any[] | null;
  fileContent: string | null;
  lastCommandChunk: CommandChunk | null;
  lastCommandEvent: CommandEvent | null;
}

export interface PortalState {
  status: "connected" | "reconnecting" | "offline";
  data: PortalData;
  projects: { id: string; name: string; agentOnline: boolean }[];
  requestData: (projectId: string, path: string) => void;
  sendCommand: (projectId: string, prompt: string, cli: string) => void;
}

export function usePortal(
  baseUrl: string,
  teamId: string | null,
  userId: string | null,
): PortalState {
  const [status, setStatus] = useState<"connected" | "reconnecting" | "offline">("offline");
  const [data, setData] = useState<PortalData>({
    progress: null,
    artifacts: null,
    gitLog: null,
    fileContent: null,
    lastCommandChunk: null,
    lastCommandEvent: null,
  });
  const [projects, setProjects] = useState<{ id: string; name: string; agentOnline: boolean }[]>(
    [],
  );
  const transportRef = useRef<Transport | null>(null);
  const pendingRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!teamId || !userId) return;

    const transport = new Transport({
      baseUrl,
      onMessage: (msg: any) => {
        if (msg.type === "subscribed") {
          setProjects(msg.projects);
        } else if (msg.type === "data-response") {
          const path = msg.path as string | undefined;
          const d = msg.data;

          if (path === "progress") {
            setData((prev) => ({ ...prev, progress: d }));
          } else if (path === "artifacts") {
            setData((prev) => ({ ...prev, artifacts: d as any[] }));
          } else if (path === "git-log") {
            setData((prev) => ({ ...prev, gitLog: d as any[] }));
          } else if (path?.startsWith("artifacts/")) {
            setData((prev) => ({ ...prev, fileContent: d as string }));
          }
        } else if (msg.type === "command-output") {
          setData((prev) => ({
            ...prev,
            lastCommandChunk: {
              commandId: msg.commandId,
              chunk: msg.chunk,
              done: msg.done,
            },
          }));
        } else if (msg.type === "command-event") {
          setData((prev) => ({
            ...prev,
            lastCommandEvent: {
              commandId: msg.commandId,
              event: msg.event,
            },
          }));
        } else if (msg.type === "agent-status") {
          setProjects((prev) =>
            prev.map((p) => (p.id === msg.projectId ? { ...p, agentOnline: msg.online } : p)),
          );
        }
      },
      onStatus: setStatus,
    });

    transportRef.current = transport;
    transport.connect({ teamId, userId });

    return () => {
      transport.disconnect();
      transportRef.current = null;
    };
  }, [baseUrl, teamId, userId]);

  const requestData = useCallback(
    (projectId: string, path: string) => {
      const transport = transportRef.current;
      if (!transport || !userId) return;

      const requestId = crypto.randomUUID();
      pendingRef.current.set(requestId, path);
      transport.send({
        type: "data-request",
        projectId,
        userId,
        path,
      });
    },
    [userId],
  );

  const clearFileContent = useCallback(() => {
    setData((prev) => ({ ...prev, fileContent: null }));
  }, []);

  const sendCommand = useCallback(
    (projectId: string, prompt: string, cli: string) => {
      const transport = transportRef.current;
      if (!transport || !userId) return;

      transport.send({
        type: "command",
        projectId,
        userId,
        prompt,
        cli,
      });
    },
    [userId],
  );

  return { status, data, projects, requestData, sendCommand, clearFileContent };
}
