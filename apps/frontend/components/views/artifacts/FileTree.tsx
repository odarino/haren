import React from "react";
import { IconFile, IconFolder } from "@tabler/icons-react";
import type { ArtifactSummary } from "../../../hooks/use-artifacts";

interface FileTreeProps {
  artifacts: ArtifactSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const KIND_ORDER = ["spec", "rfc", "note", "runbook", "report"] as const;

const KIND_LABELS: Record<string, string> = {
  spec: "Specs",
  rfc: "RFCs",
  note: "Notes",
  runbook: "Runbooks",
  report: "Reports",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function dirname(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

export function FileTree({ artifacts, selectedId, onSelect }: FileTreeProps) {
  const grouped = KIND_ORDER.reduce<Record<string, ArtifactSummary[]>>((acc, kind) => {
    acc[kind] = artifacts.filter((a) => a.kind === kind);
    return acc;
  }, {});

  // Include kinds not in KIND_ORDER
  for (const artifact of artifacts) {
    if (!KIND_ORDER.includes(artifact.kind as (typeof KIND_ORDER)[number])) {
      grouped[artifact.kind] = grouped[artifact.kind] ?? [];
      grouped[artifact.kind].push(artifact);
    }
  }

  return (
    <div style={{ overflowY: "auto", height: "100%" }}>
      {KIND_ORDER.map((kind) => {
        const items = grouped[kind];
        if (!items || items.length === 0) return null;

        return (
          <div key={kind} style={{ marginBottom: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-muted)",
              }}
            >
              <IconFolder size={13} />
              {KIND_LABELS[kind] ?? kind}
            </div>

            {items.map((artifact) => {
              const isSelected = artifact.id === selectedId;
              const name = basename(artifact.path);
              const prefix = dirname(artifact.path);

              return (
                <div
                  key={artifact.id}
                  onClick={() => onSelect(artifact.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 10px 5px 22px",
                    cursor: "pointer",
                    borderRadius: 4,
                    background: isSelected ? "var(--accent, #5b8dee)22" : "transparent",
                    borderLeft: isSelected ? "2px solid var(--accent, #5b8dee)" : "2px solid transparent",
                  }}
                >
                  <IconFile
                    size={14}
                    style={{ flexShrink: 0, color: isSelected ? "var(--accent, #5b8dee)" : "var(--text-muted)" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                        fontWeight: isSelected ? 500 : 400,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {name}
                    </div>
                    {prefix && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {prefix}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      flexShrink: 0,
                    }}
                  >
                    {formatBytes(artifact.size_bytes)}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
