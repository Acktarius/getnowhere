import { create } from "zustand";
import { walletService } from "@/services";
import {
  getInternalWalletNodeUrl,
  setInternalWalletNetwork,
  setInternalWalletNodeUrl,
} from "@/services/conceal/ConcealWalletService";
import { useContactsStore } from "@/state/contactsStore";
import type { WalletState } from "@/types/models";
import type { ImportWalletInput } from "@/types/services";

type WalletStore = WalletState & {
  seedPhrase: string | null; // held only in-memory, never persisted to disk
  initializing: boolean;
  error: string | null;
  /** Set on encrypted file import; consumed once for room replay. */
  pendingFileImportRoomRestore: boolean;
  /** Returns true once after file import, then clears the flag. */
  takeFileImportRoomRestore: () => boolean;
  createWallet: () => Promise<{ seedPhrase: string }>;
  restoreWallet: (seed: string) => Promise<void>;
  importWallet: (input: ImportWalletInput) => Promise<void>;
  /** Open a wallet already stored on this device (encryption password). */
  openStoredWallet: (password: string) => Promise<void>;
  hasStoredWallet: () => Promise<boolean>;
  lock: () => Promise<void>;
  unlock: (passcode: string) => Promise<void>;
  refreshBalance: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  send: (input: {
    toAddress: string;
    amount: number;
    paymentId?: string;
  }) => Promise<void>;
  resync: () => Promise<void>;
  resyncFromCreationHeight: () => Promise<void>;
  resetAndRescanFromCreationHeight: () => Promise<void>;
  setNetwork: (n: WalletState["network"]) => void;
  setNode: (url: string) => void;
  getNode: () => string;
  clearSeed: () => void;
};

const initial: WalletState = {
  initialized: false,
  locked: false,
  address: "",
  seedRef: "",
  balanceTotal: 0,
  balanceAvailable: 0,
  balancePending: 0,
  syncStatus: "idle",
  syncProgress: 0,
  network: "mainnet",
};

export const useWalletStore = create<WalletStore>((set, get) => ({
  ...initial,
  seedPhrase: null,
  initializing: false,
  error: null,
  pendingFileImportRoomRestore: false,

  takeFileImportRoomRestore() {
    const pending = get().pendingFileImportRoomRestore;
    if (pending) set({ pendingFileImportRoomRestore: false });
    return pending;
  },

  async createWallet() {
    set({ initializing: true, error: null });
    try {
      const res = await walletService.createWallet();
      const addr = await walletService.getAddress();
      set({
        initialized: true,
        locked: false,
        address: addr,
        seedRef: res.seedRef,
        seedPhrase: res.seedPhrase,
        syncStatus: "synced",
        lastSyncedAt: new Date().toISOString(),
        initializing: false,
      });
      await get().refreshBalance();
      await useContactsStore.getState().hydrate();
      return { seedPhrase: res.seedPhrase };
    } catch (e) {
      set({ initializing: false, error: (e as Error).message });
      throw e;
    }
  },

  async restoreWallet(seed) {
    set({ initializing: true, error: null });
    try {
      const res = await walletService.restoreWallet({ seedPhrase: seed });
      const addr = await walletService.getAddress();
      set({
        initialized: true,
        locked: false,
        address: addr,
        seedRef: res.seedRef,
        seedPhrase: res.seedPhrase,
        syncStatus: "syncing",
        syncProgress: 0.05,
        initializing: false,
      });
      await useContactsStore.getState().hydrate();
      // Tip catch-up in background — UI (L2 chat) must not wait.
      void get().resync();
    } catch (e) {
      set({ initializing: false, error: (e as Error).message });
      throw e;
    }
  },

  async importWallet(input) {
    set({ initializing: true, error: null });
    try {
      const res = await walletService.importWallet(input);
      const addr = await walletService.getAddress();
      set({
        initialized: true,
        locked: false,
        address: addr,
        seedRef: res.seedRef,
        seedPhrase: res.seedPhrase,
        syncStatus: "syncing",
        syncProgress: 0.05,
        initializing: false,
      });
      if (input.method === "file") {
        set({ pendingFileImportRoomRestore: true });
      }
      await useContactsStore.getState().hydrate();
      void get().resync();
      if (input.method === "file") {
        void useContactsStore.getState().refreshInvites();
      }
    } catch (e) {
      set({ initializing: false, error: (e as Error).message });
      throw e;
    }
  },

  async hasStoredWallet() {
    return walletService.hasStoredWallet();
  },

  async openStoredWallet(password) {
    set({ initializing: true, error: null });
    try {
      await walletService.unlockWallet(password);
      const addr = await walletService.getAddress();
      set({
        initialized: true,
        locked: false,
        address: addr,
        seedRef: "",
        seedPhrase: null,
        syncStatus: "syncing",
        syncProgress: 0.05,
        initializing: false,
      });
      await useContactsStore.getState().hydrate();
      const { hydrateChatRoomsFromWallet } = await import(
        "@/services/p2p/HolepunchChatTransport"
      );
      hydrateChatRoomsFromWallet();
      // Enter app immediately; live sync + resync catch tip in background.
      void get().resync();
      void useContactsStore.getState().refreshInvites();
    } catch (e) {
      set({ initializing: false, error: (e as Error).message });
      throw e;
    }
  },

  async lock() {
    await walletService.lockWallet();
    set({ locked: true });
  },
  async unlock() {
    await walletService.unlockWallet("");
    set({ locked: false });
    await useContactsStore.getState().hydrate();
    const { hydrateChatRoomsFromWallet } = await import(
      "@/services/p2p/HolepunchChatTransport"
    );
    hydrateChatRoomsFromWallet();
    void useContactsStore.getState().refreshInvites();
  },

  async refreshBalance() {
    const b = await walletService.getBalance();
    set({
      balanceTotal: b.total,
      balanceAvailable: b.available,
      balancePending: b.pending,
    });
  },

  async refreshTransactions() {
    // transactions handled in wallet view via direct service call
  },

  async send(input) {
    await walletService.sendTransaction(input);
    await get().refreshBalance();
  },

  async resync() {
    set({
      syncStatus: "syncing",
      syncProgress: 0.05,
      lastSyncError: undefined,
    });
    try {
      await walletService.resync();
      set({
        syncStatus: "synced",
        syncProgress: 1,
        lastSyncedAt: new Date().toISOString(),
        lastSyncError: undefined,
      });
      await get().refreshBalance();
      void useContactsStore.getState().refreshInvites();
    } catch (error) {
      // Daemon unreachable or sync error — don't block the wallet flow.
      // Surface the message so the user can diagnose (CORS, node down, etc).
      set({
        syncStatus: "error",
        syncProgress: 0,
        lastSyncError: (error as Error)?.message ?? String(error),
      });
    }
  },

  async resyncFromCreationHeight() {
    set({
      syncStatus: "syncing",
      syncProgress: 0.05,
      lastSyncError: undefined,
    });
    try {
      await walletService.resyncFromCreationHeight();
      set({
        syncStatus: "synced",
        syncProgress: 1,
        lastSyncedAt: new Date().toISOString(),
        lastSyncError: undefined,
      });
      await get().refreshBalance();
      void useContactsStore.getState().refreshInvites();
    } catch (error) {
      set({
        syncStatus: "error",
        syncProgress: 0,
        lastSyncError: (error as Error)?.message ?? String(error),
      });
      throw error;
    }
  },

  async resetAndRescanFromCreationHeight() {
    set({
      syncStatus: "syncing",
      syncProgress: 0.05,
      lastSyncError: undefined,
    });
    try {
      await walletService.resetAndRescanFromCreationHeight();
      set({
        syncStatus: "synced",
        syncProgress: 1,
        lastSyncedAt: new Date().toISOString(),
        lastSyncError: undefined,
      });
      await get().refreshBalance();
      void useContactsStore.getState().refreshInvites();
    } catch (error) {
      set({
        syncStatus: "error",
        syncProgress: 0,
        lastSyncError: (error as Error)?.message ?? String(error),
      });
      throw error;
    }
  },

  setNetwork(n) {
    setInternalWalletNetwork(n);
    set({ network: n });
  },

  setNode(url) {
    setInternalWalletNodeUrl(url);
    set({});
  },

  getNode() {
    return getInternalWalletNodeUrl();
  },

  clearSeed() {
    set({ seedPhrase: null });
  },
}));
