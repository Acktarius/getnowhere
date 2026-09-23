/**
 * Wallet / app-data wipe helpers (disconnect → key remove → clear RAM → welcome reload).
 * @see docs/architecture/web-vs-wrapper.md
 */
import { clearAllMobileBiometricEnrollments } from "@/lib/auth/biometric-lifecycle";
import { disconnect } from "@/services/conceal/sync/runtime";
import type { MobileNativeStorageAdapter } from "@/services/storage/adapters/mobileNativeStorageAdapter";
import { LOGICAL_WALLET_KEY } from "@/services/storage/adapters/mobileNativeStorageAdapter";
import { getStorage } from "@/services/storage/StorageAdapter";
import { useAuthStore } from "@/state/authStore";
import { useChatStore } from "@/state/chatStore";
import { useContactsStore } from "@/state/contactsStore";
import { useNotificationStore } from "@/state/notificationStore";
import { useSettingsStore } from "@/state/settingsStore";
import { useWalletStore } from "@/state/walletStore";

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

function asMobileNative(): MobileNativeStorageAdapter | null {
  const storage = getStorage() as MobileNativeStorageAdapter;
  return typeof storage.persistWallet === "function" ? storage : null;
}

/** Logical app-level delete — not forensic erase. */
async function removeAdapterKeys(keys: readonly string[]): Promise<void> {
  const mobile = asMobileNative();
  const storage = getStorage();
  for (const key of keys) {
    if (mobile && key === LOGICAL_WALLET_KEY) {
      await mobile.removeWallet();
      continue;
    }
    storage.removeItem(key);
  }
  if (mobile) await mobile.flushPrefs();
}

/**
 * Drop in-memory session so RequireWallet / onboarding gate cannot keep serving tabs
 * if reload is delayed or blocked (e.g. some WebViews).
 */
function clearSessionRam(): void {
  useNotificationStore.getState().resetSession();
  useWalletStore.setState({
    initialized: false,
    locked: true,
    address: "",
    seedRef: "",
    seedPhrase: null,
    syncStatus: "idle",
    syncProgress: 0,
    transactions: [],
    transactionsLoading: false,
  });
  useContactsStore.setState({
    contacts: [],
    invites: [],
    hydrated: false,
  });
  useChatStore.setState({
    rooms: [],
    messagesByRoom: {},
    activeRoomId: null,
    loadingRooms: false,
  });
  useAuthStore.getState().lock();
}

/** Land HashRouter on welcome before reload so remount is not stuck on #/settings. */
function goWelcomeAndReload(): void {
  window.location.hash = "#/welcome";
  window.location.reload();
}

/**
 * Remove wallet-tied persistence, keep app prefs, clear RAM, then reload to welcome.
 * @see docs/architecture/web-vs-wrapper.md
 */
export async function deleteWalletData(): Promise<void> {
  await disconnect();
  asMobileNative()?.sealWalletWrites();
  await clearAllMobileBiometricEnrollments();
  const settings = useSettingsStore.getState();
  settings.setAppAccessBiometric(false);
  settings.setDataUnlockBiometric(false);
  await removeAdapterKeys(WALLET_TIED_KEYS);
  const { clearRoomSessionStore } = await import(
    "@/services/p2p/roomSessionStore"
  );
  clearRoomSessionStore();
  clearSessionRam();
  goWelcomeAndReload();
}

/**
 * Remove wallet-tied data plus prefs / side channels, clear RAM, then reload to welcome.
 * @see docs/architecture/web-vs-wrapper.md
 */
export async function resetAppData(): Promise<void> {
  await disconnect();
  asMobileNative()?.sealWalletWrites();
  await clearAllMobileBiometricEnrollments();
  const mobile = asMobileNative();
  if (mobile) {
    await mobile.resetAdapterOwned();
  } else {
    await removeAdapterKeys(WALLET_TIED_KEYS);
    const { clearRoomSessionStore } = await import(
      "@/services/p2p/roomSessionStore"
    );
    clearRoomSessionStore();
    await removeAdapterKeys(APP_PREF_ADAPTER_KEYS);
  }
  for (const key of APP_PREF_LOCAL_SIDE_KEYS) {
    localStorage.removeItem(key);
  }
  for (const key of APP_PREF_SESSION_KEYS) {
    sessionStorage.removeItem(key);
  }
  clearSessionRam();
  goWelcomeAndReload();
}
