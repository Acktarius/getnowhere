import { Eye, EyeOff } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  mono?: boolean;
  revealable?: boolean;
  onBlur?: () => void;
  autoFocus?: boolean;
  inputMode?: "text" | "numeric";
  maxLength?: number;
  /** Extra controls inside the input (e.g. QR camera). Drawn left of the reveal button. */
  endAdornment?: ReactNode;
};

export function SecureInput({
  value,
  onChange,
  placeholder,
  label,
  mono,
  revealable,
  onBlur,
  autoFocus,
  inputMode = "text",
  maxLength,
  endAdornment,
}: Props) {
  const [visible, setVisible] = useState(false);
  const hidden = revealable && !visible;
  const trailCount = (revealable ? 1 : 0) + (endAdornment ? 1 : 0);
  const padRight = trailCount > 0 ? 6 + trailCount * 36 : undefined;

  return (
    <div className="field">
      {label && <span className="field__label">{label}</span>}
      <div style={{ position: "relative" }}>
        <input
          className={`input ${mono ? "input--mono" : ""}`}
          type={hidden ? "password" : "text"}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          autoFocus={autoFocus}
          maxLength={maxLength}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          style={padRight ? { paddingRight: padRight } : undefined}
        />
        <div
          style={{
            position: "absolute",
            right: 6,
            top: 6,
            display: "flex",
            gap: 2,
            alignItems: "center",
          }}
        >
          {endAdornment}
          {revealable && (
            <button
              type="button"
              className="icon-btn"
              style={{ width: 34, height: 34 } satisfies CSSProperties}
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? "Hide" : "Show"}
            >
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
