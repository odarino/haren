import React, { useRef, useEffect } from "react";
import { IconSend, IconBolt } from "@tabler/icons-react";

const SUGGESTION_CHIPS = [
  "summarize progress",
  "what tasks are blocked?",
  "draft next iteration",
  "what did agent do today?",
];

interface ComposerProps {
  onSend: (text: string) => void;
  streaming: boolean;
  disabled: boolean;
  draft: string;
  onDraftChange: (text: string) => void;
}

export function Composer({ onSend, streaming, disabled, draft, onDraftChange }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDisabled = disabled || streaming;

  const handleSend = () => {
    const text = draft.trim();
    if (!text || isDisabled) return;
    onSend(text);
    onDraftChange("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChip = (suggestion: string) => {
    if (isDisabled) return;
    onSend(suggestion);
  };

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  return (
    <div>
      {/* Suggestion chips */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        {SUGGESTION_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => handleChip(chip)}
            disabled={isDisabled}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 10px",
              borderRadius: 99,
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              color: isDisabled ? "var(--text-muted)" : "var(--text-secondary)",
              fontSize: 11,
              cursor: isDisabled ? "not-allowed" : "pointer",
              opacity: isDisabled ? 0.5 : 1,
              transition: "all 0.12s",
            }}
          >
            <IconBolt size={10} />
            {chip}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "6px 8px",
        }}
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            streaming
              ? "Agent is working..."
              : disabled
                ? "Agent offline — run 'haren agent start' to connect"
                : "Send a message… (Enter to send, Shift+Enter for newline)"
          }
          disabled={isDisabled}
          rows={1}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text-primary)",
            fontSize: 13,
            lineHeight: 1.6,
            resize: "none",
            fontFamily: "inherit",
            minHeight: 24,
            maxHeight: 120,
            overflow: "auto",
            opacity: isDisabled ? 0.6 : 1,
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={isDisabled || !draft.trim()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "none",
            background:
              !isDisabled && draft.trim()
                ? "var(--accent, #3b82f6)"
                : "var(--bg-tertiary, #374151)",
            color: !isDisabled && draft.trim() ? "#fff" : "var(--text-muted)",
            cursor: !isDisabled && draft.trim() ? "pointer" : "not-allowed",
            flexShrink: 0,
            transition: "background 0.12s",
          }}
        >
          <IconSend size={15} />
        </button>
      </div>
    </div>
  );
}
