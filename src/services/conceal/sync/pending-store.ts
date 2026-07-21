/**
 * Pending outbound stubs — lite wallet persists sends via post-send sync only.
 */
import type { RawWalletV1, WalletState } from "conceal-wallet-sdk";

export type PendingRecord = {
  hash: string;
  amountAtomic: number;
  createdAt: number;
};

export function readPendingRecords(_raw: RawWalletV1): PendingRecord[] {
  return [];
}

export function withPendingRecords(
  raw: RawWalletV1,
  _records: PendingRecord[],
): RawWalletV1 {
  return raw;
}

export function prunePendingRecords(
  _raw: RawWalletV1,
  _state: WalletState,
  _now: number,
): PendingRecord[] {
  return [];
}

export function pendingSpentKeyImages(_raw: RawWalletV1): Set<string> {
  return new Set();
}
