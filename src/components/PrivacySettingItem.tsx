import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  value?: ReactNode;
  on?: boolean;
  onToggle?: (next: boolean) => void;
  trailing?: ReactNode;
};

export function PrivacySettingItem({
  title,
  description,
  value,
  on,
  onToggle,
  trailing,
}: Props) {
  return (
    <div className="row" style={{ padding: "14px 0" }}>
      <div className="grow stack" style={{ gap: 3 }}>
        <span style={{ fontSize: 14.5, fontWeight: 500 }}>{title}</span>
        {description && <span className="field__hint">{description}</span>}
        {value && <div style={{ marginTop: 4 }}>{value}</div>}
      </div>
      {onToggle ? (
        <button
          role="switch"
          aria-checked={on}
          onClick={() => onToggle(!on)}
          style={{
            width: 44,
            height: 26,
            borderRadius: 13,
            background: on ? "var(--primary)" : "var(--bg-press)",
            border: "1px solid var(--border)",
            position: "relative",
            transition: "background var(--dur) var(--ease)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: on ? 20 : 2,
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "var(--text-inverse)",
              transition: "left var(--dur) var(--ease)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }}
          />
        </button>
      ) : (
        trailing
      )}
    </div>
  );
}
