/**
 * Wallet session Exit: one wallet flush, soft-leave swarm, clear RAM, welcome.
 * @see specs/changes/nav-exit-leave-room/design.md
 * @see docs/architecture/web-vs-wrapper.md
 * @see docs/storage/mobile-durable-storage.md § Nav Exit and hung writes
 */
import { chatTransport, walletService } from "@/services";
import { getRuntime, persistRuntime } from "@/services/conceal/sync/runtime";
import {
  contactToAddressEntry,
  saveContactsToLocal,
  withAddressBook,
} from "@/services/contacts/contactsPersistence";
import { stageChatRoomsInWallet } from "@/services/p2p/HolepunchChatTransport";
import { useAuthStore } from "@/state/authStore";
import { useContactsStore } from "@/state/contactsStore";
import { useNotificationStore } from "@/state/notificationStore";
import { useWalletStore } from "@/state/walletStore";

/** Cap Exit wallet flush so a hung mobile write cannot stall Disconnecting… */
export const EXIT_WALLET_FLUSH_MS = 5_000;

/** Soft-leave is fire-and-forget on the bridge; keep a short UI budget anyway. */
export const EXIT_SOFT_LEAVE_MS = 2_000;

export type WalletSessionExitDeps = {
  /** Contacts local + one encrypted wallet write (contacts ± chat rooms). */
  flushWallet: () => Promise<void>;
  softLeaveAll: () => Promise<void>;
  lockWallet: () => Promise<void>;
  clearSession: () => void;
  navigate: (path: string) => void;
  flushBudgetMs?: number;
  softLeaveBudgetMs?: number;
};

/** Resolve or give up after `ms` (in-flight work may continue). */
export function withBudget(promise: Promise<void>, ms: number): Promise<void> {
  return Promise.race([
    promise.then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    }),
  ]);
}

/**
 * Local contacts always; when unlocked, one encrypt+write with addressBook
 * and (if retention on) staged chatRooms.
 */
export async function persistWalletForExit(): Promise<void> {
  const contacts = useContactsStore.getState().contacts;
  saveContactsToLocal(contacts);
  const rt = getRuntime();
  if (!rt) return;
  rt.raw = withAddressBook(rt.raw, contacts.map(contactToAddressEntry));
  stageChatRoomsInWallet();
  await persistRuntime(rt);
}

/** Run Confirm-disconnect Exit sequence (injectable for tests). */
export async function walletSessionExit(
  deps: WalletSessionExitDeps,
): Promise<void> {
  await withBudget(
    deps.flushWallet(),
    deps.flushBudgetMs ?? EXIT_WALLET_FLUSH_MS,
  );
  await withBudget(
    deps.softLeaveAll(),
    deps.softLeaveBudgetMs ?? EXIT_SOFT_LEAVE_MS,
  );
  await deps.lockWallet();
  deps.clearSession();
  deps.navigate("/welcome");
}

/** Production Exit wiring for BottomNav confirm. */
export async function runWalletSessionExit(
  navigate: (path: string) => void,
): Promise<void> {
  await walletSessionExit({
    flushWallet: () => persistWalletForExit(),
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
