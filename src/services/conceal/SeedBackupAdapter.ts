import { saveEncryptedWalletFile } from "@/services/conceal/ConcealWalletAdapter";
import { getInternalWalletState } from "@/services/conceal/ConcealWalletService";
import { getRuntime, persist } from "@/services/conceal/sync";
import { mnemonicFromSpendKey } from "@/services/conceal/walletBuild";
import type { SeedBackupService } from "@/types/services";

let backedUp = false;

function requireOpenRuntime(password: string) {
  const rt = getRuntime();
  if (!rt) {
    throw new Error("Wallet is not open.");
  }
  if (!password || password !== rt.password) {
    throw new Error("Incorrect password");
  }
  return rt;
}

/**
 * Seed/key reveal + encrypted JSON download — all gated by wallet password.
 * @see docs/features/lite-wallet.md
 */
export const SeedBackupAdapter: SeedBackupService = {
  async revealSecrets(password: string) {
    const rt = requireOpenRuntime(password);
    const spendKey = rt.account.keys.spend.sec ?? "";
    const viewKey = rt.account.keys.view.sec ?? "";
    const viewOnly = rt.viewOnly || !spendKey;

    const mem = getInternalWalletState()?.seedPhrase?.trim() ?? "";
    const mnemonic = viewOnly
      ? ""
      : mem || mnemonicFromSpendKey(spendKey).trim();

    if (!viewOnly && !mnemonic) {
      throw new Error("Seed is not available for this wallet.");
    }

    return {
      address: rt.account.address,
      mnemonic,
      spendKey: viewOnly ? "" : spendKey,
      viewKey,
      viewOnly,
    };
  },

  async downloadWalletBackup(password: string) {
    const rt = requireOpenRuntime(password);
    await persist();
    const payload = saveEncryptedWalletFile(rt.raw, password);
    const stamp = new Date().toISOString().slice(0, 10);
    return {
      filename: `getnowhere-wallet-${stamp}.json`,
      payload,
    };
  },

  async confirmBackup(_password: string) {
    backedUp = true;
  },

  async isBackedUp() {
    return backedUp;
  },
};
