/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HOLEPUNCH_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface GnhDesktopBridge {
  role?: string;
  /** WS URL; may already include `?token=` under Electron. */
  holepunchWsUrl?: string;
  /** Optional sidecar auth token (empty in web-dev). */
  wsToken?: string;
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
}

interface Window {
  gnhDesktop?: GnhDesktopBridge;
  gnhMobile?: GnhMobileBridge;
}
