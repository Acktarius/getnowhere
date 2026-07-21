import { AlertTriangle, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  seedPhrase: string;
  onConfirm: () => void;
};

export function SeedBackupPanel({ seedPhrase, onConfirm }: Props) {
  const words = seedPhrase.split(" ");
  const [revealed, setRevealed] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setRevealed(false);
    setChecked(false);
  }, [seedPhrase]);

  return (
    <div className="stack stack--gap-4">
      <div
        className="card card--pad-md"
        style={{
          borderColor: "var(--border-accent)",
          background: "var(--primary-soft)",
        }}
      >
        <div className="row-flex" style={{ gap: 10 }}>
          <ShieldCheck size={18} style={{ color: "var(--primary)" }} />
          <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text)" }}>
            These words restore full access to your wallet and relationships.
            Never share them. Never type them into a site that is not this app.
          </p>
        </div>
      </div>

      <button
        className="btn btn--block btn--secondary"
        onClick={() => setRevealed((r) => !r)}
      >
        {revealed ? (
          <>
            <EyeOff size={15} /> Hide seed phrase
          </>
        ) : (
          <>
            <Eye size={15} /> Reveal seed phrase
          </>
        )}
      </button>

      {revealed && (
        <div className="card card--pad-md">
          <div
            className="wrap"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
            }}
          >
            {words.map((w, i) => (
              <div
                key={i}
                className="mono"
                style={{
                  fontSize: 12.5,
                  padding: "6px 8px",
                  background: "var(--bg-elev-2)",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                }}
              >
                <span className="faint" style={{ marginRight: 6 }}>
                  {i + 1}
                </span>
                {w}
              </div>
            ))}
          </div>
          <div className="field__hint" style={{ marginTop: 10 }}>
            Write these down offline. There is no recovery without them.
          </div>
        </div>
      )}

      <label className="row-flex" style={{ gap: 10, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          style={{ width: 18, height: 18, accentColor: "var(--primary)" }}
        />
        <span style={{ fontSize: 13.5 }}>
          I have stored my seed phrase safely offline.
        </span>
      </label>

      {!checked && (
        <div
          className="row-flex"
          style={{ gap: 8, color: "var(--warning)", fontSize: 12.5 }}
        >
          <AlertTriangle size={14} /> Tick the box once your seed is backed up.
        </div>
      )}

      <button
        className="btn btn--block btn--primary"
        disabled={!checked || !revealed}
        onClick={onConfirm}
      >
        Confirm backup
      </button>
    </div>
  );
}
