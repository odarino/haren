import React, { useState, useMemo } from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconTargetArrow,
  IconPlus,
} from "@tabler/icons-react";
import { useIterations, useIteration, useCreateIteration } from "../../../hooks/use-iterations";
import { useTasks } from "../../../hooks/use-tasks";
import { useModules } from "../../../hooks/use-modules";
import { StatusPill } from "../../shared/StatusPill";
import { EmptyState } from "../../shared/EmptyState";
import { Gantt } from "./Gantt";
import { IterBurnup } from "./IterBurnup";
import { PlanIterationModal } from "./PlanIterationModal";

interface IterationsViewProps {
  projectId: string;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ModuleMixBar({
  tasks,
  modules,
}: {
  tasks: { module_id: string | null; points: number }[];
  modules: { id: string; code: string }[];
}) {
  const total = tasks.reduce((s, t) => s + (t.points ?? 0), 0) || 1;
  const byModule: Record<string, number> = {};
  for (const t of tasks) {
    const key = t.module_id ?? "__none__";
    byModule[key] = (byModule[key] ?? 0) + (t.points ?? 0);
  }

  const COLORS = [
    "var(--accent-1)",
    "var(--accent-2)",
    "var(--accent-3)",
    "var(--accent-4)",
    "var(--accent-5)",
  ];

  const segments = Object.entries(byModule).map(([key, pts], i) => {
    const mod = modules.find((m) => m.id === key);
    return {
      key,
      label: mod?.code ?? "—",
      pct: (pts / total) * 100,
      color: COLORS[i % COLORS.length],
    };
  });

  return (
    <div>
      <div
        style={{
          height: 8,
          borderRadius: 4,
          overflow: "hidden",
          display: "flex",
          background: "var(--bg-2)",
        }}
      >
        {segments.map((s) => (
          <div
            key={s.key}
            style={{ width: `${s.pct}%`, background: s.color, height: "100%" }}
            title={`${s.label}: ${Math.round(s.pct)}%`}
          />
        ))}
      </div>
      <div className="row" style={{ gap: "var(--s-4)", marginTop: "var(--s-2)", flexWrap: "wrap" }}>
        {segments.map((s) => (
          <div key={s.key} className="row" style={{ gap: "var(--s-1)" }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: s.color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 10.5, color: "var(--fg-4)", fontFamily: "var(--font-mono)" }}>
              {s.label} {Math.round(s.pct)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function IterationsView({ projectId }: IterationsViewProps) {
  const { data: iterations = [], isLoading } = useIterations(projectId);
  const { data: modules = [] } = useModules(projectId);
  const createIteration = useCreateIteration(projectId);

  // Determine current (active) iteration index
  const currentIndex = useMemo(() => {
    const idx = iterations.findIndex((it) => it.status === "active");
    return idx >= 0 ? idx : iterations.length - 1;
  }, [iterations]);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const effectiveIndex =
    selectedIndex !== null
      ? selectedIndex
      : currentIndex >= 0
        ? currentIndex
        : 0;

  const selectedIteration = iterations[effectiveIndex] ?? null;

  const { data: iterDetail } = useIteration(selectedIteration?.id);
  const { data: iterTasks = [] } = useTasks(
    projectId,
    selectedIteration ? { module: undefined } : undefined,
  );

  // Filter tasks committed to selected iteration
  const committedTasks = useMemo(() => {
    if (!selectedIteration) return [];
    return iterTasks.filter((t) => t.iteration_id === selectedIteration.id);
  }, [iterTasks, selectedIteration]);

  function jumpToCurrent() {
    setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);
  }

  function handlePrev() {
    setSelectedIndex(Math.max(0, effectiveIndex - 1));
  }

  function handleNext() {
    setSelectedIndex(Math.min(iterations.length - 1, effectiveIndex + 1));
  }

  async function handlePlanSave(input: {
    code: string;
    label: string;
    start_date: string;
    end_date: string;
    scope: number;
    notes: string;
    task_ids: string[];
  }) {
    await createIteration.mutateAsync(input);
    setPlanOpen(false);
  }

  if (isLoading) {
    return (
      <div className="view-body" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
        <span className="mono muted" style={{ fontSize: 13 }}>Loading iterations…</span>
      </div>
    );
  }

  return (
    <div>
      {/* View header */}
      <div className="view-head">
        <h1>Iterations</h1>
        <div className="spacer" />
        <button type="button" className="btn" onClick={jumpToCurrent} title="Jump to current iteration">
          <IconTargetArrow size={14} />
          Current
        </button>
        <button
          type="button"
          className="btn"
          data-variant="primary"
          onClick={() => setPlanOpen(true)}
        >
          <IconPlus size={14} />
          Plan iteration
        </button>
      </div>

      <div className="view-body" style={{ display: "flex", flexDirection: "column", gap: "var(--s-7)" }}>
        {iterations.length === 0 ? (
          <EmptyState message="No iterations yet. Click 'Plan iteration' to create your first sprint." />
        ) : (
          <>
            {/* Gantt timeline */}
            <Gantt
              iterations={iterations}
              selected={selectedIteration?.id ?? ""}
              onSelect={(id) => {
                const idx = iterations.findIndex((it) => it.id === id);
                if (idx >= 0) setSelectedIndex(idx);
              }}
            />

            {/* Navigation row */}
            <div className="row" style={{ gap: "var(--s-3)" }}>
              <button
                type="button"
                className="btn"
                data-variant="ghost"
                onClick={handlePrev}
                disabled={effectiveIndex === 0}
                aria-label="Previous iteration"
              >
                <IconChevronLeft size={14} />
              </button>

              {/* Dropdown */}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setDropdownOpen((v) => !v)}
                  style={{ minWidth: 140 }}
                >
                  {selectedIteration
                    ? `${selectedIteration.code} — ${selectedIteration.label || "Untitled"}`
                    : "Select iteration"}
                  <IconChevronDown size={12} />
                </button>
                {dropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      zIndex: 100,
                      background: "var(--bg-1)",
                      border: "1px solid var(--line)",
                      borderRadius: "var(--r-md)",
                      minWidth: 200,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                      maxHeight: 220,
                      overflowY: "auto",
                    }}
                  >
                    {iterations.map((it, i) => (
                      <div
                        key={it.id}
                        style={{
                          padding: "var(--s-3) var(--s-5)",
                          cursor: "pointer",
                          fontSize: 13,
                          color: i === effectiveIndex ? "var(--fg)" : "var(--fg-2)",
                          background:
                            i === effectiveIndex
                              ? "color-mix(in srgb, var(--accent-1) 10%, transparent)"
                              : "transparent",
                        }}
                        onClick={() => {
                          setSelectedIndex(i);
                          setDropdownOpen(false);
                        }}
                      >
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, marginRight: 8, color: "var(--fg-4)" }}>
                          {it.code}
                        </span>
                        {it.label || "Untitled"}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                className="btn"
                data-variant="ghost"
                onClick={handleNext}
                disabled={effectiveIndex >= iterations.length - 1}
                aria-label="Next iteration"
              >
                <IconChevronRight size={14} />
              </button>
            </div>

            {selectedIteration && (
              <>
                {/* Two-column: detail + burnup */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "var(--gap)",
                    alignItems: "start",
                  }}
                >
                  {/* Iteration detail card */}
                  <div className="panel">
                    <div className="panel-h" style={{ justifyContent: "space-between" }}>
                      <span className="ttl">{selectedIteration.code}</span>
                      <StatusPill status={selectedIteration.status} />
                    </div>
                    <div style={{ padding: "var(--s-5)", display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
                      {/* KV rows */}
                      {[
                        { label: "Label", value: selectedIteration.label || "—" },
                        { label: "Start", value: formatDate(selectedIteration.start_date) },
                        { label: "End", value: formatDate(selectedIteration.end_date) },
                        { label: "Scope", value: `${selectedIteration.scope} pts` },
                        { label: "Velocity", value: `${selectedIteration.velocity}/day` },
                      ].map(({ label, value }) => (
                        <div key={label} className="row" style={{ justifyContent: "space-between" }}>
                          <span style={{ fontSize: 11, color: "var(--fg-4)" }}>{label}</span>
                          <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--fg-2)" }}>
                            {value}
                          </span>
                        </div>
                      ))}

                      {selectedIteration.notes && (
                        <div
                          style={{
                            marginTop: "var(--s-2)",
                            fontSize: 12,
                            color: "var(--fg-3)",
                            lineHeight: 1.5,
                          }}
                        >
                          {selectedIteration.notes}
                        </div>
                      )}

                      {/* Module mix bar */}
                      {committedTasks.length > 0 && (
                        <div style={{ marginTop: "var(--s-2)" }}>
                          <div style={{ fontSize: 11, color: "var(--fg-4)", marginBottom: "var(--s-2)" }}>
                            Module mix
                          </div>
                          <ModuleMixBar tasks={committedTasks} modules={modules} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Burnup */}
                  {iterDetail ? (
                    <IterBurnup
                      burnup={iterDetail.burnup}
                      iteration={iterDetail.iteration}
                    />
                  ) : (
                    <div className="panel" style={{ padding: "var(--s-7)", textAlign: "center", color: "var(--fg-4)", fontSize: 13 }}>
                      Loading burnup…
                    </div>
                  )}
                </div>

                {/* Committed tasks table */}
                <div className="panel" style={{ overflow: "hidden" }}>
                  <div className="panel-h">
                    <span className="ttl">Committed tasks</span>
                    <span className="meta">{committedTasks.length} tasks</span>
                  </div>
                  {committedTasks.length === 0 ? (
                    <div style={{ padding: "var(--s-6)", textAlign: "center", color: "var(--fg-4)", fontSize: 13 }}>
                      No tasks committed to this iteration yet
                    </div>
                  ) : (
                    <div>
                      {/* Header row */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "80px 1fr 100px 80px 60px",
                          padding: "var(--s-3) var(--s-5)",
                          fontSize: 10.5,
                          color: "var(--fg-4)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          borderBottom: "1px solid var(--line)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        <span>Code</span>
                        <span>Title</span>
                        <span>Status</span>
                        <span>Priority</span>
                        <span style={{ textAlign: "right" }}>Pts</span>
                      </div>
                      {committedTasks.map((task) => (
                        <div
                          key={task.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "80px 1fr 100px 80px 60px",
                            padding: "var(--s-3) var(--s-5)",
                            fontSize: 12,
                            borderBottom: "1px solid var(--line)",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 10.5,
                              color: "var(--fg-4)",
                            }}
                          >
                            {task.code}
                          </span>
                          <span style={{ color: "var(--fg-2)" }}>{task.title}</span>
                          <StatusPill status={task.status} />
                          <span
                            className="chip"
                            style={{ width: "fit-content" }}
                          >
                            {task.priority}
                          </span>
                          <span
                            style={{
                              textAlign: "right",
                              fontFamily: "var(--font-mono)",
                              fontSize: 11,
                              color: "var(--fg-3)",
                            }}
                          >
                            {task.points}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {planOpen && (
        <PlanIterationModal
          projectId={projectId}
          existingIters={iterations}
          modules={modules}
          onClose={() => setPlanOpen(false)}
          onSave={handlePlanSave}
        />
      )}
    </div>
  );
}
