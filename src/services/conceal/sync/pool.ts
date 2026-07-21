/**
 * Mempool inbound scan stub — lite wallet skips 0-conf pool enrichment.
 */
import type { IncomingPendingRecord } from "@/services/conceal/sync/incoming-pending-store";
import type { SdkMessageRecord } from "@/services/conceal/sync/messages-store";
import type { DaemonRawTransaction } from "@/services/conceal/sync/scan";

export function scanPoolForInbound(
  _poolTxs: unknown[],
  _toScan: (raw: DaemonRawTransaction) => unknown,
  _scanOutputs: unknown,
  _keys: unknown,
  _nowMs: number,
  _sentHashes: Set<string>,
): { incoming: IncomingPendingRecord[]; receivedMessages: SdkMessageRecord[] } {
  return { incoming: [], receivedMessages: [] };
}
