/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HOLEPUNCH_WS_URL?: string;
  /** Base URL of the peer-wake poke gateway (e.g. https://poke.example.com). @see docs/features/peer-wake-notification.md */
  readonly VITE_POKE_GATEWAY_URL?: string;
  /** Optional ntfy read token for gnh-* topics. Leave empty if topics are publicly readable. */
  readonly VITE_NTFY_READ_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface GnhDesktopBridge {
  role?: string;
  bridgeTransport?: "ipc" | "ws";
  /** WS URL when `bridgeTransport` is `ws`. */
  holepunchWsUrl?: string;
  /** Sidecar auth token when using WebSocket transport. */
  wsToken?: string;
  sendCommand?(cmd: {
    type: string;
    topicRef?: string;
    roomId?: string;
    payload?: string;
  }): void;
  onBridgeEvent?(
    handler: (msg: {
      type: string;
      topicRef?: string;
      roomId?: string;
      payload?: string;
      count?: number;
      code?: string;
      message?: string;
    }) => void,
  ): () => void;
  /**
   * Privilege-free, best-effort Linux UFW advisory (Electron only; absent in
   * the browser build). Never proof that a specific port is blocked.
   * @see docs/architecture/electron-desktop.md
   */
  ufwState?: "active" | "inactive" | "unknown";
}

/** Mobile Expo WebView bridge (Bare worklet behind postMessage). Token is RN-only. */
interface GnhMobileSaveTextFileResult {
  requestId: string;
  ok: boolean;
  message?: string;
}

/** Mobile Expo WebView bridge API surface injected before Vite UI loads. */
interface GnhMobileBridge {
  /** Platform of the hosting native shell. */
  readonly platform?: "ios" | "android";
  sendCommand(cmd: {
    type: string;
    topicRef?: string;
    roomId?: string;
    payload?: string;
  }): void;
  onBridgeEvent(
    handler: (msg: {
      type: string;
      topicRef?: string;
      roomId?: string;
      payload?: string;
      count?: number;
      code?: string;
      message?: string;
    }) => void,
  ): () => void;
  saveTextFile?(opts: {
    filename: string;
    content: string;
    requestId: string;
  }): void;
  _onSaveTextFile?(
    handler: (result: GnhMobileSaveTextFileResult) => void,
  ): () => void;
  _resolveSaveTextFile?(result: GnhMobileSaveTextFileResult): void;
  _dispatchBridgeEvent?(msg: Record<string, unknown>): void;
  getLockGeneration?(): number;
  setLockGeneration?(n: number): void;
  _resolveSecurity?(result: Record<string, unknown>): void;
  biometric?: {
    isAvailable(purpose: "app" | "data"): Promise<Record<string, unknown>>;
    enrollDataUnlock(
      walletId: string,
      password: string,
    ): Promise<Record<string, unknown>>;
    unlockDataUnlock(
      walletId: string,
      credentialId: string,
    ): Promise<Record<string, unknown>>;
    enrollAppAccess(passcode: string): Promise<Record<string, unknown>>;
    unlockAppAccess(): Promise<Record<string, unknown>>;
    removeCredential(credentialId: string): Promise<Record<string, unknown>>;
  };
  securePrefs?: {
    get(key: string): Promise<Record<string, unknown>>;
    set(key: string, value: string): Promise<Record<string, unknown>>;
    remove(key: string): Promise<Record<string, unknown>>;
  };
  onLifecycle?(handler: (evt: { type: string }) => void): () => void;
  _dispatchLifecycleEvent?(evt: { type: string }): void;
  _runBackgroundRemoteSync?(requestId: string): void;
  /**
   * Subscribe to push token delivery from the native shell.
   * Called once on app load and again on OS token rotation.
   * @see docs/features/peer-wake-notification.md
   */
  onPokeToken?(handler: (platform: "apns", token: string) => void): () => void;
  /** @internal Injected by native shell via buildPokeTokenDispatchScript. */
  _dispatchPokeToken?(platform: "apns", token: string): void;
}

interface Window {
  gnhDesktop?: GnhDesktopBridge;
  gnhMobile?: GnhMobileBridge;
  ReactNativeWebView?: { postMessage: (data: string) => void };
}
