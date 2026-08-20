import { type ReactNode, useEffect, useState } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  onConfirm?: () => void | Promise<void>;
  cancelLabel?: string;
  destructive?: boolean;
  /** Button label while async onConfirm is in flight. */
  busyLabel?: string;
  /** Optional status line shown under the body while busy. */
  busyStatus?: string;
};

/** Shared confirm dialog for destructive and session actions. */
export function ConfirmModal({
  open,
  onClose,
  title,
  body,
  confirmLabel = "Confirm",
  onConfirm,
  cancelLabel = "Cancel",
  destructive,
  busyLabel = "Working…",
  busyStatus,
}: ModalProps) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className="scrim"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal__panel">
          <h3 style={{ fontSize: 17, marginBottom: 8 }}>{title}</h3>
          {body && (
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
              {body}
            </p>
          )}
          {busy && busyStatus && (
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              {busyStatus}
            </p>
          )}
          <div className="stack stack--gap-2" style={{ marginTop: 20 }}>
            <button
              className={`btn btn--block ${destructive ? "btn--danger" : "btn--primary"}`}
              disabled={busy}
              onClick={() => {
                if (busy) return;
                setBusy(true);
                void (async () => {
                  try {
                    await onConfirm?.();
                    onClose();
                  } catch {
                    setBusy(false);
                  }
                })();
              }}
            >
              {busy ? busyLabel : confirmLabel}
            </button>
            <button
              className="btn btn--block btn--ghost"
              disabled={busy}
              onClick={() => {
                if (!busy) onClose();
              }}
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
