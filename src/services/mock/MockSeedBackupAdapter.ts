import { getInternalWalletState } from "@/services/conceal/ConcealWalletService";
import type { SeedBackupService } from "@/types/services";

let backedUp = false;

export const MockSeedBackupAdapter: SeedBackupService = {
  async revealSeed(_passcode: string) {
    const w = getInternalWalletState();
    if (!w) throw new Error("No wallet");
    return w.seedPhrase;
  },
  async confirmBackup(_passcode: string) {
    backedUp = true;
  },
  async isBackedUp() {
    return backedUp;
  },
};
