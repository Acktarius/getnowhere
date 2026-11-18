import { X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

type SheetProps = {
  open: boolean;
  title?: ReactNode;
  /** Rendered immediately under the title row (before sheet body). */
  belowTitle?: ReactNode;
  onClose: () => void;
  /** Viewport y in px; pins the sheet top there instead of the bottom edge (keeps inputs above the mobile keyboard). */
  anchorTop?: number;
  children: ReactNode;
};

export function Sheet({
  open,
  title,
  belowTitle,
  onClose,
  anchorTop,
  children,
}: SheetProps) {
  if (!open) return null;
  const anchored = anchorTop !== undefined;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div
        className={anchored ? "sheet sheet--anchored" : "sheet"}
        style={
          anchored
            ? ({ "--sheet-top": `${anchorTop}px` } as CSSProperties)
            : undefined
        }
        role="dialog"
        aria-modal="true"
      >
        <button
          className="icon-btn sheet__close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>
        <div className="sheet__grip" />
        {title && <div className="sheet__title">{title}</div>}
        {belowTitle}
        {children}
      </div>
    </>
  );
}
