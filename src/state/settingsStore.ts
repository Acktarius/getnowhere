import { create } from "zustand";
import { getStorage } from "@/services/storage/StorageAdapter";
import type { AccentName, AppSettings, AppTheme } from "@/types/models";

const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  accent: "teal",
  network: "mainnet",
  biometricEnabled: false,
  privacy: {
    localMessageRetention: true,
    hideBalancesByDefault: false,
    blurInAppSwitcher: false,
    autoLockTimeoutSec: 300,
    clearClipboardWarnings: true,
    advancedDebugLogging: false,
  },
};

const STORAGE_KEY = "gnh.settings";

function load(): AppSettings {
  try {
    const raw = getStorage().getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persist(s: AppSettings) {
  getStorage().setItem(STORAGE_KEY, JSON.stringify(s));
}

type SettingsStore = AppSettings & {
  setTheme: (t: AppTheme) => void;
  setAccent: (a: AccentName) => void;
  setNetwork: (n: AppSettings["network"]) => void;
  setPrivacy: (patch: Partial<AppSettings["privacy"]>) => void;
  setBiometric: (on: boolean) => void;
  reset: () => void;
};

export const useSettingsStore = create<SettingsStore>((set) => ({
  ...load(),
  setTheme: (theme) =>
    set((s) => {
      const next = { ...s, theme };
      persist(next);
      return next;
    }),
  setAccent: (accent) =>
    set((s) => {
      const next = { ...s, accent };
      persist(next);
      return next;
    }),
  setNetwork: (network) =>
    set((s) => {
      const next = { ...s, network };
      persist(next);
      return next;
    }),
  setPrivacy: (patch) =>
    set((s) => {
      const next = { ...s, privacy: { ...s.privacy, ...patch } };
      persist(next);
      return next;
    }),
  setBiometric: (biometricEnabled) =>
    set((s) => {
      const next = { ...s, biometricEnabled };
      persist(next);
      return next;
    }),
  reset: () => {
    persist(DEFAULT_SETTINGS);
    set({ ...DEFAULT_SETTINGS });
  },
}));
