/** Grapheme-safe preview truncation for notification bodies. */
export const MAX_PREVIEW_GRAPHEMES = 96;
export const SINGLE_LINE_PREVIEW_GRAPHEMES = 72;

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function graphemeCount(text: string): number {
  if (!segmenter) return [...text].length;
  let n = 0;
  for (const _ of segmenter.segment(text)) n += 1;
  return n;
}

/** Strip control chars and collapse whitespace to a single line. */
export function normalizeNotificationPreview(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // Drop C0 / DEL / C1 controls — they break one-line OS previews.
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      out += " ";
      continue;
    }
    out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Truncate at a grapheme boundary; default single-line preview limit. */
export function truncateNotificationPreview(
  text: string,
  maxGraphemes = SINGLE_LINE_PREVIEW_GRAPHEMES,
): string {
  const normalized = normalizeNotificationPreview(text);
  if (!normalized) return "";
  if (graphemeCount(normalized) <= maxGraphemes) return normalized;
  if (!segmenter) {
    const chars = [...normalized];
    return `${chars.slice(0, maxGraphemes).join("")}…`;
  }
  let out = "";
  let n = 0;
  for (const { segment } of segmenter.segment(normalized)) {
    if (n >= maxGraphemes) break;
    out += segment;
    n += 1;
  }
  return `${out}…`;
}
