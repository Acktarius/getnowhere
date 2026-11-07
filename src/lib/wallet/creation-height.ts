/**
 * Sanitize wallet creation / scan-start height for settings + import.
 * SDK types `RawWalletV1.creationHeight` but has no clamp helper — mirror
 * conceal-next-wallet settings clamp into `[0, tip)`.
 */

/** Clamp a proposed creation height into `[0, tip)` (tip exclusive when tip > 0). */
export function clampCreationHeight(height: number, tip: number): number {
  if (!Number.isFinite(height) || height < 0) return 0;
  const floor = Math.floor(height);
  const tipFloor = Math.max(0, Math.floor(Number(tip) || 0));
  if (tipFloor <= 0) return 0;
  return Math.min(floor, tipFloor - 1);
}

/** Parse a UI string into a non-negative integer candidate (NaN if empty/invalid). */
export function parseCreationHeightInput(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return Number.NaN;
  return Number.parseInt(trimmed, 10);
}
