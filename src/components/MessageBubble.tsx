import { AlertCircle, Check, CheckCheck } from "lucide-react";
import type { ChatMessage } from "@/types/models";
import { formatTime } from "@/utils/format";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const out = message.direction === "out";
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
        }}
      >
        <span
          style={{ fontSize: 14.5, lineHeight: 1.4, wordBreak: "break-word" }}
        >
          {message.text}
        </span>
        <div
          className="row-flex"
          style={{ gap: 4, justifyContent: "flex-end", marginTop: 2 }}
        >
          <span style={{ fontSize: 10, opacity: 0.7 }}>
            {formatTime(message.createdAt)}
          </span>
          {out && message.status === "delivered" && <CheckCheck size={11} />}
          {out && message.status === "sending" && <Check size={11} />}
          {out && message.status === "failed" && <AlertCircle size={11} />}
        </div>
      </div>
    </div>
  );
}
