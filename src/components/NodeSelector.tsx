/**
 * Node selector with live latency probe + Use fastest — next-wallet parity.
 */
import { Check, RefreshCw, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_DAEMON_NODES, isBlockedDaemonUrl } from "@/lib/config";
import {
  fastestNodeUrl,
  type NodeProbe,
  probeNodes,
} from "@/lib/network/node-probe";
import { fetchSmartNodes, nodeUrlToPoolHost } from "@/lib/network/smart-nodes";
import type { SmartNode } from "@/lib/types/smart-node";

function withoutLeftovers(list: SmartNode[]): SmartNode[] {
  return list.filter((n) => !isBlockedDaemonUrl(n.url));
}

export function NodeSelector({
  activeNodeUrl,
  onUseNode,
  onUseFastest,
  busy = false,
}: {
  activeNodeUrl: string;
  onUseNode: (url: string) => void;
  onUseFastest: (url: string | null) => void;
  busy?: boolean;
}) {
  const [nodes, setNodes] = useState<SmartNode[]>([]);
  const [probes, setProbes] = useState<Record<string, NodeProbe>>({});
  const [probing, setProbing] = useState(false);
  const [loading, setLoading] = useState(true);
  const probeNonce = useRef(0);
  const activeHost = nodeUrlToPoolHost(activeNodeUrl);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSmartNodes(activeNodeUrl)
      .then((list) => {
        if (!cancelled) setNodes(withoutLeftovers(list));
      })
      .catch(() => {
        if (!cancelled) {
          setNodes(
            withoutLeftovers(
              DEFAULT_DAEMON_NODES.map((url, i) => ({
                id: `default-${i}`,
                name: url,
                url,
                poolHost: nodeUrlToPoolHost(url),
              })),
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeNodeUrl]);

  const runProbe = useCallback(async (urls: string[]): Promise<NodeProbe[]> => {
    if (urls.length === 0) return [];
    probeNonce.current += 1;
    const nonce = probeNonce.current;
    setProbing(true);
    try {
      const results = await probeNodes(urls);
      if (probeNonce.current === nonce) {
        setProbes(Object.fromEntries(results.map((p) => [p.url, p])));
      }
      return results;
    } catch {
      return [];
    } finally {
      if (probeNonce.current === nonce) setProbing(false);
    }
  }, []);

  const handleUseFastest = useCallback(async () => {
    const fresh = await runProbe(nodes.map((n) => n.url));
    onUseFastest(fastestNodeUrl(fresh));
  }, [nodes, runProbe, onUseFastest]);

  const urlsKey = nodes.map((n) => n.url).join("|");
  const probedKey = useRef("");
  useEffect(() => {
    if (urlsKey && urlsKey !== probedKey.current) {
      probedKey.current = urlsKey;
      void runProbe(urlsKey.split("|"));
    }
  }, [urlsKey, runProbe]);

  if (loading) {
    return (
      <p className="faint" style={{ fontSize: 12.5, padding: "8px 0" }}>
        Loading node list…
      </p>
    );
  }

  if (nodes.length === 0) return null;

  return (
    <div className="stack stack--gap-3">
      <div
        className="row-flex"
        style={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Public nodes</span>
        <div className="row-flex" style={{ gap: 6 }}>
          <button
            type="button"
            className="btn btn--sm btn--secondary"
            disabled={probing}
            onClick={() => void runProbe(nodes.map((n) => n.url))}
          >
            <RefreshCw size={14} className={probing ? "spin" : ""} />
            {probing ? "Probing…" : "Refresh"}
          </button>
          <button
            type="button"
            className="btn btn--sm btn--primary"
            disabled={busy || probing}
            onClick={() => void handleUseFastest()}
          >
            <Zap size={14} /> Fastest
          </button>
        </div>
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {nodes.map((node) => {
          const probe = probes[node.url];
          const isActive = nodeUrlToPoolHost(node.url) === activeHost;
          return (
            <li key={node.id} style={{ marginBottom: 8 }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onUseNode(node.url)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: `1px solid ${isActive ? "var(--primary)" : "var(--border)"}`,
                  background: isActive
                    ? "var(--primary-ghost)"
                    : "var(--bg-elev-2)",
                  color: "var(--text)",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div className="grow" style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {node.name || node.poolHost}
                    {isActive && (
                      <Check size={14} style={{ color: "var(--primary)" }} />
                    )}
                  </div>
                  <div
                    className="mono faint"
                    style={{
                      fontSize: 11,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {node.url}
                  </div>
                </div>
                <div
                  className="faint"
                  style={{ fontSize: 11.5, textAlign: "right", flexShrink: 0 }}
                >
                  {probe == null
                    ? "—"
                    : !probe.reachable
                      ? "down"
                      : `${probe.latencyMs}ms`}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
