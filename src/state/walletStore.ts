import { create } from "zustand";
import { walletService } from "@/services";
import { setInternalWalletNetwork } from "@/services/mock/MockWalletAdapter";
import type { WalletState } from "@/types/models";
import type { ImportWalletInput } from "@/types/services";

type WalletStore = WalletState & {
  seedPhrase: string | null; // held only in-memory, never persisted to disk
  initializing: boolean;
  error: string | null;
  createWallet: () => Promise<{ seedPhrase: string }>;
  restoreWallet: (seed: string) => Promise<void>;
  importWallet: (input: ImportWalletInput) => Promise<void>;
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
  setNetwork: (n: WalletState["network"]) => void;
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
        syncStatus: "idle",
        initializing: false,
      });
      await get().resync();
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
        syncStatus: "idle",
        initializing: false,
      });
      await get().resync();
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
    set({ syncStatus: "syncing", syncProgress: 0.05, lastSyncError: undefined });
    try {
      await walletService.resync();
      set({
        syncStatus: "synced",
        syncProgress: 1,
        lastSyncedAt: new Date().toISOString(),
        lastSyncError: undefined,
      });
      await get().refreshBalance();
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

  setNetwork(n) {
    setInternalWalletNetwork(n);
    set({ network: n });
  },

  clearSeed() {
    set({ seedPhrase: null });
  },
}));
