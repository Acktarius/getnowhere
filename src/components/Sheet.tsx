import { X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

type SheetProps = {
  open: boolean;
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

export function Sheet({ open, title, onClose, children }: SheetProps) {
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <button
          className="icon-btn sheet__close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>
        <div className="sheet__grip" />
        {title && <div className="sheet__title">{title}</div>}
        {children}
      </div>
    </>
  );
}

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  onConfirm?: () => void | Promise<void>;
  cancelLabel?: string;
  destructive?: boolean;
};

export function ConfirmModal({
  open,
  onClose,
  title,
  body,
  confirmLabel = "Confirm",
  onConfirm,
  cancelLabel = "Cancel",
  destructive,
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
          {busy && (
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Destroying room…
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
              {busy ? "Leaving…" : confirmLabel}
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
