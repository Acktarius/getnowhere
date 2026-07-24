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
}

interface Window {
  gnhDesktop?: GnhDesktopBridge;
  __GNH_DESKTOP__?: GnhDesktopBridge;
}
