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

/** Mobile Expo WebView bridge (Bare worklet behind postMessage). */
interface GnhMobileBridge {
  bridgeToken: string;
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
}

interface Window {
  gnhDesktop?: GnhDesktopBridge;
  gnhMobile?: GnhMobileBridge;
}
