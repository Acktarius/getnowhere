import { create } from "zustand";
import { getStorage } from "@/services/storage/StorageAdapter";
import type { AccentName, AppSettings, AppTheme } from "@/types/models";

const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  accent: "teal",
  showTips: true,
  network: "mainnet",
  appAccessBiometricEnabled: false,
  dataUnlockBiometricEnabled: false,
  privacy: {
    localMessageRetention: true,
    hideBalancesByDefault: false,
    blurInAppSwitcher: false,
    autoLockTimeoutSec: 300,
    clearClipboardWarnings: true,
    notificationsEnabled: false,
    notificationBannersEnabled: false,
    pushWakeEnabled: false,
  },
};

const STORAGE_KEY = "gnh.settings";

function migrateLegacySettings(parsed: Record<string, unknown>): AppSettings {
  const next = {
    ...DEFAULT_SETTINGS,
    ...parsed,
    privacy: {
      ...DEFAULT_SETTINGS.privacy,
      ...(parsed.privacy as Partial<AppSettings["privacy"]> | undefined),
    },
  } as AppSettings & {
    biometricEnabled?: boolean;
  };
  if (
    typeof next.biometricEnabled === "boolean" &&
    parsed.dataUnlockBiometricEnabled === undefined
  ) {
    next.dataUnlockBiometricEnabled = next.biometricEnabled;
    next.appAccessBiometricEnabled = false;
  }
  delete (next as { biometricEnabled?: boolean }).biometricEnabled;
  return next;
}

function load(): AppSettings {
  try {
    const raw = getStorage().getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return migrateLegacySettings(JSON.parse(raw) as Record<string, unknown>);
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
  setShowTips: (on: boolean) => void;
  setNetwork: (n: AppSettings["network"]) => void;
  setPrivacy: (patch: Partial<AppSettings["privacy"]>) => void;
  setAppAccessBiometric: (on: boolean) => void;
  setDataUnlockBiometric: (on: boolean) => void;
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
  setShowTips: (showTips) =>
    set((s) => {
      const next = { ...s, showTips };
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
      const privacy = { ...s.privacy, ...patch };
      if (!privacy.notificationsEnabled) {
        privacy.notificationBannersEnabled = false;
        privacy.pushWakeEnabled = false;
      }
      if (!privacy.pushWakeEnabled && s.privacy.pushWakeEnabled) {
        // Fire-and-forget: best-effort cleanup when user opts out.
        void import("@/lib/mobile/gnhMobileBridgeTypes").then(
          ({ isMobileAndroid }) => {
            if (isMobileAndroid()) {
              void import("@/lib/mobile/ntfyWakeBridge").then(
                ({ unsubscribeAll }) => unsubscribeAll(),
              );
            } else {
              void import("@/services/poke/pokeGatewayClient").then(
                ({ deletePokeHandle }) =>
                  deletePokeHandle().catch(() => undefined),
              );
            }
          },
        );
      }
      const next = { ...s, privacy };
      persist(next);
      return next;
    }),
  setAppAccessBiometric: (appAccessBiometricEnabled) =>
    set((s) => {
      const next = { ...s, appAccessBiometricEnabled };
      persist(next);
      return next;
    }),
  setDataUnlockBiometric: (dataUnlockBiometricEnabled) =>
    set((s) => {
      const next = { ...s, dataUnlockBiometricEnabled };
      persist(next);
      return next;
    }),
  reset: () => {
    persist(DEFAULT_SETTINGS);
    set({ ...DEFAULT_SETTINGS });
  },
}));
