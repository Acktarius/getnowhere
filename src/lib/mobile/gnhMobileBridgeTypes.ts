/** gnhMobile security bridge message types. @see native-wrapper/docs/gnh-mobile-security-bridge.md */

export type GnhLifecycleType = "foreground" | "background" | "screenOff";

export type GnhBiometricPurpose = "app" | "data";

export type GnhBiometricAction =
  | "isAvailable"
  | "enrollDataUnlock"
  | "unlockDataUnlock"
  | "enrollAppAccess"
  | "unlockAppAccess"
  | "removeCredential";

export type GnhSecurePrefsAction = "get" | "set" | "remove";

export type GnhSecurityChannel =
  | "gnh-lifecycle"
  | "gnh-biometric"
  | "gnh-secure-prefs"
  | "gnh-privacy";

export type GnhMessageDirection = "command" | "response" | "event";

export type GnhBridgeEnvelope = {
  channel: GnhSecurityChannel | "gnh-file" | "gnh-bridge";
  direction: GnhMessageDirection;
  requestId?: string;
  lockGeneration?: number;
};

export type GnhLifecycleEvent = GnhBridgeEnvelope & {
  channel: "gnh-lifecycle";
  direction: "event";
  type: GnhLifecycleType;
  /** Set by native shell on foreground when JS may have missed background. */
  backgroundElapsedMs?: number;
};

export type GnhBiometricCommand = GnhBridgeEnvelope & {
  channel: "gnh-biometric";
  direction: "command";
  action: GnhBiometricAction;
  purpose?: GnhBiometricPurpose;
  walletId?: string;
  password?: string;
  credentialId?: string;
  passcode?: string;
};

export type GnhBiometricResponse = GnhBridgeEnvelope & {
  channel: "gnh-biometric";
  direction: "response";
  requestId: string;
  lockGeneration: number;
  available?: boolean;
  credentialId?: string;
  password?: string;
  ok?: boolean;
  error?: string;
};

export type GnhSecurePrefsCommand = GnhBridgeEnvelope & {
  channel: "gnh-secure-prefs";
  direction: "command";
  action: GnhSecurePrefsAction;
  key: string;
  value?: string;
};

export type GnhSecurePrefsResponse = GnhBridgeEnvelope & {
  channel: "gnh-secure-prefs";
  direction: "response";
  requestId: string;
  value?: string | null;
  ok?: boolean;
  error?: string;
};

/** Returns true when running inside Expo mobile WebView shell. */
export function isMobileHost(): boolean {
  return typeof window !== "undefined" && window.gnhMobile != null;
}

/** Returns true when the hosting native shell is Android. */
export function isMobileAndroid(): boolean {
  return isMobileHost() && window.gnhMobile?.platform === "android";
}
