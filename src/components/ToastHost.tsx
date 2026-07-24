import { X } from "lucide-react";
import { useToastStore } from "@/state/toastStore";

/** Fixed bottom stack for ephemeral notices. */
export function ToastHost() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);
  if (items.length === 0) return null;

  return (
    <div className="toast-host" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={`toast toast--${t.variant}`}
          role={t.variant === "error" ? "alert" : "status"}
        >
          <span className="toast__msg">{t.message}</span>
          <button
            type="button"
            className="toast__close"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
