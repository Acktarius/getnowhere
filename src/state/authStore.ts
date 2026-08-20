import { create } from "zustand";
import { PasskeyError } from "@/lib/auth/passkey-error";
import { completeAppAccessUnlock } from "@/lib/mobile/completeAppAccessUnlock";
import { getStorage } from "@/services/storage/StorageAdapter";

/** App-access unlock state (biometric gate — not wallet data). */

type AuthStore = {
  unlocked: boolean;
  busy: boolean;
  error: string | null;
  init: () => Promise<void>;
  unlockViaBiometric: () => Promise<boolean>;
  lock: () => void;
};

const ONBOARDED_KEY = "gnh.onboarded";
const BIOMETRIC_UNLOCK_TIMEOUT_MS = 45_000;

export const useAuthStore = create<AuthStore>((set) => ({
  unlocked: true,
  busy: false,
  error: null,

  async init() {
    // Do not reset `unlocked` — mobile app-access lock owns that flag when enabled.
    set({ error: null });
  },

  async unlockViaBiometric() {
    set({ busy: true, error: null });
    try {
      const { unlockAppAccessBiometric } = await import(
        "@/lib/mobile/app-access-biometric"
      );
      await Promise.race([
        unlockAppAccessBiometric(),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              new PasskeyError(
                "failed",
                "Biometric unlock timed out — tap Require biometrics to try again.",
              ),
            );
          }, BIOMETRIC_UNLOCK_TIMEOUT_MS);
        }),
      ]);
      completeAppAccessUnlock();
      set({ unlocked: true, busy: false });
      return true;
    } catch (e) {
      const message =
        e instanceof PasskeyError ? e.message : (e as Error).message;
      set({ busy: false, error: message });
      return false;
    }
  },

  lock() {
    set({ unlocked: false, error: null });
  },
}));

export function isOnboarded(): boolean {
  return getStorage().getItem(ONBOARDED_KEY) === "1";
}

/** Mark onboarding complete (e.g. after wallet import or open). */
export function markOnboarded() {
  getStorage().setItem(ONBOARDED_KEY, "1");
}

export function clearOnboarded() {
  getStorage().removeItem(ONBOARDED_KEY);
}
