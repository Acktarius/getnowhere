import { X } from "lucide-react";
import type { ReactNode } from "react";

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
  onConfirm?: () => void;
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
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal__panel">
          <h3 style={{ fontSize: 17, marginBottom: 8 }}>{title}</h3>
          {body && (
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
              {body}
            </p>
          )}
          <div className="stack stack--gap-2" style={{ marginTop: 20 }}>
            <button
              className={`btn btn--block ${destructive ? "btn--danger" : "btn--primary"}`}
              onClick={() => {
                onConfirm?.();
                onClose();
              }}
            >
              {confirmLabel}
            </button>
            <button className="btn btn--block btn--ghost" onClick={onClose}>
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
