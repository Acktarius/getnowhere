import pin from "./height-at-version.json";

/**
 * Chain height recorded for this app version (`heightAtVersion` JSON pin).
 * New-wallet create uses it when the daemon does not return a tip.
 * @see docs/features/lite-wallet.md
 */

/** Shape of `height-at-version.json` (pin height only — not the repo `version` file). */
export type HeightAtVersionPin = {
  heightAtVersion: number;
};

/** Read a positive safe integer from a pin object; otherwise 0. */
export function parseHeightAtVersion(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const raw = (value as HeightAtVersionPin).heightAtVersion;
  const height = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isSafeInteger(height) || height <= 0) return 0;
  return height;
}

/** `heightAtVersion` shipped with this build. */
export function heightAtVersion(): number {
  return parseHeightAtVersion(pin);
}
