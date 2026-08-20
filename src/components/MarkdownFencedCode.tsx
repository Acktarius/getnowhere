import { Check, Copy } from "lucide-react";
import { useCopy } from "@/hooks/useCopy";

/** Discord-style fenced code block with copy. */
export function MarkdownFencedCode({ code }: { code: string }) {
  const [copied, copy] = useCopy();

  return (
    <div
      className="md-fence-wrap"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="md-fence-copy btn btn--sm btn--ghost"
        aria-label={copied ? "Copied" : "Copy code"}
        onClick={(e) => {
          e.stopPropagation();
          copy(code);
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      <pre className="md-fence">
        <code>{code}</code>
      </pre>
    </div>
  );
}
