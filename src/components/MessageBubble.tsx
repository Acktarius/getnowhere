import {
  AlertCircle,
  Check,
  CheckCheck,
  Hourglass,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/types/models";
import { formatTime } from "@/utils/format";
import { renderMarkdownLite } from "@/utils/markdownLite";

/** Wire token for the Conceal mark quick reaction. */
export const CCX_REACTION = ":ccx:";
const CONCEAL_MARK_SRC = `${import.meta.env.BASE_URL}brand/conceal-mark.png`;
const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "👀", CCX_REACTION];
const LONG_PRESS_MS = 450;
/** PNG reads smaller than emoji at the same px — tune display only. */
const CCX_REACTION_SIZE_SCALE = 1.45;

function reactionDisplaySize(reaction: string, emojiSize: number): number {
  return reaction === CCX_REACTION
    ? Math.round(emojiSize * CCX_REACTION_SIZE_SCALE)
    : emojiSize;
}

function ReactionGlyph({
  reaction,
  size = 18,
}: {
  reaction: string;
  size?: number;
}) {
  if (reaction === CCX_REACTION) {
    const px = reactionDisplaySize(reaction, size);
    return (
      <img
        src={CONCEAL_MARK_SRC}
        alt=""
        width={px}
        height={px}
        aria-hidden
        style={{ display: "block", objectFit: "contain", flexShrink: 0 }}
      />
    );
  }
  return <>{reaction}</>;
}

export type BubbleReaction = {
  emoji: string;
  /** Who placed it — used for badge stacking only. */
  from: "me" | "peer";
};

export function MessageBubble({
  message,
  reactions = [],
  onReact,
  onEdit,
  onDelete,
}: {
  message: ChatMessage;
  /** Aggregated reactions for this message (Apple-style corner badge). */
  reactions?: BubbleReaction[];
  onReact?: (emoji: string) => void;
  onEdit?: (text: string) => void;
  onDelete?: () => void;
}) {
  const out = message.direction === "out";
  const relay = message.channel === "relay";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const [pickerOpen, setPickerOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const touchIntent = useRef(false);
  const deleted = Boolean(message.deletedAt) || message.kind === "delete";
  const canAct = !deleted && Boolean(onReact || onEdit || onDelete);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [pickerOpen]);

  // Wire protocol still carries reaction rows; UI never renders them as bubbles.
  if (message.kind === "reaction") return null;

  function clearLongPress() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function openPicker() {
    if (!canAct || editing) return;
    setPickerOpen(true);
  }

  /** Phone: long-press. Desktop: click. */
  function onBubblePointerDown(e: React.PointerEvent) {
    if (!canAct || editing) return;
    if (e.pointerType === "touch" || e.pointerType === "pen") {
      touchIntent.current = true;
      clearLongPress();
      longPressTimer.current = window.setTimeout(() => {
        longPressTimer.current = null;
        openPicker();
      }, LONG_PRESS_MS);
    } else {
      touchIntent.current = false;
    }
  }

  function onBubbleClick() {
    if (!canAct || editing) return;
    if (touchIntent.current) {
      // Touch uses long-press only; ignore the click that follows a tap/press.
      touchIntent.current = false;
      return;
    }
    openPicker();
  }

  const badgeEmojis = [...new Set(reactions.map((r) => r.emoji))];

  return (
    <div
      ref={rootRef}
      className={`row-flex ${out ? "" : "row-flex--gap-2"}`}
      style={{
        justifyContent: out ? "flex-end" : "flex-start",
        marginTop: badgeEmojis.length ? 10 : 0,
        marginBottom: 6,
        position: "relative",
      }}
    >
      {!out && <div style={{ width: 28, flexShrink: 0 }} />}
      <div style={{ position: "relative", maxWidth: "76%" }}>
        <div
          role={canAct && !editing ? "button" : undefined}
          tabIndex={canAct && !editing ? 0 : undefined}
          onClick={onBubbleClick}
          onPointerDown={onBubblePointerDown}
          onPointerUp={clearLongPress}
          onPointerLeave={clearLongPress}
          onPointerCancel={clearLongPress}
          onKeyDown={(e) => {
            if (editing) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openPicker();
            }
          }}
          style={{
            padding: "8px 12px",
            borderRadius: 16,
            // Relay = grey (SMS-class); live out = accent.
            background: relay || !out ? "var(--bg-elev-2)" : "var(--primary)",
            color: relay || !out ? "var(--text)" : "var(--primary-fg)",
            border: relay || !out ? "1px solid var(--border-strong)" : "none",
            borderBottomRightRadius: out ? 5 : 16,
            borderBottomLeftRadius: out ? 16 : 5,
            opacity: deleted ? 0.55 : 1,
            cursor: canAct ? "pointer" : undefined,
            userSelect: "text",
            WebkitUserSelect: "text",
            outline: "none",
            ...(out && !relay
              ? ({
                  "--bubble-fence-bg":
                    "color-mix(in srgb, var(--primary) 78%, black)",
                  "--bubble-fence-fg": "var(--primary-fg)",
                  "--bubble-fence-border":
                    "color-mix(in srgb, var(--primary-fg) 22%, transparent)",
                } as React.CSSProperties)
              : ({
                  "--bubble-fence-bg":
                    "color-mix(in srgb, var(--bg-elev-2) 82%, black)",
                  "--bubble-fence-fg": "var(--text)",
                  "--bubble-fence-border": "var(--border-strong)",
                } as React.CSSProperties)),
          }}
        >
          {editing ? (
            <div className="stack stack--gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                style={{ fontSize: 14 }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <div className="row-flex" style={{ gap: 6 }}>
                <button
                  className="btn btn--sm btn--secondary"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit?.(draft);
                    setEditing(false);
                  }}
                >
                  Save
                </button>
                <button
                  className="btn btn--sm btn--ghost"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(false);
                  }}
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
              {deleted
                ? "Message deleted"
                : relay
                  ? message.text
                  : renderMarkdownLite(message.text)}
            </span>
          )}
          <div
            className="row-flex"
            style={{ gap: 4, justifyContent: "flex-end", marginTop: 2 }}
          >
            {message.editedAt && !deleted && (
              <span style={{ fontSize: 10, opacity: 0.7 }}>edited</span>
            )}
            {relay && (
              <span
                style={{ fontSize: 10, opacity: 0.65 }}
                title="L1 via chain"
              >
                chain
              </span>
            )}
            {typeof message.ttlExpiresAt === "number" &&
              message.ttlExpiresAt > 0 && (
                <span title="TTL" style={{ display: "inline-flex" }}>
                  <Hourglass size={11} aria-hidden style={{ opacity: 0.65 }} />
                </span>
              )}
            <span style={{ fontSize: 10, opacity: 0.7 }}>
              {formatTime(message.createdAt)}
            </span>
            {out && message.status === "queued" && (
              <span style={{ fontSize: 10, opacity: 0.7 }}>queued</span>
            )}
            {out && message.status === "delivered" && <CheckCheck size={11} />}
            {out && message.status === "sending" && <Check size={11} />}
            {out && message.status === "failed" && <AlertCircle size={11} />}
          </div>
        </div>

        {badgeEmojis.length > 0 && (
          <div
            className="msg-reaction-badge"
            style={{
              position: "absolute",
              top: -10,
              // Sender (out): top-left · Receiver (in): top-right
              [out ? "left" : "right"]: 6,
              display: "flex",
              alignItems: "center",
              gap: 2,
              padding: "1px 5px",
              borderRadius: 999,
              background: "var(--bg-elev-1)",
              border: "1px solid var(--border)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
              fontSize: 13,
              lineHeight: 1.2,
              zIndex: 1,
              pointerEvents: "none",
            }}
          >
            {badgeEmojis.map((emoji) => (
              <span key={emoji}>
                <ReactionGlyph reaction={emoji} size={13} />
              </span>
            ))}
          </div>
        )}

        {pickerOpen && (
          <div
            className="msg-reaction-picker"
            role="menu"
            style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              [out ? "right" : "left"]: 0,
              display: "flex",
              alignItems: "center",
              gap: 2,
              padding: 4,
              borderRadius: 999,
              background: "var(--bg-elev-1)",
              border: "1px solid var(--border)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
              zIndex: 5,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {onReact &&
              QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  role="menuitem"
                  className="btn btn--sm btn--ghost"
                  aria-label={emoji === CCX_REACTION ? "Conceal" : emoji}
                  style={{
                    padding: "4px 8px",
                    minHeight: 0,
                    fontSize: 18,
                    borderRadius: 999,
                  }}
                  onClick={() => {
                    onReact(emoji);
                    setPickerOpen(false);
                  }}
                >
                  <ReactionGlyph reaction={emoji} />
                </button>
              ))}
            {onEdit && (
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                style={{ padding: "4px 8px", minHeight: 0, borderRadius: 999 }}
                onClick={() => {
                  setDraft(message.text);
                  setEditing(true);
                  setPickerOpen(false);
                }}
                aria-label="Edit"
              >
                <Pencil size={14} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                style={{ padding: "4px 8px", minHeight: 0, borderRadius: 999 }}
                onClick={() => {
                  onDelete();
                  setPickerOpen(false);
                }}
                aria-label="Delete"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              style={{ padding: "4px 8px", minHeight: 0, borderRadius: 999 }}
              onClick={() => setPickerOpen(false)}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
