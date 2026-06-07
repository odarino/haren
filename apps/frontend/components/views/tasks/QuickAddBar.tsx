import React, { useState, useRef, useEffect, useCallback } from "react";
import { Chip } from "../../shared/Chip";
import { useParseNL, useCreateTask } from "../../../hooks/use-tasks";
import type { Task } from "../../../hooks/use-tasks";

interface QuickAddBarProps {
  projectId: string;
  onCommit: (task: Task) => void;
  onCancel: () => void;
  nextId: string;
}

const PRIORITY_TONE: Record<string, "bad" | "warn" | "info"> = {
  p0: "bad",
  p1: "bad",
  p2: "warn",
  p3: "info",
};

const ALL_FIELDS = ["priority", "points", "module", "assignee", "status"];

export function QuickAddBar({ projectId, onCommit, onCancel, nextId }: QuickAddBarProps) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<{
    title?: string;
    priority?: string;
    points?: number;
    module?: string;
    assignee?: string;
    status?: string;
  }>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parseNL = useParseNL(projectId);
  const createTask = useCreateTask(projectId);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      setText(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!value.trim()) {
        setParsed({});
        return;
      }
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await parseNL.mutateAsync({ text: value });
          setParsed((res as any).parsed ?? {});
        } catch {
          // ignore parse errors
        }
      }, 350);
    },
    [parseNL],
  );

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const title = (parsed.title ?? text).trim();
        if (!title) return;
        try {
          const result = await createTask.mutateAsync({
            title,
            status: (parsed.status as Task["status"]) ?? "planned",
            priority: (parsed.priority as Task["priority"]) ?? "p2",
            points: parsed.points ?? 0,
          });
          onCommit((result as any).task);
        } catch {
          // keep bar open on error
        }
      }
    },
    [text, parsed, nextId, createTask, onCommit, onCancel],
  );

  const detectedFields = ALL_FIELDS.filter((f) => parsed[f as keyof typeof parsed] !== undefined);
  const missingFields = ALL_FIELDS.filter((f) => parsed[f as keyof typeof parsed] === undefined);

  return (
    <div
      style={{
        border: "1px solid var(--accent-2)",
        borderRadius: "var(--r-md)",
        background: "color-mix(in srgb, var(--accent-2) 6%, var(--bg-1))",
        padding: "var(--s-4) var(--s-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-3)",
      }}
    >
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="try: retry policy for stream cancel, M-04, p1, ~3pts, @r.chen"
        disabled={createTask.isPending}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          outline: "none",
          fontSize: 13,
          color: "var(--fg)",
          fontFamily: "var(--font-sans)",
          padding: 0,
        }}
      />

      {/* Parsed chips */}
      {text.trim() && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", flexWrap: "wrap" }}>
          {parsed.priority && (
            <Chip tone={PRIORITY_TONE[parsed.priority] ?? "info"}>
              {parsed.priority.toUpperCase()}
            </Chip>
          )}
          {parsed.points !== undefined && (
            <Chip tone="default">~{parsed.points}pts</Chip>
          )}
          {parsed.module && (
            <Chip tone="ai">{parsed.module}</Chip>
          )}
          {parsed.assignee && (
            <Chip tone="info">@{parsed.assignee}</Chip>
          )}
          {parsed.status && (
            <Chip tone="ok">{parsed.status}</Chip>
          )}

          {missingFields.length > 0 && detectedFields.length > 0 && (
            <span
              className="mono dim"
              style={{ fontSize: 10.5, marginLeft: "var(--s-2)" }}
            >
              missing: {missingFields.join(", ")}
            </span>
          )}
        </div>
      )}

      {/* Hints */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s-4)" }}>
        <span className="mono dim" style={{ fontSize: 10.5 }}>
          <span className="kbd">Enter</span> commit &nbsp;
          <span className="kbd">Esc</span> cancel
        </span>
        {createTask.isError && (
          <span style={{ fontSize: 11, color: "var(--accent-5)" }}>
            Failed to create task. Try again.
          </span>
        )}
        {createTask.isPending && (
          <span className="mono dim" style={{ fontSize: 11 }}>
            Creating…
          </span>
        )}
      </div>
    </div>
  );
}
