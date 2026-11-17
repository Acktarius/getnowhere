import versionText from "../../../version?raw";

/**
 * Chain height recorded for this app version (`heightAtVersion` in the repo-root `version` file).
 * New-wallet create uses it when the daemon does not return a tip.
 */
export function parseHeightAtVersion(text: string): number {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^heightAtVersion=(\d+)$/.exec(trimmed);
    if (!match) continue;
    const height = Number(match[1]);
    if (Number.isSafeInteger(height) && height > 0) return height;
  }
  return 0;
}

/** `heightAtVersion` shipped with this build. */
export function heightAtVersion(): number {
  return parseHeightAtVersion(versionText);
}
