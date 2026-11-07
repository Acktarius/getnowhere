/** Truncate reply preview text to Unicode code points + ellipsis. */

const DEFAULT_MAX_CODE_POINTS = 100;
const ELLIPSIS = "…";

/**
 * Truncate `text` to `maxCodePoints` Unicode code points, appending `…` when cut.
 * @see docs/security/p2pchatprotocol.md
 */
export function truncateReplyPreview(
  text: string,
  maxCodePoints: number = DEFAULT_MAX_CODE_POINTS,
): string {
  if (!text) return text;
  const codePoints = Array.from(text);
  if (codePoints.length <= maxCodePoints) return text;
  return `${codePoints.slice(0, maxCodePoints).join("")}${ELLIPSIS}`;
}
