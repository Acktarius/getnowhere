import { Eye, EyeOff } from "lucide-react";
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
}: Props) {
  const [visible, setVisible] = useState(false);
  const hidden = revealable && !visible;
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
        />
        {revealable && (
          <button
            type="button"
            className="icon-btn"
            style={{
              position: "absolute",
              right: 6,
              top: 6,
              width: 34,
              height: 34,
            }}
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide" : "Show"}
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}
