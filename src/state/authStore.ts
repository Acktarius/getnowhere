import { create } from "zustand";
import { localSecurityService } from "@/services";
import { getStorage } from "@/services/storage/StorageAdapter";

// Tracks app-level unlock state and whether onboarding has completed.
// Wallet initialization is tracked in walletStore; this store is about
// app entry gating (passcode / unlock).

type AuthStore = {
  passcodeSet: boolean;
  unlocked: boolean;
  busy: boolean;
  error: string | null;
  init: () => Promise<void>;
  setPasscode: (code: string) => Promise<void>;
  verify: (code: string) => Promise<boolean>;
  lock: () => void;
};

const ONBOARDED_KEY = "gnh.onboarded";

export const useAuthStore = create<AuthStore>((set) => ({
  passcodeSet: false,
  unlocked: false,
  busy: false,
  error: null,

  async init() {
    const set1 = await localSecurityService.isPasscodeSet();
    set({ passcodeSet: set1, unlocked: !set1 });
  },

  async setPasscode(code) {
    set({ busy: true, error: null });
    try {
      await localSecurityService.setPasscode(code);
      getStorage().setItem(ONBOARDED_KEY, "1");
      set({ passcodeSet: true, unlocked: true, busy: false });
    } catch (e) {
      set({ busy: false, error: (e as Error).message });
      throw e;
    }
  },

  async verify(code) {
    set({ busy: true, error: null });
    try {
      const ok = await localSecurityService.verifyPasscode(code);
      if (ok) set({ unlocked: true, busy: false });
      else set({ busy: false, error: "Incorrect passcode" });
      return ok;
    } catch (e) {
      set({ busy: false, error: (e as Error).message });
      return false;
    }
  },

  lock() {
    set({ unlocked: false });
  },
}));

export function isOnboarded(): boolean {
  return getStorage().getItem(ONBOARDED_KEY) === "1";
}

/** Mark onboarding complete without setting an app passcode (e.g. after wallet import). */
export function markOnboarded() {
  getStorage().setItem(ONBOARDED_KEY, "1");
}

export function clearOnboarded() {
  getStorage().removeItem(ONBOARDED_KEY);
}
