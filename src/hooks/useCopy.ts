import { useEffect, useState } from "react";

export function useCopy(
  clearAfterMs = 1800,
): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), clearAfterMs);
    return () => clearTimeout(t);
  }, [copied, clearAfterMs]);

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return [copied, copy];
}
