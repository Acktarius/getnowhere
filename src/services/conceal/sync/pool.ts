/**
 * Mempool inbound scan — 0-conf owned outputs + smart-message reconstruction.
 * @see docs/features/lite-wallet.md
 */

import type { transactions as txns, WalletKeys } from "conceal-wallet-sdk";
import type { IncomingPendingRecord } from "@/services/conceal/sync/incoming-pending-store";
import {
  reconstructReceivedMessage,
  type SdkMessageRecord,
} from "@/services/conceal/sync/messages-store";
import type { DaemonRawTransaction } from "@/services/conceal/sync/scan";

type ToScan = (raw: DaemonRawTransaction) => txns.RawTransaction | null;
type ScanOutputs = (
  tx: txns.RawTransaction,
  keys: WalletKeys,
) => Array<{ amount: number }>;

/** Cap the per-poll scan so a mempool spike can't stall the sync (each tx = one WASM scan). */
const MAX_POOL_SCAN = 200;

/**
 * Scan daemon mempool slots for outputs/messages owned by this wallet.
 * Message bodies with blockHeight 0 surface before mine; contacts adapter still
 * requires a known paymentIdFrom before treating chat.create as an invite.
 */
export function scanPoolForInbound(
  poolTxs: unknown[],
  toScan: ToScan,
  scanOutputs: ScanOutputs,
  keys: WalletKeys,
  nowMs: number,
  sentHashes: Set<string>,
): { incoming: IncomingPendingRecord[]; receivedMessages: SdkMessageRecord[] } {
  const incoming: IncomingPendingRecord[] = [];
  const receivedMessages: SdkMessageRecord[] = [];
  const seen = new Set<string>();

  for (const slot of poolTxs.slice(0, MAX_POOL_SCAN)) {
    if (!slot || typeof slot !== "object") continue;
    const raw = slot as DaemonRawTransaction;
    const scanTx = toScan(raw);
    if (!scanTx) continue;

    const hash =
      (typeof scanTx.hash === "string" && scanTx.hash) ||
      (typeof raw.hash === "string" ? raw.hash : "");
    if (!hash || seen.has(hash) || sentHashes.has(hash)) continue;
    seen.add(hash);

    try {
      const owned = scanOutputs(scanTx, keys);
      const amountAtomic = owned.reduce(
        (sum, out) => sum + (typeof out.amount === "number" ? out.amount : 0),
        0,
      );
      if (amountAtomic > 0) {
        incoming.push({
          hash,
          amountAtomic,
          createdAt: nowMs,
        });
      }
    } catch {
      /* skip bad pool slot for outputs */
    }

    try {
      // Force height 0 so reconstruct marks mempool (daemon may omit height).
      const poolScanTx = { ...scanTx, height: 0 } as txns.RawTransaction;
      const inbound = reconstructReceivedMessage(poolScanTx, keys, {
        sentHashes,
        timestamp:
          typeof raw.timestamp === "number" && raw.timestamp > 0
            ? raw.timestamp
            : Math.floor(nowMs / 1000),
      });
      if (inbound) {
        receivedMessages.push({ ...inbound, blockHeight: 0 });
      }
    } catch {
      /* skip bad pool slot for messages */
    }
  }

  return { incoming, receivedMessages };
}
