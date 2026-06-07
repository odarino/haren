import React from "react";
import { IconFilter, IconPlus, IconArrowsSort } from "@tabler/icons-react";
import { KPI } from "../../shared/KPI";
import { EmptyState } from "../../shared/EmptyState";
import { useProgress } from "../../../hooks/use-progress";
import { ModuleCard } from "./ModuleCard";
import { Burnup } from "./Burnup";

interface ProgressViewProps {
  projectId: string;
}

export function ProgressView({ projectId }: ProgressViewProps) {
  const { data, isLoading, error } = useProgress(projectId);

  if (isLoading) {
    return (
      <div className="view-body" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
        <span className="mono muted" style={{ fontSize: 13 }}>Loading progress…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="view-body">
        <EmptyState message="Could not load progress data. Check that the backend is running." />
      </div>
    );
  }

  const { totalTasks, doneTasks, blockedTasks, overallPercent, activeIteration, moduleStats } = data;

  const velocityLabel = activeIteration
    ? `${activeIteration.velocity}/day`
    : "—";

  const iterationLabel = activeIteration
    ? `${activeIteration.code}: ${activeIteration.label}`
    : "None active";

  // Compute days elapsed for burnup
  let daysElapsed = 0;
  let totalDays = 14;
  if (activeIteration) {
    const start = new Date(activeIteration.start_date).getTime();
    const end = new Date(activeIteration.end_date).getTime();
    const now = Date.now();
    totalDays = Math.max(1, Math.round((end - start) / 86_400_000));
    daysElapsed = Math.max(0, Math.round((now - start) / 86_400_000));
  }

  return (
    <div>
      {/* View header */}
      <div className="view-head">
        <h1>Progress</h1>
        <div className="spacer" />
        <button type="button" className="btn" aria-label="Filter modules">
          <IconFilter size={14} />
          Filter
        </button>
        <button type="button" className="btn" aria-label="Sort modules">
          <IconArrowsSort size={14} />
          Sort
        </button>
        <button type="button" className="btn" data-variant="primary" aria-label="Add module">
          <IconPlus size={14} />
          Module
        </button>
      </div>

      <div className="view-body" style={{ display: "flex", flexDirection: "column", gap: "var(--s-7)" }}>
        {/* KPI strip */}
        <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
          <KPI
            label="Overall"
            value={`${Math.round(overallPercent)}%`}
            sub={`${doneTasks} / ${totalTasks} tasks`}
            tone={overallPercent >= 75 ? "ok" : overallPercent >= 40 ? "warn" : "info"}
            bar={overallPercent}
          />
          <KPI
            label="Open blockers"
            value={blockedTasks}
            sub="tasks blocked"
            tone={blockedTasks === 0 ? "ok" : blockedTasks <= 3 ? "warn" : "bad"}
          />
          <KPI
            label="Active iteration"
            value={activeIteration ? activeIteration.code : "—"}
            sub={iterationLabel}
            tone={activeIteration ? "info" : "warn"}
          />
          <KPI
            label="Velocity"
            value={velocityLabel}
            sub={activeIteration ? `scope ${activeIteration.scope}` : "no iteration"}
            tone={activeIteration ? "ok" : "warn"}
          />
        </div>

        {/* Module cards grid */}
        {moduleStats.length === 0 ? (
          <EmptyState message="No modules found. Add a module to start tracking progress." />
        ) : (
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: "var(--s-4)", color: "var(--fg-3)" }}>
              Modules ({moduleStats.length})
            </h2>
            <div className="cards">
              {moduleStats.map((m) => (
                <ModuleCard key={m.id} {...m} />
              ))}
            </div>
          </div>
        )}

        {/* Burnup chart — only when active iteration exists */}
        {activeIteration && (
          <Burnup
            scope={activeIteration.scope}
            velocity={activeIteration.velocity}
            daysElapsed={daysElapsed}
            totalDays={totalDays}
          />
        )}
      </div>
    </div>
  );
}
