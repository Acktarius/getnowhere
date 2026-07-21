// Wallet construction helpers — the SDK-engine analogue of conceal-next-wallet's
// lib/services/real-sdk/wallet-build.ts. Pure (no storage, no network): build a
// BuiltWallet (keys + plaintext blob + address) for each import path.

import * as sdk from "conceal-wallet-sdk";
import type { Account, RawWalletV1, UserKeys } from "conceal-wallet-sdk";

/** A constructed wallet ready to adopt: keys + plaintext blob + mnemonic. */
export interface BuiltWallet {
  keys: UserKeys;
  raw: RawWalletV1;
  /** Present when the wallet was created/restored from a seed phrase. */
  mnemonic?: string;
  address: string;
  /** True when the wallet has no spend secret (view-only import). */
  viewOnly?: boolean;
}

/** Map the SDK WalletKeys (sec/pub pairs) to the envelope UserKeys. */
function walletKeysToUserKeys(keys: sdk.WalletKeys): UserKeys {
  return {
    pub: { view: keys.view.pub, spend: keys.spend.pub },
    priv: { view: keys.view.sec, spend: keys.spend.sec },
  };
}

/** A brand-new empty plaintext blob carrying `keys` at `creationHeight`. */
function freshRawWallet(keys: UserKeys, creationHeight: number): RawWalletV1 {
  const height = Math.max(0, Math.round(creationHeight) || 0);
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    txPrivateKeys: {},
    lastHeight: height,
    nonce: "",
    keys,
    creationHeight: height,
    options: { readSpeed: 4, checkMinerTx: false, customNode: false, nodeUrl: "" },
  };
}

/** Build a create/restore-from-mnemonic wallet (keys + blob + seed phrase). */
export function buildFromMnemonic(
  phrase: string,
  creationHeight: number,
  language?: string,
): BuiltWallet {
  const account: Account = sdk.restoreFromMnemonic(
    phrase,
    language as sdk.SeedLanguage | undefined,
  );
  const keys = walletKeysToUserKeys(account.keys);
  return {
    keys,
    raw: freshRawWallet(keys, creationHeight),
    mnemonic: account.mnemonic ?? phrase.trim(),
    address: account.address,
  };
}

/** Build a wallet from a private spend key (view key derived when omitted). */
export function buildFromSpendKey(
  spendKey: string,
  viewKey: string | undefined,
  creationHeight: number,
): BuiltWallet {
  const spend = spendKey.trim();
  let view = (viewKey ?? "").trim();
  if (view === "") {
    // Standard CryptoNote wallet: view secret = generate_keys(cn_fast_hash(spend)).
    view = sdk.crypto.generateKeys(sdk.crypto.cnFastHash(spend)).sec;
  }
  const keys = sdk.userKeysFromPriv(spend, view);
  return {
    keys,
    raw: freshRawWallet(keys, creationHeight),
    address: sdk.encodeAddress(keys.pub.spend, keys.pub.view),
  };
}

/** Build a view-only wallet from an address + private view key (no spend secret). */
export function buildViewOnly(
  address: string,
  privateViewKey: string,
  creationHeight: number,
): BuiltWallet {
  const decoded = sdk.decodeAddress(address.trim());
  const keys: UserKeys = {
    pub: { spend: decoded.spendPublicKey, view: decoded.viewPublicKey },
    priv: { spend: "", view: privateViewKey.trim() },
  };
  return {
    keys,
    raw: freshRawWallet(keys, creationHeight),
    address: address.trim(),
    viewOnly: true,
  };
}

/** The seed phrase for a spend secret (best-effort english encode), or "". */
export function mnemonicFromSpendKey(spendSecret: string): string {
  if (!spendSecret) return "";
  try {
    return sdk.crypto.mnemonic.mn_encode(spendSecret, "english") ?? "";
  } catch {
    return "";
  }
}
