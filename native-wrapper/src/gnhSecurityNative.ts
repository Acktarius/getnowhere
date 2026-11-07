/** RN NativeModules wrapper for GnhSecurity (Android + iOS after prebuild). */
import { NativeModules, Platform } from "react-native";

type WalletFileNativeResult = {
  exists?: boolean;
  value?: string;
  ok?: boolean;
  reason?: string;
};

type GnhSecurityNative = {
  handleBiometricCommand(payloadJson: string): Promise<string>;
  securePrefsGet(key: string): Promise<string | null>;
  securePrefsSet(key: string, value: string): Promise<boolean>;
  securePrefsRemove(key: string): Promise<boolean>;
  copySensitive?(value: string): Promise<boolean>;
  clearClipboard?(): Promise<boolean>;
  walletFileExists?(): Promise<WalletFileNativeResult>;
  walletFileRead?(): Promise<WalletFileNativeResult>;
  walletFileWrite?(value: string): Promise<WalletFileNativeResult>;
  walletFileRemove?(): Promise<WalletFileNativeResult>;
};

const native: GnhSecurityNative | undefined =
  Platform.OS === "android" || Platform.OS === "ios"
    ? (NativeModules.GnhSecurity as GnhSecurityNative | undefined)
    : undefined;

export function isGnhSecurityNativeAvailable(): boolean {
  return native != null;
}

export async function invokeBiometricCommand(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!native) return { error: "unsupported" };
  const raw = await native.handleBiometricCommand(JSON.stringify(payload));
  return JSON.parse(raw) as Record<string, unknown>;
}

export async function securePrefsGet(key: string): Promise<string | null> {
  if (!native) return null;
  return native.securePrefsGet(key);
}

export async function securePrefsSet(
  key: string,
  value: string,
): Promise<boolean> {
  if (!native) return false;
  return native.securePrefsSet(key, value);
}

export async function securePrefsRemove(key: string): Promise<boolean> {
  if (!native) return false;
  return native.securePrefsRemove(key);
}

export async function nativeCopySensitive(value: string): Promise<void> {
  if (!native?.copySensitive) throw new Error("unsupported");
  await native.copySensitive(value);
}

export async function nativeClearClipboard(): Promise<void> {
  if (!native?.clearClipboard) throw new Error("unsupported");
  await native.clearClipboard();
}

export async function walletFileExists(): Promise<WalletFileNativeResult> {
  if (!native?.walletFileExists) return { reason: "bridge-unavailable" };
  return native.walletFileExists();
}

export async function walletFileRead(): Promise<WalletFileNativeResult> {
  if (!native?.walletFileRead) return { reason: "bridge-unavailable" };
  return native.walletFileRead();
}

export async function walletFileWrite(
  value: string,
): Promise<WalletFileNativeResult> {
  if (!native?.walletFileWrite) return { reason: "bridge-unavailable" };
  return native.walletFileWrite(value);
}

export async function walletFileRemove(): Promise<WalletFileNativeResult> {
  if (!native?.walletFileRemove) return { reason: "bridge-unavailable" };
  return native.walletFileRemove();
}
