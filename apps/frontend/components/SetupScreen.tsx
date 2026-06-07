import React, { useState } from "react";

interface SetupScreenProps {
  onJoin: (teamCode: string, userName: string) => void;
  onCreate: (teamName: string, userName: string) => void;
  error: string | null;
}

export function SetupScreen({ onJoin, onCreate, error }: SetupScreenProps) {
  const [mode, setMode] = useState<"join" | "create">("join");
  const [teamCode, setTeamCode] = useState("");
  const [teamName, setTeamName] = useState("");
  const [userName, setUserName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "join") {
      onJoin(teamCode.trim(), userName.trim());
    } else {
      onCreate(teamName.trim(), userName.trim());
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--bg-primary)",
      }}
    >
      <div
        style={{
          background: "var(--bg-secondary)",
          borderRadius: 12,
          padding: 32,
          width: 400,
        }}
      >
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>Haren Portal</h1>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: 14,
            marginBottom: 24,
          }}
        >
          Join or create a team to get started
        </p>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 20,
          }}
        >
          <button
            type="button"
            onClick={() => setMode("join")}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: mode === "join" ? "var(--bg-tertiary)" : "transparent",
              color: mode === "join" ? "var(--text-primary)" : "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Join Team
          </button>
          <button
            type="button"
            onClick={() => setMode("create")}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: mode === "create" ? "var(--bg-tertiary)" : "transparent",
              color: mode === "create" ? "var(--text-primary)" : "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Create Team
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Your Name
            </label>
            <input
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="e.g. Phung"
              required
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                fontSize: 14,
              }}
            />
          </div>

          {mode === "join" ? (
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Team Code
              </label>
              <input
                value={teamCode}
                onChange={(e) => setTeamCode(e.target.value.toUpperCase())}
                placeholder="e.g. PM2RYL"
                required
                maxLength={6}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  fontSize: 14,
                  letterSpacing: 2,
                  fontFamily: "monospace",
                }}
              />
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Team Name
              </label>
              <input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. GS Garage"
                required
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  fontSize: 14,
                }}
              />
            </div>
          )}

          {error && (
            <div
              style={{
                color: "var(--danger)",
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            style={{
              width: "100%",
              padding: "10px 0",
              borderRadius: 6,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              marginTop: 8,
            }}
          >
            {mode === "join" ? "Join Team" : "Create Team"}
          </button>
        </form>
      </div>
    </div>
  );
}
