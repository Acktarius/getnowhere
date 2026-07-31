import type { SeedBackupService } from "@/types/services";

let backedUp = false;

/** Dev/test stub — prefer SeedBackupAdapter in product wiring. */
export const MockSeedBackupAdapter: SeedBackupService = {
  async revealSecrets(_password: string) {
    return {
      address: "",
      mnemonic: "abandon ability able about above absent",
      spendKey: "aa".repeat(32),
      viewKey: "bb".repeat(32),
      viewOnly: false,
    };
  },
  async downloadWalletBackup(_password: string) {
    return {
      filename: "mock-wallet.json",
      payload: { mock: true },
    };
  },
  async confirmBackup(_password: string) {
    backedUp = true;
  },
  async isBackedUp() {
    return backedUp;
  },
};
