import { DEFAULT_DAEMON_NODES } from "@/lib/config";
import {
  normalizeNodeUrl,
  testNodeUrlReachability,
} from "@/lib/validation/node-url";

/** A custom node more than this many blocks behind the reference tip is "lagging". */
export const NODE_LAG_WARN_BLOCKS = 5;

export type NodeLag = { lagBlocks: number; isLagging: boolean };

/** Pure: how far `nodeHeight` is behind `referenceHeight` (clamped at zero). */
export function evaluateNodeLag(
  nodeHeight: number,
  referenceHeight: number,
  thresholdBlocks: number = NODE_LAG_WARN_BLOCKS,
): NodeLag {
  const lagBlocks = Math.max(
    0,
    Math.floor(referenceHeight) - Math.floor(nodeHeight),
  );
  return { lagBlocks, isLagging: lagBlocks > thresholdBlocks };
}

function sameHost(a: string, b: string): boolean {
  try {
    return (
      new URL(normalizeNodeUrl(a)).host === new URL(normalizeNodeUrl(b)).host
    );
  } catch {
    return normalizeNodeUrl(a) === normalizeNodeUrl(b);
  }
}

/**
 * Probe a custom node and the trusted reference nodes (concurrently) and report
 * how far the custom node's tip lags behind the highest reachable reference.
 *
 * Returns `null` — meaning "no warning" — when a judgement isn't possible:
 * the custom node IS a default node, the custom node is unreachable (surfaced
 * elsewhere), or no reference node could be reached. Never throws.
 */
export async function checkCustomNodeLag(
  nodeUrl: string,
  referenceUrls: readonly string[] = DEFAULT_DAEMON_NODES,
): Promise<NodeLag | null> {
  // A default node is its own reference — nothing to compare against.
  const references = referenceUrls.filter((url) => !sameHost(url, nodeUrl));
  if (references.length === 0) return null;

  const [nodeResult, ...refResults] = await Promise.allSettled([
    testNodeUrlReachability(nodeUrl),
    ...references.map((url) => testNodeUrlReachability(url)),
  ]);

  if (nodeResult.status !== "fulfilled") return null;
  const referenceHeights = refResults
    .filter(
      (r): r is PromiseFulfilledResult<number> => r.status === "fulfilled",
    )
    .map((r) => r.value);
  if (referenceHeights.length === 0) return null;

  return evaluateNodeLag(nodeResult.value, Math.max(...referenceHeights));
}
