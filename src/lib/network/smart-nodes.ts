import { getCuratedPoolListUrl } from "@/lib/config";
import type { SmartNode } from "@/lib/types/smart-node";
import { normalizeNodeUrl } from "@/lib/validation/node-url";

type PoolListEntry = {
  id: string;
  name: string;
  url: { host: string; port: string };
  status?: {
    startTime?: string;
    uptime?: number;
  };
};

type PoolListResponse = {
  success: boolean;
  list: PoolListEntry[];
};

/** Wallet node URL → pool `url.host` form (no scheme, no trailing slash). */
export function nodeUrlToPoolHost(nodeUrl: string): string {
  return nodeUrl
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

function normalizePoolHost(host: string): string {
  return host.trim().replace(/\/$/, "").toLowerCase();
}

export function poolEntryMatchesNodeUrl(
  entry: PoolListEntry,
  nodeUrl: string,
): boolean {
  return normalizePoolHost(entry.url.host) === nodeUrlToPoolHost(nodeUrl);
}

export function findPoolNodeForUrl(
  nodes: SmartNode[],
  nodeUrl: string,
): SmartNode | undefined {
  const target = nodeUrlToPoolHost(nodeUrl);
  return nodes.find((node) => normalizePoolHost(node.poolHost) === target);
}

function poolEntryToNodeUrl(entry: PoolListEntry): string {
  const host = entry.url.host.replace(/\/$/, "");
  return normalizeNodeUrl(`https://${host}/`);
}

function mapPoolEntry(entry: PoolListEntry): SmartNode {
  return {
    id: entry.id,
    name: entry.name,
    url: poolEntryToNodeUrl(entry),
    poolHost: entry.url.host,
    poolStartTime: entry.status?.startTime,
    poolUptimePercent: entry.status?.uptime,
  };
}

function markActiveNode(
  nodes: SmartNode[],
  activeNodeUrl: string,
): SmartNode[] {
  const activeHost = nodeUrlToPoolHost(activeNodeUrl);
  return nodes.map((node) => ({
    ...node,
    isActive: normalizePoolHost(node.poolHost) === activeHost,
  }));
}

export async function fetchSmartNodes(
  activeNodeUrl: string,
): Promise<SmartNode[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(getCuratedPoolListUrl(), {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Smart nodes pool HTTP ${response.status}`);
    }

    const result = (await response.json()) as PoolListResponse;
    if (!result.success || result.list.length === 0) {
      throw new Error("Smart nodes pool returned no curated nodes");
    }

    return markActiveNode(result.list.map(mapPoolEntry), activeNodeUrl);
  } finally {
    clearTimeout(timeoutId);
  }
}
