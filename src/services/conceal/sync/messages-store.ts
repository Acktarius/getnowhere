/**
 * Messages-store stubs for lite wallet — sync folds without rebuilding smart-message history.
 * Keeps runtime.ts sync path compiling; getnowhere chat uses a separate P2P layer.
 */
import type { RawWalletV1, WalletKeys, WalletState } from "conceal-wallet-sdk";
import type { DaemonRawTransaction } from "@/services/conceal/sync/scan";

export type SdkMessageRecord = {
  id: string;
  body: string;
  blockHeight: number;
  timestamp?: number;
};

export function readSentRecords(_raw: RawWalletV1): SdkMessageRecord[] {
  return [];
}

export function readReceivedRecords(_raw: RawWalletV1): SdkMessageRecord[] {
  return [];
}

export function withReceivedRecords(
  raw: RawWalletV1,
  _records: SdkMessageRecord[],
): RawWalletV1 {
  return raw;
}

export function withSentRecords(
  raw: RawWalletV1,
  _records: SdkMessageRecord[],
): RawWalletV1 {
  return raw;
}

export function applyInboundScanToReceived(
  _map: Map<string, SdkMessageRecord>,
  _txHash: string,
  _inbound: SdkMessageRecord,
): boolean {
  return false;
}

export function reconstructReceivedMessage(
  _scanTx: unknown,
  _keys: WalletKeys,
  _opts?: { sentHashes?: Set<string>; timestamp?: number },
): SdkMessageRecord | null {
  return null;
}

export function patchSentMessageBlockHeights(
  records: SdkMessageRecord[],
  _heights: Map<string, number>,
): { records: SdkMessageRecord[]; changed: boolean } {
  return { records, changed: false };
}

export function minedHeightsFromState(state: WalletState): Map<string, number> {
  const map = new Map<string, number>();
  for (const tx of state.transactions) {
    if (tx.hash) map.set(tx.hash, tx.height ?? 0);
  }
  return map;
}

export function pruneStaleMempoolReceived(
  records: SdkMessageRecord[],
  _active: Set<string>,
  _mined: Set<string>,
): SdkMessageRecord[] {
  return records;
}

export function dropExpiredTtl(
  raw: RawWalletV1,
  _nowSec: number,
): { raw: RawWalletV1; changed: boolean } {
  return { raw, changed: false };
}

export function clearReceivedRecords(raw: RawWalletV1): RawWalletV1 {
  return raw;
}

/** Unused in stubs — kept for pool.ts typing. */
export type _DaemonRaw = DaemonRawTransaction;
