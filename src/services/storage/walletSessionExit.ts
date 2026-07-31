/**
 * Wallet session Exit: persist blob, soft-leave swarm, clear RAM keys, welcome.
 * Transcript flush into chatRooms is deferred (task 3.2).
 * @see specs/changes/nav-exit-leave-room/design.md
 */
import { chatTransport, walletService } from "@/services";
import { persistContacts } from "@/services/contacts/contactsPersistence";
import { useAuthStore } from "@/state/authStore";
import { useContactsStore } from "@/state/contactsStore";
import { useWalletStore } from "@/state/walletStore";

export type WalletSessionExitDeps = {
  persistContacts: () => Promise<void>;
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
    softLeaveAll: () => chatTransport.softLeaveAll(),
    lockWallet: () => walletService.lockWallet(),
    clearSession: () => {
      useWalletStore.setState({
        initialized: false,
        locked: true,
        address: "",
        seedRef: "",
        seedPhrase: null,
        syncStatus: "idle",
        syncProgress: 0,
      });
      useAuthStore.getState().lock();
    },
    navigate,
  });
}
