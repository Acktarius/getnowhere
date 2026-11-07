/**
 * Confine the privileged BrowserWindow to the resolved UI origin.
 * @see docs/architecture/electron-desktop.md
 */

import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const LOOPBACK = new Set(["127.0.0.1", "::1", "[::1]"]);

/**
 * @typedef {{ kind: "file"; filePath: string; dirPath: string } | { kind: "http"; origin: string }} UiNavPolicy
 */

/** @param {string} hostname */
export function isLoopbackHostname(hostname) {
  return LOOPBACK.has(hostname);
}

/**
 * @param {{ kind: "file" | "url"; value: string }} target
 * @returns {UiNavPolicy}
 */
export function uiPolicyFromTarget(target) {
  if (target.kind === "file") {
    return filePolicy(resolve(target.value));
  }
  let parsed;
  try {
    parsed = new URL(target.value);
  } catch {
    throw new Error("invalid UI URL");
  }
  if (parsed.protocol === "file:") {
    return filePolicy(fileURLToPath(parsed));
  }
  if (
    (parsed.protocol === "http:" || parsed.protocol === "https:") &&
    isLoopbackHostname(parsed.hostname)
  ) {
    return { kind: "http", origin: parsed.origin };
  }
  throw new Error("UI URL must be a local file or loopback http(s)");
}

/**
 * Hash/query do not change origin. Fail closed on missing or unparseable URLs.
 * @param {unknown} rawUrl
 * @param {UiNavPolicy | null | undefined} policy
 */
export function isAllowedUiUrl(rawUrl, policy) {
  if (!policy || typeof rawUrl !== "string" || !rawUrl.trim()) return false;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (policy.kind === "http") {
    return parsed.origin === policy.origin;
  }
  if (parsed.protocol !== "file:") return false;
  let candidate;
  try {
    candidate = fileURLToPath(parsed);
  } catch {
    return false;
  }
  return isPathInside(policy.dirPath, candidate);
}

/** @param {import("electron").WebContents} contents @param {UiNavPolicy} policy */
export function installUiNavigationGuards(contents, policy) {
  contents.on("will-navigate", (event, url) => {
    if (!isAllowedUiUrl(url, policy)) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
}

/** @param {string} filePath @returns {UiNavPolicy} */
function filePolicy(filePath) {
  const abs = resolve(filePath);
  return { kind: "file", filePath: abs, dirPath: dirname(abs) };
}

/** @param {string} dir @param {string} candidate */
function isPathInside(dir, candidate) {
  const root = resolve(dir);
  const path = resolve(candidate);
  return path === root || path.startsWith(root + sep);
}
