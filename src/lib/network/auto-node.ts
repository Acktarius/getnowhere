/**
 * Auto-select the FASTEST healthy daemon node for users who haven't pinned one — so the default
 * isn't always the single hardcoded node (which concentrates load + may not be closest). Probes the
 * official nodes + the curated community pool once per session and caches the winner device-locally
 * (`setAutoNode`); `nodeUrlFromRaw` then prefers it over the static default (but below the user's
 * explicit pick / per-wallet custom node). Best-effort: any failure leaves the static default in
 * place. Triggered from the wallet-open screen so the cache is warm by the time a sync starts.
 */
import { DEFAULT_DAEMON_NODES } from "@/lib/config";
import { setAutoNode } from "@/lib/network/node-preference";
import { fastestNodeUrl, probeNodes } from "@/lib/network/node-probe";
import { fetchSmartNodes } from "@/lib/network/smart-nodes";

let refreshed = false;
let inFlight: Promise<void> | null = null;

/**
 * Probe official + community nodes and cache the fastest healthy one. Idempotent per session
 * (probing every render would be the very load we're trying to spread). Never throws.
 *
 * The success latch is set only AFTER a probe COMPLETES (not before), so a transient failure — a
 * network blip that throws mid-probe — is retried on the next mount rather than wedging the static
 * default for the whole session (GLM review M1). Concurrent callers (a StrictMode double-mount, or
 * several `AutoNodeWarmup`s) share the one in-flight probe via `inFlight`, so it never double-probes.
 */
export async function refreshAutoNode(): Promise<void> {
  if (refreshed || typeof window === "undefined") return;
  const home = DEFAULT_DAEMON_NODES[0];
  if (!home) return; // no official node configured — nothing to probe against
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      let urls: string[] = [...DEFAULT_DAEMON_NODES];
      try {
        const pool = await fetchSmartNodes(home);
        urls = [...urls, ...pool.map((node) => node.url)];
      } catch {
        // Pool unreachable — still rank the official nodes by latency.
      }
      const unique = [...new Set(urls)];
      const fastest = fastestNodeUrl(await probeNodes(unique));
      if (fastest) setAutoNode(fastest);
      refreshed = true; // latch only on a completed probe — a thrown error below stays un-latched
    } catch {
      // Best-effort — leave the static default in place and allow a later mount to retry.
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
