/** RN NativeModules wrapper for GnhSecurity (Android + iOS after prebuild). */
import { NativeModules, Platform } from "react-native";

type GnhSecurityNative = {
  handleBiometricCommand(payloadJson: string): Promise<string>;
  securePrefsGet(key: string): Promise<string | null>;
  securePrefsSet(key: string, value: string): Promise<boolean>;
  securePrefsRemove(key: string): Promise<boolean>;
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
