import { AlertCircle, Check, CheckCheck, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ChatMessage } from "@/types/models";
import { formatTime } from "@/utils/format";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "👀"];

export function MessageBubble({
  message,
  onReact,
  onEdit,
  onDelete,
}: {
  message: ChatMessage;
  onReact?: (emoji: string) => void;
  onEdit?: (text: string) => void;
  onDelete?: () => void;
}) {
  const out = message.direction === "out";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const deleted = Boolean(message.deletedAt) || message.kind === "delete";

  if (message.kind === "reaction") {
    return (
      <div
        className="muted"
        style={{
          fontSize: 12,
          textAlign: out ? "right" : "left",
          marginBottom: 4,
          padding: "0 8px",
        }}
      >
        {out ? "You" : "Peer"} reacted {message.reaction} to a message
      </div>
    );
  }

  return (
    <div
      className={`row-flex ${out ? "" : "row-flex--gap-2"}`}
      style={{
        justifyContent: out ? "flex-end" : "flex-start",
        marginBottom: 6,
      }}
    >
      {!out && <div style={{ width: 28, flexShrink: 0 }} />}
      <div
        className="stack"
        style={{
          maxWidth: "76%",
          padding: "8px 12px",
          borderRadius: 16,
          background: out ? "var(--primary)" : "var(--bg-elev-2)",
          color: out ? "var(--primary-fg)" : "var(--text)",
          border: out ? "none" : "1px solid var(--border)",
          borderBottomRightRadius: out ? 5 : 16,
          borderBottomLeftRadius: out ? 16 : 5,
          opacity: deleted ? 0.55 : 1,
        }}
      >
        {editing ? (
          <div className="stack stack--gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ fontSize: 14 }}
            />
            <div className="row-flex" style={{ gap: 6 }}>
              <button
                className="btn btn--sm btn--secondary"
                type="button"
                onClick={() => {
                  onEdit?.(draft);
                  setEditing(false);
                }}
              >
                Save
              </button>
              <button
                className="btn btn--sm btn--ghost"
                type="button"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <span
            style={{
              fontSize: 14.5,
              lineHeight: 1.4,
              wordBreak: "break-word",
              fontStyle: deleted ? "italic" : undefined,
            }}
          >
            {deleted ? "Message deleted" : message.text}
          </span>
        )}
        <div
          className="row-flex"
          style={{ gap: 4, justifyContent: "flex-end", marginTop: 2 }}
        >
          {message.editedAt && !deleted && (
            <span style={{ fontSize: 10, opacity: 0.7 }}>edited</span>
          )}
          <span style={{ fontSize: 10, opacity: 0.7 }}>
            {formatTime(message.createdAt)}
          </span>
          {out && message.status === "delivered" && <CheckCheck size={11} />}
          {out && message.status === "sending" && <Check size={11} />}
          {out && message.status === "failed" && <AlertCircle size={11} />}
        </div>
        {!deleted && (onReact || onEdit || onDelete) && (
          <div
            className="row-flex wrap"
            style={{ gap: 4, marginTop: 6, opacity: 0.9 }}
          >
            {onReact &&
              QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="btn btn--sm btn--ghost"
                  style={{ padding: "2px 6px", minHeight: 0 }}
                  onClick={() => onReact(emoji)}
                >
                  {emoji}
                </button>
              ))}
            {onEdit && (
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                style={{ padding: "2px 6px", minHeight: 0 }}
                onClick={() => {
                  setDraft(message.text);
                  setEditing(true);
                }}
                aria-label="Edit"
              >
                <Pencil size={12} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                style={{ padding: "2px 6px", minHeight: 0 }}
                onClick={() => onDelete()}
                aria-label="Delete"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
