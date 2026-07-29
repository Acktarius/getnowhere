/**
 * Wallet / app-data wipe helpers (disconnect → key remove → reload).
 * @see docs/architecture/web-vs-wrapper.md
 */
import { disconnect } from "@/services/conceal/sync/runtime";
import { getStorage } from "@/services/storage/StorageAdapter";

/** Keys cleared by both delete-wallet and full reset. */
export const WALLET_TIED_KEYS = [
  "wallet",
  "gnh.onboarded",
  "gnh.contacts",
  "gnh.invites",
  "gnh.pendingInitiatorKeys",
  "gnh.contacts.ready",
  "gnh.roomCatalog",
  "gnh.roomSessions",
  "gnh.revokedRooms",
] as const;

/** Adapter keys cleared only by full reset. */
export const APP_PREF_ADAPTER_KEYS = ["gnh.settings"] as const;

/** localStorage side channels cleared only by full reset. */
export const APP_PREF_LOCAL_SIDE_KEYS = [
  "ccx-preferred-node",
  "ccx-sync-timing",
  "ccx-disable-parallel-sync",
] as const;

/** sessionStorage side channels cleared only by full reset. */
export const APP_PREF_SESSION_KEYS = ["ccx-auto-node"] as const;

function removeAdapterKeys(keys: readonly string[]): void {
  const storage = getStorage();
  for (const key of keys) {
    storage.removeItem(key);
  }
}

/**
 * Remove wallet-tied persistence, keep app prefs, then reload.
 * @see docs/architecture/web-vs-wrapper.md
 */
export async function deleteWalletData(): Promise<void> {
  await disconnect();
  removeAdapterKeys(WALLET_TIED_KEYS);
  location.reload();
}

/**
 * Remove wallet-tied data plus prefs / side channels, then reload.
 * @see docs/architecture/web-vs-wrapper.md
 */
export async function resetAppData(): Promise<void> {
  await disconnect();
  removeAdapterKeys(WALLET_TIED_KEYS);
  removeAdapterKeys(APP_PREF_ADAPTER_KEYS);
  for (const key of APP_PREF_LOCAL_SIDE_KEYS) {
    localStorage.removeItem(key);
  }
  for (const key of APP_PREF_SESSION_KEYS) {
    sessionStorage.removeItem(key);
  }
  location.reload();
}
