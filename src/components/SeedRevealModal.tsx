import { useEffect, useRef, useState } from "react";

const FADE_MS = 30_000;
const GRACE_MS = 5_000;

type Props = {
  open: boolean;
  seedPhrase: string;
  spendKey: string;
  viewKey: string;
  viewOnly?: boolean;
  onClose: () => void;
};

/** Timed secrets dialog: seed + keys; Need more time / auto-close. */
export function SeedRevealModal({
  open,
  seedPhrase,
  spendKey,
  viewKey,
  viewOnly,
  onClose,
}: Props) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [cycle, setCycle] = useState(0);
  const [needMoreEnabled, setNeedMoreEnabled] = useState(false);
  const [needMoreOpacity, setNeedMoreOpacity] = useState(0);

  useEffect(() => {
    if (!open) {
      setNeedMoreEnabled(false);
      setNeedMoreOpacity(0);
      return;
    }

    setNeedMoreEnabled(false);
    setNeedMoreOpacity(0);

    const kickFade = setTimeout(() => {
      setNeedMoreOpacity(1);
    }, 0);

    const enableTimer = setTimeout(() => {
      setNeedMoreEnabled(true);
      setNeedMoreOpacity(1);
    }, FADE_MS);

    const graceTimer = setTimeout(() => {
      onCloseRef.current();
    }, FADE_MS + GRACE_MS);

    return () => {
      clearTimeout(kickFade);
      clearTimeout(enableTimer);
      clearTimeout(graceTimer);
    };
  }, [open, cycle]);

  if (!open) return null;

  const words = seedPhrase.split(" ").filter(Boolean);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal__panel">
          <h3 style={{ fontSize: 17, marginBottom: 8 }}>Wallet secrets</h3>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
            Here is your seed and keys. Keep them in a safe place for wallet
            restoration. Never share them.
          </p>

          {viewOnly ? (
            <p
              className="muted"
              style={{ fontSize: 13, marginTop: 12, lineHeight: 1.45 }}
            >
              View-only wallet — spend key and mnemonic are not available.
            </p>
          ) : (
            <div
              className="wrap"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
                marginTop: 16,
              }}
            >
              {words.map((w, i) => (
                <div
                  key={`${cycle}-${i}`}
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
          )}

          <div className="stack stack--gap-3" style={{ marginTop: 16 }}>
            <div>
              <div className="field__label">Spend key</div>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  wordBreak: "break-all",
                  padding: "8px 10px",
                  background: "var(--bg-elev-2)",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                }}
              >
                {spendKey || "—"}
              </div>
            </div>
            <div>
              <div className="field__label">View key</div>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  wordBreak: "break-all",
                  padding: "8px 10px",
                  background: "var(--bg-elev-2)",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                }}
              >
                {viewKey || "—"}
              </div>
            </div>
          </div>

          <div
            className="row-flex"
            style={{ marginTop: 20, gap: 8, flexWrap: "wrap" }}
          >
            <button type="button" className="btn btn--primary" onClick={onClose}>
              Got it
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={!needMoreEnabled}
              style={{
                opacity: needMoreOpacity,
                transition: `opacity ${FADE_MS}ms linear`,
              }}
              onClick={() => {
                if (!needMoreEnabled) return;
                setCycle((c) => c + 1);
              }}
            >
              Need more time
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
