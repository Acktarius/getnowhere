/**
 * Device-local PREFERRED daemon node — the node a user picks on the wallet-open screen, persisted so
 * they don't re-pick every time. It lives in localStorage (NOT the encrypted wallet blob), so it's
 * readable BEFORE unlock and shared across every wallet on this device. Engine-free + SSR/static-
 * export safe (guards `typeof localStorage`).
 *
 * Precedence when the wallet picks its sync node (see `nodeUrlFromRaw`): an explicit per-wallet
 * custom node (encrypted settings) wins, then this device-local preference, then the default node.
 *
 * Read by BOTH the runtime (`readPreferredNode`, at daemon construction) and the open-screen picker
 * (the cached/subscribable getters, for reactivity).
 */
import { isBlockedDaemonUrl } from "@/lib/config";

const STORAGE_KEY = "ccx-preferred-node";

type NodePreferenceListener = (url: string | null) => void;

let cached: string | null = null;
let loaded = false;
const listeners = new Set<NodePreferenceListener>();

/** Direct localStorage read — no cache dependency, safe for the runtime to call at any time. */
export function readPreferredNode(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    const trimmed = value?.trim() ? value.trim() : null;
    if (trimmed && isBlockedDaemonUrl(trimmed)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

function writePreferredNode(url: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (url?.trim()) localStorage.setItem(STORAGE_KEY, url);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private-mode / quota — keep the in-memory value; non-critical.
  }
}

function notify(): void {
  for (const listener of listeners) listener(cached);
}

/** Load the persisted preference into the in-memory cache (call once on app start). */
export function loadNodePreference(): string | null {
  cached = readPreferredNode();
  loaded = true;
  notify();
  return cached;
}

/** The current preferred node — the cache once loaded, else a direct read. `null` = use the default. */
export function getPreferredNode(): string | null {
  return loaded ? cached : readPreferredNode();
}

/** Set (and persist) the preferred node. `null` clears it (revert to the default). */
export function setPreferredNode(url: string | null): void {
  if (url?.trim() && isBlockedDaemonUrl(url)) {
    throw new Error(
      "That daemon URL is not supported. Use a public node from Settings, or /ccx-daemon/ in local dev.",
    );
  }
  const next = url?.trim() ? url : null;
  cached = next;
  loaded = true;
  writePreferredNode(next);
  notify();
}

export function subscribeNodePreference(
  listener: NodePreferenceListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// --- auto-selected fastest node ------------------------------------------------------------------
// A SEPARATE slot for the "fastest healthy node" probed on the open screen (see
// `lib/network/auto-node.ts#refreshAutoNode`). It sits BELOW the user's explicit pick in the
// `nodeUrlFromRaw` precedence — it only improves the DEFAULT for users who haven't chosen a node,
// spreading load off the single hardcoded default (different users/locations → different fastest).
//
// It lives in sessionStorage, NOT localStorage (unlike the explicit preferred pick above): the probe
// re-runs every page load, so the auto pick is inherently per-session. Session scope means a cached
// node can NEVER be trusted across sessions — a returning user starts with no auto node (so
// `nodeUrlFromRaw` falls back to the static default) until this session's fresh probe lands, and a
// node that goes dead/removed can't be pinned indefinitely the way a persisted value could (Codex
// review). It still survives client-side navigation within the tab (e.g. the real-mode `?next=`
// unlock bounce). SSR/static-export safe (guards `typeof sessionStorage`).

const AUTO_KEY = "ccx-auto-node";

/** The fastest node probed THIS session, or null when none cached yet. Direct read — safe for the runtime. */
export function readAutoNode(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const value = sessionStorage.getItem(AUTO_KEY);
    const trimmed = value?.trim() ? value.trim() : null;
    if (trimmed && isBlockedDaemonUrl(trimmed)) {
      sessionStorage.removeItem(AUTO_KEY);
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

/** Cache this session's probed fastest node. `null` clears it. */
export function setAutoNode(url: string | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (url?.trim()) sessionStorage.setItem(AUTO_KEY, url);
    else sessionStorage.removeItem(AUTO_KEY);
  } catch {
    // Private-mode / quota — non-critical.
  }
}
