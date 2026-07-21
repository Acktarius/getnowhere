/**
 * Node latency probing + ranking for smart node selection (sync-speed work). Times each
 * node's `getheight` round-trip (via {@link testNodeUrlReachability}) so the UI can show
 * per-node latency and the wallet can pick the FASTEST healthy node. Ranking is pure +
 * dependency-light so it unit-tests without the network; the probe itself is DI'd on a clock.
 *
 * "Healthy" = reachable AND not stale (its tip within {@link NODE_LAG_WARN_BLOCKS} of the
 * best height seen) — a fast node that's behind the chain is useless for sync. This selects a
 * single home node; sharing fetch load across several nodes mid-sync is a separate phase.
 */
import { NODE_LAG_WARN_BLOCKS } from "@/lib/network/node-lag";
import { testNodeUrlReachability } from "@/lib/validation/node-url";

export type NodeProbe = {
  url: string;
  reachable: boolean;
  /** Round-trip ms for `getheight`, or null when unreachable. */
  latencyMs: number | null;
  /** The node's reported tip, or null when unreachable. */
  height: number | null;
};

/** Probe one node: time its `getheight`. Never throws — an unreachable node returns nulls. */
export async function probeNode(
  url: string,
  now: () => number = () => Date.now(),
): Promise<NodeProbe> {
  const start = now();
  try {
    const height = await testNodeUrlReachability(url);
    return {
      url,
      reachable: true,
      latencyMs: Math.max(0, now() - start),
      height,
    };
  } catch {
    return { url, reachable: false, latencyMs: null, height: null };
  }
}

/** Probe many nodes concurrently. */
export async function probeNodes(
  urls: readonly string[],
  now: () => number = () => Date.now(),
): Promise<NodeProbe[]> {
  return Promise.all(urls.map((url) => probeNode(url, now)));
}

/**
 * The chain-tip reference for staleness. With 3+ nodes use the SECOND-highest tip, so a
 * single buggy/compromised node reporting an inflated height can't define the reference and
 * flip every honest node to "stale" (#174 review — GLM/Gemini). With 1–2 nodes there's no
 * outlier to discard, so trust the max (which correctly excludes a node that's behind).
 */
function referenceHeight(heights: readonly number[]): number {
  if (heights.length === 0) return 0;
  const descending = [...heights].sort((a, b) => b - a);
  return descending.length >= 3 ? descending[1] : descending[0];
}

/**
 * Healthy probes (reachable + tip within `lagThreshold` of the reference height — see
 * {@link referenceHeight}), sorted fastest first. Pure. A node with no height never ranks.
 */
export function rankNodes(
  probes: readonly NodeProbe[],
  lagThreshold: number = NODE_LAG_WARN_BLOCKS,
): NodeProbe[] {
  const healthy = probes.filter(
    (p): p is NodeProbe & { latencyMs: number; height: number } =>
      p.reachable && p.latencyMs !== null && p.height !== null,
  );
  const reference = referenceHeight(healthy.map((p) => p.height));
  return healthy
    .filter((p) => p.height >= reference - lagThreshold)
    .sort((a, b) => a.latencyMs - b.latencyMs);
}

/** The fastest healthy non-stale node URL, or null when none qualify. */
export function fastestNodeUrl(
  probes: readonly NodeProbe[],
  lagThreshold: number = NODE_LAG_WARN_BLOCKS,
): string | null {
  return rankNodes(probes, lagThreshold)[0]?.url ?? null;
}
