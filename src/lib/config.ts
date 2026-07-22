/**
 * App-specific config (not chain consensus).
 * Daemon defaults match conceal-next-wallet exactly.
 *
 * Local `npm run dev` uses Vite same-origin proxies so the browser never hits
 * daemon hosts directly (avoids CORS). Production uses the public HTTPS nodes.
 */

export const TX_CONFIRMED_THRESHOLD = 10;

export const PUBLIC_NODES_POOL_BASE = "https://explorer.conceal.network/pool";

export const CURATED_POOL_LIST_QUERY =
  "hasFeeAddr=true&isReachable=true&hasSSL=true";

export function getCuratedPoolListUrl(
  poolBase: string = PUBLIC_NODES_POOL_BASE,
): string {
  return `${poolBase.replace(/\/$/, "")}/list?${CURATED_POOL_LIST_QUERY}`;
}

export const WALLET_DONATION_ADDRESS =
  "ccx7V4LeUXy2eZ9waDXgsLS7Uc11e2CpNSCWVdxEqSRFAm6P6NQhSb7XMG1D6VAZKmJeaJP37WYQg84zbNrPduTX2whZ5pacfj";

/** Same list as conceal-next-wallet `DEFAULT_DAEMON_NODES`. */
export const PUBLIC_DAEMON_NODES = [
  "https://explorer.conceal.network/daemon/",
  "https://ccxapi.conceal.network/daemon/",
] as const;

/** Fake / broken leftovers — never dial these from the browser. */
const LEFTOVER_DAEMON_MARKERS = [
  "daemon.conceal.network",
  "concealx.net",
] as const;

/** Same-origin Vite proxies (`vite.config.ts`) — only used in `npm run dev`. */
export const DEV_DAEMON_PROXIES = ["/ccx-daemon/", "/ccx-daemon-alt/"] as const;

function isViteDev(): boolean {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

/** Default daemon nodes — next-wallet public set; proxies first while developing. */
export const DEFAULT_DAEMON_NODES: readonly string[] = isViteDev()
  ? [...DEV_DAEMON_PROXIES, ...PUBLIC_DAEMON_NODES]
  : [...PUBLIC_DAEMON_NODES];

/** True when a URL is a known leftover / fabricated daemon host. */
export function isBlockedDaemonUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  if (!trimmed) return true;
  return LEFTOVER_DAEMON_MARKERS.some((marker) => trimmed.includes(marker));
}

/**
 * Expand same-origin proxy paths (`/ccx-daemon/`) to absolute URLs the SDK accepts.
 * Public https:// nodes pass through unchanged.
 */
export function resolveDaemonNodeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  const withSlash = trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  if (withSlash.startsWith("/")) {
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}${withSlash}`;
    }
    return `http://127.0.0.1:5173${withSlash}`;
  }
  return withSlash;
}

/**
 * Wipe leftover fabricated daemon URLs from device caches so probes stop
 * hitting them after an upgrade. Call once on app boot.
 */
export function scrubLeftoverDaemonCaches(): void {
  if (typeof window === "undefined") return;
  try {
    const preferred = localStorage.getItem("ccx-preferred-node");
    if (preferred && isBlockedDaemonUrl(preferred)) {
      localStorage.removeItem("ccx-preferred-node");
    }
  } catch {
    /* ignore */
  }
  try {
    const auto = sessionStorage.getItem("ccx-auto-node");
    if (auto && isBlockedDaemonUrl(auto)) {
      sessionStorage.removeItem("ccx-auto-node");
    }
  } catch {
    /* ignore */
  }
}
