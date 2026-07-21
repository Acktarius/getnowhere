/**
 * Incoming-pending stubs — 0-conf inbound not shown in lite UI yet.
 */
import type { RawWalletV1, WalletState } from "conceal-wallet-sdk";

export type IncomingPendingRecord = {
  hash: string;
  amountAtomic: number;
  createdAt: number;
};

export function readIncomingPendingRecords(
  _raw: RawWalletV1,
): IncomingPendingRecord[] {
  return [];
}

export function withIncomingPendingRecords(
  raw: RawWalletV1,
  _records: IncomingPendingRecord[],
): RawWalletV1 {
  return raw;
}

export function reconcileIncomingPending(
  before: IncomingPendingRecord[],
  _scanned: IncomingPendingRecord[],
  _state: WalletState,
  _now: number,
): IncomingPendingRecord[] {
  return before;
}
