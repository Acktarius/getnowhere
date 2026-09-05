/**
 * Wallet session Exit: save wallet (optional chat), soft-leave swarm, clear RAM, welcome.
 * @see specs/changes/nav-exit-leave-room/design.md
 */
import { chatTransport, walletService } from "@/services";
import { persistContacts } from "@/services/contacts/contactsPersistence";
import { saveChatRoomsToWallet } from "@/services/p2p/HolepunchChatTransport";
import { useAuthStore } from "@/state/authStore";
import { useContactsStore } from "@/state/contactsStore";
import { useNotificationStore } from "@/state/notificationStore";
import { useWalletStore } from "@/state/walletStore";

export type WalletSessionExitDeps = {
  persistContacts: () => Promise<void>;
  /** When set, save room messages into the encrypted wallet blob before soft-leave. */
  saveChatRooms?: () => Promise<void>;
  softLeaveAll: () => Promise<void>;
  lockWallet: () => Promise<void>;
  clearSession: () => void;
  navigate: (path: string) => void;
};

/** Run Confirm-disconnect Exit sequence (injectable for tests). */
export async function walletSessionExit(
  deps: WalletSessionExitDeps,
): Promise<void> {
  await deps.persistContacts();
  if (deps.saveChatRooms) {
    await deps.saveChatRooms();
  }
  await deps.softLeaveAll();
  await deps.lockWallet();
  deps.clearSession();
  deps.navigate("/welcome");
}

/** Production Exit wiring for BottomNav confirm. */
export async function runWalletSessionExit(
  navigate: (path: string) => void,
): Promise<void> {
  await walletSessionExit({
    persistContacts: async () => {
      await persistContacts(useContactsStore.getState().contacts);
    },
    saveChatRooms: () => saveChatRoomsToWallet(),
    softLeaveAll: () => chatTransport.softLeaveAll(),
    lockWallet: () => walletService.lockWallet(),
    clearSession: () => {
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
      useAuthStore.getState().lock();
      void import("@/lib/mobile/walletSessionBridge").then((m) => {
        m.clearNativeWalletSession();
      });
    },
    navigate,
  });
}
