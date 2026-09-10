/**
 * Wallet / app-data wipe helpers (disconnect → key remove → clear RAM → welcome reload).
 * @see docs/architecture/web-vs-wrapper.md
 */
import { clearAllMobileBiometricEnrollments } from "@/lib/auth/biometric-lifecycle";
import { disconnect } from "@/services/conceal/sync/runtime";
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

function removeAdapterKeys(keys: readonly string[]): void {
  const storage = getStorage();
  for (const key of keys) {
    storage.removeItem(key);
  }
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
  await clearAllMobileBiometricEnrollments();
  const settings = useSettingsStore.getState();
  settings.setAppAccessBiometric(false);
  settings.setDataUnlockBiometric(false);
  removeAdapterKeys(WALLET_TIED_KEYS);
  clearSessionRam();
  goWelcomeAndReload();
}

/**
 * Remove wallet-tied data plus prefs / side channels, clear RAM, then reload to welcome.
 * @see docs/architecture/web-vs-wrapper.md
 */
export async function resetAppData(): Promise<void> {
  await disconnect();
  await clearAllMobileBiometricEnrollments();
  removeAdapterKeys(WALLET_TIED_KEYS);
  removeAdapterKeys(APP_PREF_ADAPTER_KEYS);
  for (const key of APP_PREF_LOCAL_SIDE_KEYS) {
    localStorage.removeItem(key);
  }
  for (const key of APP_PREF_SESSION_KEYS) {
    sessionStorage.removeItem(key);
  }
  clearSessionRam();
  goWelcomeAndReload();
}
