import React, { useState, useMemo } from "react";
import { IconX, IconRobot, IconCheck } from "@tabler/icons-react";
import { useTasks } from "../../../hooks/use-tasks";
import type { Iteration } from "../../../hooks/use-iterations";
import type { Task } from "../../../hooks/use-tasks";

interface Module {
  id: string;
  code: string;
  name: string;
}

interface PlanIterationInput {
  code: string;
  label: string;
  start_date: string;
  end_date: string;
  scope: number;
  notes: string;
  task_ids: string[];
}

interface PlanIterationModalProps {
  projectId: string;
  existingIters: Iteration[];
  modules: Module[];
  onClose: () => void;
  onSave: (input: PlanIterationInput) => void;
}

function nextIterCode(existingIters: Iteration[]): string {
  const codes = existingIters.map((it) => it.code);
  const nums = codes
    .map((c) => parseInt(c.replace(/\D/g, ""), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `IT-${String(next).padStart(2, "0")}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const CARRYOVER_STATUSES: Task["status"][] = ["doing", "review", "blocked"];

export function PlanIterationModal({
  projectId,
  existingIters,
  modules,
  onClose,
  onSave,
}: PlanIterationModalProps) {
  const { data: allTasks = [] } = useTasks(projectId);

  const defaultCode = nextIterCode(existingIters);
  const today = new Date();
  const twoWeeks = new Date(today.getTime() + 14 * 86_400_000);

  const [code, setCode] = useState(defaultCode);
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState(isoDate(today));
  const [endDate, setEndDate] = useState(isoDate(twoWeeks));
  const [scope, setScope] = useState(20);
  const [notes, setNotes] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string | null>(null);

  // Agent-picked: carryover statuses + p1 backlog
  const agentPickedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of allTasks) {
      if (CARRYOVER_STATUSES.includes(t.status)) ids.add(t.id);
      if (t.priority === "p1" && t.status === "backlog") ids.add(t.id);
    }
    return ids;
  }, [allTasks]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(agentPickedIds));

  const selectedPts = useMemo(() => {
    return allTasks
      .filter((t) => selectedIds.has(t.id))
      .reduce((sum, t) => sum + (t.points ?? 0), 0);
  }, [allTasks, selectedIds]);

  const displayedTasks = useMemo(() => {
    const eligible = allTasks.filter(
      (t) => t.status !== "done" && t.status !== "cancelled",
    );
    if (!moduleFilter) return eligible;
    return eligible.filter((t) => t.module_id === moduleFilter);
  }, [allTasks, moduleFilter]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave() {
    onSave({
      code,
      label,
      start_date: startDate,
      end_date: endDate,
      scope,
      notes,
      task_ids: Array.from(selectedIds),
    });
  }

  const capacityPct = Math.min((selectedPts / Math.max(scope, 1)) * 100, 100);
  const capacityColor =
    capacityPct > 100
      ? "var(--accent-5)"
      : capacityPct > 85
        ? "var(--accent-2)"
        : "var(--accent-3)";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in srgb, var(--bg-0) 60%, transparent)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="panel"
        style={{
          width: "min(720px, 95vw)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div className="panel-h" style={{ justifyContent: "space-between" }}>
          <span className="ttl">Plan Iteration</span>
          <button type="button" className="btn" data-variant="ghost" onClick={onClose} aria-label="Close">
            <IconX size={14} />
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "var(--s-6)" }}>
          {/* Agent rationale */}
          <div
            style={{
              padding: "var(--s-5)",
              border: "1px solid var(--accent-4)",
              borderRadius: "var(--r-md)",
              background: "color-mix(in srgb, var(--accent-4) 8%, transparent)",
              marginBottom: "var(--s-6)",
              fontSize: 12,
              color: "var(--fg-2)",
              lineHeight: 1.6,
            }}
          >
            <div className="row" style={{ marginBottom: "var(--s-3)" }}>
              <IconRobot size={14} style={{ color: "var(--accent-4)" }} />
              <strong style={{ color: "var(--accent-4)", fontSize: 11 }}>Agent draft logic</strong>
            </div>
            Pre-selected tasks include all in-progress / blocked / review carryover items, plus
            P1-priority backlog tasks. Adjust capacity target and deselect anything not ready to
            commit. Items marked with a robot icon were agent-picked.
          </div>

          {/* Form fields */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "var(--s-5)",
              marginBottom: "var(--s-6)",
            }}
          >
            <div className="col" style={{ gap: "var(--s-2)" }}>
              <label style={{ fontSize: 11, color: "var(--fg-3)" }}>Code</label>
              <input
                className="btn"
                style={{ background: "var(--bg-2)", color: "var(--fg)", textAlign: "left", height: 32 }}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="col" style={{ gap: "var(--s-2)" }}>
              <label style={{ fontSize: 11, color: "var(--fg-3)" }}>Label</label>
              <input
                className="btn"
                style={{ background: "var(--bg-2)", color: "var(--fg)", textAlign: "left", height: 32 }}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Auth + Onboarding"
              />
            </div>
            <div className="col" style={{ gap: "var(--s-2)" }}>
              <label style={{ fontSize: 11, color: "var(--fg-3)" }}>Start date</label>
              <input
                type="date"
                className="btn"
                style={{ background: "var(--bg-2)", color: "var(--fg)", textAlign: "left", height: 32 }}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="col" style={{ gap: "var(--s-2)" }}>
              <label style={{ fontSize: 11, color: "var(--fg-3)" }}>End date</label>
              <input
                type="date"
                className="btn"
                style={{ background: "var(--bg-2)", color: "var(--fg)", textAlign: "left", height: 32 }}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="col" style={{ gap: "var(--s-2)" }}>
              <label style={{ fontSize: 11, color: "var(--fg-3)" }}>Capacity target (pts)</label>
              <input
                type="number"
                min={1}
                className="btn"
                style={{ background: "var(--bg-2)", color: "var(--fg)", textAlign: "left", height: 32 }}
                value={scope}
                onChange={(e) => setScope(Number(e.target.value))}
              />
            </div>
            <div className="col" style={{ gap: "var(--s-2)" }}>
              <label style={{ fontSize: 11, color: "var(--fg-3)" }}>Notes</label>
              <input
                className="btn"
                style={{ background: "var(--bg-2)", color: "var(--fg)", textAlign: "left", height: 32 }}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes…"
              />
            </div>
          </div>

          {/* Story picker */}
          <div style={{ marginBottom: "var(--s-5)" }}>
            <div className="row" style={{ marginBottom: "var(--s-4)" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-2)" }}>
                Story picker
              </span>
              <div className="spacer" />
              {/* Module filter chips */}
              <button
                type="button"
                className="chip"
                data-tone={moduleFilter === null ? "info" : undefined}
                onClick={() => setModuleFilter(null)}
              >
                All
              </button>
              {modules.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="chip"
                  data-tone={moduleFilter === m.id ? "info" : undefined}
                  onClick={() => setModuleFilter(m.id)}
                >
                  {m.code}
                </button>
              ))}
            </div>

            {/* Capacity meter (sticky-ish) */}
            <div
              style={{
                padding: "var(--s-3) var(--s-5)",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--line)",
                background: "var(--bg-1)",
                marginBottom: "var(--s-4)",
              }}
            >
              <div className="row" style={{ marginBottom: "var(--s-2)" }}>
                <span style={{ fontSize: 11, color: "var(--fg-3)" }}>
                  {selectedIds.size} tasks · {selectedPts} / {scope} pts
                </span>
                <div className="spacer" />
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: capacityColor,
                  }}
                >
                  {Math.round(capacityPct)}%
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: "var(--bg-2)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${capacityPct}%`,
                    background: capacityColor,
                    borderRadius: 3,
                    transition: "width 0.2s var(--ease)",
                  }}
                />
              </div>
            </div>

            {/* Task rows */}
            <div
              className="panel"
              style={{ maxHeight: 280, overflowY: "auto" }}
            >
              {displayedTasks.length === 0 ? (
                <div style={{ padding: "var(--s-6)", textAlign: "center", color: "var(--fg-4)", fontSize: 13 }}>
                  No eligible tasks
                </div>
              ) : (
                displayedTasks.map((task) => {
                  const checked = selectedIds.has(task.id);
                  const agentPicked = agentPickedIds.has(task.id);
                  return (
                    <div
                      key={task.id}
                      className="row"
                      style={{
                        padding: "var(--s-3) var(--s-5)",
                        borderBottom: "1px solid var(--line)",
                        cursor: "pointer",
                        background: checked
                          ? "color-mix(in srgb, var(--accent-1) 5%, transparent)"
                          : "transparent",
                      }}
                      onClick={() => toggle(task.id)}
                    >
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 3,
                          border: `1.5px solid ${checked ? "var(--accent-1)" : "var(--line-2)"}`,
                          background: checked ? "var(--accent-1)" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {checked && <IconCheck size={10} color="white" />}
                      </div>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10.5,
                          color: "var(--fg-4)",
                          minWidth: 52,
                        }}
                      >
                        {task.code}
                      </span>
                      <span style={{ flex: 1, fontSize: 12, color: "var(--fg-2)" }}>
                        {task.title}
                      </span>
                      {agentPicked && (
                        <IconRobot size={12} style={{ color: "var(--accent-4)", opacity: 0.7 }} />
                      )}
                      <span
                        className="chip"
                        style={{ marginLeft: "var(--s-2)" }}
                      >
                        {task.priority}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10.5,
                          color: "var(--fg-3)",
                          minWidth: 24,
                          textAlign: "right",
                        }}
                      >
                        {task.points}p
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="row"
          style={{
            padding: "var(--s-5) var(--s-6)",
            borderTop: "1px solid var(--line)",
            justifyContent: "flex-end",
          }}
        >
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            data-variant="primary"
            onClick={handleSave}
            disabled={!code || !startDate || !endDate}
          >
            Create iteration
          </button>
        </div>
      </div>
    </div>
  );
}
