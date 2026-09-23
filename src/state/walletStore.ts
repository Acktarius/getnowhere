import { create } from "zustand";
import { walletService } from "@/services";
import {
  clearSeedPhraseMemory,
  getInternalWalletNodeUrl,
  setInternalWalletNetwork,
  setInternalWalletNodeUrl,
} from "@/services/conceal/ConcealWalletService";
import { wipeWalletScopedLocalData } from "@/services/contacts/contactsPersistence";
import {
  hydrateRoomSessions,
  lockRoomSessionMemory,
} from "@/services/p2p/roomSessionStore";
import { useContactsStore } from "@/state/contactsStore";
import type { Transaction, WalletState } from "@/types/models";
import type { ImportWalletInput } from "@/types/services";

/** Reset contacts + chat in RAM so no stale data leaks into the new wallet session. */
function resetContactsAndChatRam(): void {
  useContactsStore.setState({ contacts: [], invites: [], hydrated: false });
  // Lazy import avoids a chatStore → walletStore circular dep.
  void import("@/state/chatStore").then((m) => {
    m.useChatStore.setState({
      rooms: [],
      messagesByRoom: {},
      activeRoomId: null,
      loadingRooms: false,
    });
  });
}

type WalletStore = WalletState & {
  seedPhrase: string | null; // held only in-memory, never persisted to disk
  initializing: boolean;
  error: string | null;
  /** Cached tx history — survives tab unmounts (mobile WebView perf). */
  transactions: Transaction[];
  transactionsLoading: boolean;
  /** Set on encrypted file import; consumed once for room replay. */
  pendingFileImportRoomRestore: boolean;
  /** Returns true once after file import, then clears the flag. */
  takeFileImportRoomRestore: () => boolean;
  createWallet: (password: string) => Promise<{ seedPhrase: string }>;
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
  transactions: [],
  transactionsLoading: false,
  pendingFileImportRoomRestore: false,

  takeFileImportRoomRestore() {
    const pending = get().pendingFileImportRoomRestore;
    if (pending) set({ pendingFileImportRoomRestore: false });
    return pending;
  },

  async createWallet(password) {
    set({ initializing: true, error: null });
    try {
      const res = await walletService.createWallet(password);
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
      await get().refreshTransactions();
      // Erase any previous wallet's contacts/rooms before loading the new identity.
      wipeWalletScopedLocalData();
      resetContactsAndChatRam();
      await useContactsStore.getState().hydrate();
      await hydrateRoomSessions();
      return { seedPhrase: res.seedPhrase };
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
      // Erase any previous wallet's contacts/rooms. File import re-populates
      // from the wallet blob; seed/key/QR import starts with an empty addressBook.
      wipeWalletScopedLocalData();
      resetContactsAndChatRam();
      await useContactsStore.getState().hydrate();
      await hydrateRoomSessions();
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
      await hydrateRoomSessions();
      const { hydrateChatRoomsFromWallet } = await import(
        "@/services/p2p/HolepunchChatTransport"
      );
      hydrateChatRoomsFromWallet();
      // Enter app immediately; live sync + resync catch tip in background.
      void get().resync();
      void useContactsStore.getState().refreshInvites();
      void import("@/lib/mobile/walletSessionBridge").then((m) => {
        m.keepNativeWalletSession(password);
      });
    } catch (e) {
      set({ initializing: false, error: (e as Error).message });
      throw e;
    }
  },

  async lock() {
    await walletService.lockWallet();
    lockRoomSessionMemory();
    set({ locked: true });
    void import("@/lib/mobile/walletSessionBridge").then((m) => {
      m.clearNativeWalletSession();
    });
  },
  async unlock() {
    await walletService.unlockWallet("");
    set({ locked: false });
    await useContactsStore.getState().hydrate();
    await hydrateRoomSessions();
    const { hydrateChatRoomsFromWallet } = await import(
      "@/services/p2p/HolepunchChatTransport"
    );
    hydrateChatRoomsFromWallet();
    void useContactsStore.getState().refreshInvites();
  },

  async refreshBalance() {
    // One snapshot read → balance + history in the same setState (pre-Zustand
    // WalletScreen re-fetched txs whenever balanceTotal changed; keep that coupling).
    const b = await walletService.getBalance();
    const txs = await walletService.getTransactions();
    set({
      balanceTotal: b.total,
      balanceAvailable: b.available,
      balancePending: b.pending,
      transactions: txs,
      transactionsLoading: false,
    });
  },

  async refreshTransactions() {
    if (!get().initialized) return;
    const hadTx = get().transactions.length > 0;
    if (!hadTx) set({ transactionsLoading: true });
    try {
      const txs = await walletService.getTransactions();
      set({ transactions: txs, transactionsLoading: false });
    } catch {
      set({ transactionsLoading: false });
    }
  },

  async send(input) {
    await walletService.sendTransaction(input);
    await get().refreshBalance();
    await get().refreshTransactions();
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
      await get().refreshTransactions();
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
      await get().refreshTransactions();
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
      await get().refreshTransactions();
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
    clearSeedPhraseMemory();
    set({ seedPhrase: null });
  },
}));
