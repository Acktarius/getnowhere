/// <reference lib="webworker" />
/**
 * Scan Web Worker: runs the per-tx ECDH scan ({@link scanRawTransaction}) off the main thread so a
 * deep sync's fold parallelizes across CPU cores. It does ONLY the read-only, state-independent
 * scan — the result is byte-identical to an in-thread scan (same WASM, same inputs) — and the
 * main thread applies the results sequentially. WASM is initialized per worker via `ensureSdkReady`.
 */
import type { WalletKeys } from "conceal-wallet-sdk";
import { ensureSdkReady } from "@/services/conceal/sync/ready";
import {
  type DaemonRawTransaction,
  type RawScanResult,
  scanRawTransaction,
} from "@/services/conceal/sync/scan";

interface ScanRequest {
  id: number;
  rawTxs: DaemonRawTransaction[];
  keys: WalletKeys;
}

export interface ScanResponse {
  id: number;
  results?: (RawScanResult | null)[];
  error?: string;
}

const ctx = self as unknown as Worker;

ctx.addEventListener("message", async (event: MessageEvent<ScanRequest>) => {
  const { id, rawTxs, keys } = event.data;
  try {
    await ensureSdkReady();
    const results = rawTxs.map((tx) => scanRawTransaction(tx, keys));
    ctx.postMessage({ id, results } satisfies ScanResponse);
  } catch (error) {
    // Report the failure (matched by id) so the pool falls back to an in-thread scan for this chunk.
    ctx.postMessage({ id, error: String(error) } satisfies ScanResponse);
  }
});
