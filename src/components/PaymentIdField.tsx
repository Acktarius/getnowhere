import { AlertCircle, Check, Copy, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useCopy } from "@/hooks/useCopy";
import { shortAddress } from "@/utils/format";

type Props = {
  label: string;
  value: string;
  direction: "from" | "to";
  hint?: string;
  editable?: boolean;
  onEdit?: (v: string) => void;
  missing?: boolean;
};

export function PaymentIdField({
  label,
  value,
  direction,
  hint,
  editable,
  onEdit,
  missing,
}: Props) {
  const [copied, copy] = useCopy();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const accent = direction === "from" ? "var(--primary)" : "var(--secondary)";

  return (
    <div
      className="card card--pad-md"
      style={{ borderColor: missing ? "var(--danger)" : "var(--border)" }}
    >
      <div className="row-flex row-flex--between" style={{ marginBottom: 8 }}>
        <span className="eyebrow" style={{ color: accent }}>
          {label}
        </span>
        {missing && (
          <span className="pill pill--pending">
            <AlertCircle size={11} /> missing
          </span>
        )}
      </div>
      {editing ? (
        <div className="stack stack--gap-2">
          <input
            className="input input--mono"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <div className="row-flex" style={{ gap: 8 }}>
            <button
              className="btn btn--sm btn--primary"
              onClick={() => {
                onEdit?.(draft);
                setEditing(false);
              }}
            >
              Save
            </button>
            <button
              className="btn btn--sm btn--ghost"
              onClick={() => {
                setDraft(value);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          className="mono"
          style={{
            fontSize: 12.5,
            wordBreak: "break-all",
            color: value ? "var(--text)" : "var(--text-faint)",
          }}
        >
          {value ? shortAddress(value, 10, 10) : "— not set —"}
        </div>
      )}
      {hint && (
        <div className="field__hint" style={{ marginTop: 8 }}>
          {hint}
        </div>
      )}
      {!editing && value && (
        <div className="row-flex" style={{ gap: 8, marginTop: 10 }}>
          <button
            className="btn btn--sm btn--ghost"
            onClick={() => copy(value)}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}{" "}
            {copied ? "Copied" : "Copy"}
          </button>
          {editable && (
            <button
              className="btn btn--sm btn--ghost"
              onClick={() => setEditing(true)}
            >
              <RefreshCw size={13} /> Edit
            </button>
          )}
        </div>
      )}
    </div>
  );
}
