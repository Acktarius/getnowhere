/**
 * App-specific config (not chain consensus).
 * Daemon defaults aligned with conceal-next-wallet for sync/node parity.
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

/** Default (public) daemon nodes — preferred order matches next-wallet, plus extras. */
export const DEFAULT_DAEMON_NODES = [
  "https://explorer.conceal.network/daemon/",
  "https://ccxapi.conceal.network/daemon/",
  "https://daemon.conceal.network/",
  "https://concealx.net/daemon/",
] as const;
