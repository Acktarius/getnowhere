/**
 * Mid-sync history publish: throttled Zustand push after each fold batch.
 * Keeps WalletScreen live during deep catch-up without requiring manual resync.
 * Dynamic import of walletStore breaks the runtime→store→service→runtime chain.
 * @see docs/features/lite-wallet.md
 */
import {
  type RawWalletV1,
  getTransactions as sdkGetTransactions,
} from "conceal-wallet-sdk";
import { mapWalletTransactions } from "@/services/conceal/mapWalletTransactions";
import {
  type SdkMessageRecord,
  withReceivedRecords,
} from "@/services/conceal/sync/messages-store";
import type { SdkRuntime } from "@/services/conceal/sync/runtime";

/** Leading+trailing throttle interval (phone-friendly; matches refresh cadence). */
const THROTTLE_MS = 1500;

/** True when the batch warrants a history publish (relay-only or tx-fold path). */
export function shouldPublishHistory(
  foldedThisBatch: boolean,
  receivedChangedThisBatch: boolean,
): boolean {
  return foldedThisBatch || receivedChangedThisBatch;
}

/**
 * Return `raw` updated with current received records when `receivedChangedThisBatch`
 * so `publishNow` reads relay records that arrived mid-sync. Idempotent: calling
 * again at end-of-sync with the same records writes the same data.
 */
export function prepareRawForHistoryPublish(
  raw: RawWalletV1,
  received: Map<string, SdkMessageRecord>,
  receivedChangedThisBatch: boolean,
): RawWalletV1 {
  if (!receivedChangedThisBatch) return raw;
  return withReceivedRecords(raw, [...received.values()]);
}

/**
 * Returns a throttled wrapper that fires `fn` immediately on the first call
 * (leading edge), then once more at the trailing edge if further calls arrived
 * within the window. Subsequent leading calls are accepted only after the
 * window expires.
 */
export function makeLeadingTrailingThrottle<T>(
  fn: (arg: T) => void,
  ms: number,
): (arg: T) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let next: { arg: T } | null = null;
  return (arg: T): void => {
    if (timer === null) {
      fn(arg);
      timer = setTimeout(() => {
        const pending = next;
        timer = null;
        next = null;
        if (pending) fn(pending.arg);
      }, ms);
    } else {
      next = { arg };
    }
  };
}

function publishNow(rt: SdkRuntime): void {
  void import("@/state/walletStore").then(({ useWalletStore }) => {
    if (!useWalletStore.getState().initialized) return;
    const transactions = mapWalletTransactions(
      sdkGetTransactions(rt.state),
      rt.raw,
    ).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    useWalletStore.setState({ transactions, transactionsLoading: false });
  });
}

const throttledPublish = makeLeadingTrailingThrottle(publishNow, THROTTLE_MS);

/**
 * Call after a fold batch produces new transactions. Throttled so a deep sync
 * with hundreds of batches pushes at most one leading + one trailing update per
 * 1.5 s to Zustand — no double-loading flicker against `refreshTransactions`.
 */
export function notifyHistoryPossiblyChanged(rt: SdkRuntime): void {
  throttledPublish(rt);
}
