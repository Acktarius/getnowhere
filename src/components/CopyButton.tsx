import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { copySensitive } from "@/lib/clipboard/sensitiveClipboard";

/** Explicit Copy of a raw value via copySensitive. */
export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      className="btn btn--sm btn--ghost"
      onClick={() => {
        void copySensitive(value).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}{" "}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
