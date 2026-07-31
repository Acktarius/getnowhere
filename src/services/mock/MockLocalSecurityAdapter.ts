import type { LocalSecurityService } from "@/types/services";
import { getStorage } from "@/services/storage/StorageAdapter";

const PASSCODE_KEY = "gnh.appPasscode";

function readStored(): string | null {
  return getStorage().getItem(PASSCODE_KEY);
}

/** App unlock passcode via StorageAdapter (dev; native keystore later). */
export const MockLocalSecurityAdapter: LocalSecurityService = {
  async setPasscode(passcode: string) {
    getStorage().setItem(PASSCODE_KEY, passcode);
  },
  async verifyPasscode(passcode: string) {
    const stored = readStored();
    return stored !== null && stored === passcode;
  },
  async changePasscode(oldPasscode, newPasscode) {
    if (readStored() !== oldPasscode) return false;
    getStorage().setItem(PASSCODE_KEY, newPasscode);
    return true;
  },
  async isPasscodeSet() {
    return readStored() !== null;
  },
};
