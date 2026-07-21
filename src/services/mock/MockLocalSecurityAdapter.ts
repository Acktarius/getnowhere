import type { LocalSecurityService } from "@/types/services";

// Conceptual local security. A real build would use the platform keystore.
let storedPasscode: string | null = null;

export const MockLocalSecurityAdapter: LocalSecurityService = {
  async setPasscode(passcode: string) {
    storedPasscode = passcode;
  },
  async verifyPasscode(passcode: string) {
    return storedPasscode !== null && storedPasscode === passcode;
  },
  async changePasscode(oldPasscode, newPasscode) {
    if (storedPasscode !== oldPasscode) return false;
    storedPasscode = newPasscode;
    return true;
  },
  async isPasscodeSet() {
    return storedPasscode !== null;
  },
};
