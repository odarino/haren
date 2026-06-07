import React, { useState } from "react";
import { useArtifacts, useArtifact } from "../../../hooks/use-artifacts";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
import { FileTree } from "./FileTree";
import { MarkdownRenderer } from "../../shared/MarkdownRenderer";
import { EmptyState } from "../../shared/EmptyState";

interface ArtifactsViewProps {
  projectId: string;
}

export function ArtifactsView({ projectId }: ArtifactsViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: artifacts, isLoading: listLoading } = useArtifacts(projectId);
  const { data: artifact, isLoading: contentLoading } = useArtifact(selectedId);

  if (listLoading) {
    return (
      <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 14 }}>
        Loading artifacts...
      </div>
    );
  }

  if (!artifacts || artifacts.length === 0) {
    return <EmptyState message="No artifacts found. Run discovery to create initial artifacts." />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Project</span>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Artifacts
        </span>
      </div>

      {/* Split layout */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* File tree sidebar */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            background: "var(--bg-secondary)",
            padding: "8px 0",
            overflowY: "auto",
          }}
        >
          <FileTree
            artifacts={artifacts}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        {/* Content panel */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 24,
            background: "var(--bg-primary)",
          }}
        >
          {!selectedId && (
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: 14,
                fontStyle: "italic",
                marginTop: 48,
                textAlign: "center",
              }}
            >
              Select a file to view its contents
            </div>
          )}

          {selectedId && contentLoading && (
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: 14,
                marginTop: 48,
                textAlign: "center",
              }}
            >
              Loading...
            </div>
          )}

          {selectedId && !contentLoading && artifact && (
            <div>
              {/* Artifact metadata header */}
              <div
                style={{
                  marginBottom: 16,
                  padding: "10px 14px",
                  background: "var(--bg-secondary)",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    fontFamily: "monospace",
                  }}
                >
                  {artifact.path}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 12,
                    background: "var(--accent, #5b8dee)22",
                    color: "var(--accent, #5b8dee)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {artifact.kind}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {formatBytes(artifact.size_bytes)}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Updated {new Date(artifact.updated_at).toLocaleDateString()}
                </span>
              </div>
              <MarkdownRenderer content={artifact.body} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
