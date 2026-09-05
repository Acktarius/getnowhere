/**
 * Wallet session across WKWebView remount and iOS process death.
 * Keychain via injected persist — RAM alone does not survive jetsam.
 * @see docs/features/app-access-and-data-unlock.md
 */

export const WALLET_SESSION_PREFS_KEY = "gnh.walletSession";

export type WalletSessionRecord = {
  password: string;
  autoLockTimeoutSec: number;
  /** Wall clock when the app last went to background. Null = still foreground. */
  backgroundedAtMs: number | null;
};

export type WalletSessionStore = {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
};

let session: WalletSessionRecord | null = null;
let persist: WalletSessionStore | null = null;
let persistChain: Promise<void> = Promise.resolve();

export function setWalletSessionPersist(
  store: WalletSessionStore | null,
): void {
  persist = store;
}

export function parseWalletSessionRecord(
  raw: string | null,
): WalletSessionRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WalletSessionRecord>;
    if (typeof parsed.password !== "string" || !parsed.password) return null;
    const autoLockTimeoutSec = Math.max(
      0,
      Math.floor(Number(parsed.autoLockTimeoutSec) || 0),
    );
    const backgroundedAtMs =
      typeof parsed.backgroundedAtMs === "number" &&
      Number.isFinite(parsed.backgroundedAtMs)
        ? parsed.backgroundedAtMs
        : null;
    return { password: parsed.password, autoLockTimeoutSec, backgroundedAtMs };
  } catch {
    return null;
  }
}

/**
 * Timestamp gate: ask for password only when backgrounded and elapsed >= timeout.
 * `nowMs - backgroundedAtMs`, not a running timer.
 */
export function passwordIfSessionValid(
  record: WalletSessionRecord,
  nowMs: number,
): string | null {
  if (!record.password) return null;
  const limitMs = record.autoLockTimeoutSec * 1000;
  if (record.backgroundedAtMs == null) return record.password;
  const elapsed = Math.max(0, nowMs - record.backgroundedAtMs);
  if (limitMs > 0 && elapsed >= limitMs) return null;
  return record.password;
}

function normalizeTimeout(autoLockTimeoutSec: number): number {
  return Math.max(0, Math.floor(autoLockTimeoutSec));
}

async function flushPersist(): Promise<void> {
  persistChain = persistChain
    .then(async () => {
      if (!persist) return;
      if (!session) {
        await persist.remove();
        return;
      }
      await persist.set(JSON.stringify(session));
    })
    .catch(() => {
      /* Keychain busy — next write retries */
    });
  await persistChain;
}

/** Wait for Keychain writes (tests / hydrate-before-WebView). */
export function awaitWalletSessionPersist(): Promise<void> {
  return persistChain;
}

export function keepWalletSession(
  password: string,
  autoLockTimeoutSec: number,
): void {
  if (!password) return;
  session = {
    password,
    autoLockTimeoutSec: normalizeTimeout(autoLockTimeoutSec),
    backgroundedAtMs: null,
  };
  void flushPersist();
}

export function updateWalletSessionTimeout(autoLockTimeoutSec: number): void {
  if (!session) return;
  session.autoLockTimeoutSec = normalizeTimeout(autoLockTimeoutSec);
  void flushPersist();
}

export function clearWalletSession(): void {
  session = null;
  void flushPersist();
}

export function hasWalletSession(): boolean {
  return session != null;
}

export function markWalletSessionBackgrounded(atMs: number): void {
  if (!session) return;
  session.backgroundedAtMs = atMs;
  void flushPersist();
}

export function markWalletSessionForeground(): void {
  if (!session) return;
  session.backgroundedAtMs = null;
  void flushPersist();
}

/** RAM copy when RN is still alive. Prefer hydrate after process death. */
export function copyWalletSessionIfValid(
  backgroundElapsedMs: number,
): string | null {
  if (!session) return null;
  const nowMs = Date.now();
  const record: WalletSessionRecord = {
    ...session,
    backgroundedAtMs:
      session.backgroundedAtMs ??
      (backgroundElapsedMs > 0 ? nowMs - backgroundElapsedMs : null),
  };
  const password = passwordIfSessionValid(record, nowMs);
  if (!password) {
    session = null;
    void flushPersist();
    return null;
  }
  return password;
}

/** Reload from Keychain after jetsam. Drops expired leftovers. */
export async function hydrateWalletSessionFromPersist(
  nowMs: number,
): Promise<string | null> {
  if (persist) {
    const record = parseWalletSessionRecord(await persist.get());
    if (!record) {
      session = null;
      return null;
    }
    const password = passwordIfSessionValid(record, nowMs);
    if (!password) {
      session = null;
      await persist.remove();
      return null;
    }
    session = record;
    return password;
  }
  if (!session) return null;
  return passwordIfSessionValid(session, nowMs);
}

export function parseWalletSessionMessage(raw: string): {
  action: "keep" | "clear" | "setTimeout";
  password?: string;
  autoLockTimeoutSec?: number;
} | null {
  try {
    const msg = JSON.parse(raw) as {
      channel?: string;
      direction?: string;
      action?: string;
      password?: string;
      autoLockTimeoutSec?: number;
    };
    if (msg.channel !== "gnh-wallet-session" || msg.direction !== "command") {
      return null;
    }
    if (
      msg.action === "keep" ||
      msg.action === "clear" ||
      msg.action === "setTimeout"
    ) {
      return {
        action: msg.action,
        password: typeof msg.password === "string" ? msg.password : undefined,
        autoLockTimeoutSec:
          typeof msg.autoLockTimeoutSec === "number"
            ? msg.autoLockTimeoutSec
            : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function applyWalletSessionMessage(raw: string): boolean {
  const msg = parseWalletSessionMessage(raw);
  if (!msg) return false;
  if (msg.action === "clear") {
    clearWalletSession();
    return true;
  }
  if (msg.action === "setTimeout" && msg.autoLockTimeoutSec != null) {
    updateWalletSessionTimeout(msg.autoLockTimeoutSec);
    return true;
  }
  if (msg.action === "keep" && msg.password) {
    keepWalletSession(msg.password, msg.autoLockTimeoutSec ?? 0);
    return true;
  }
  return true;
}

export function buildWalletSessionRestoreScript(
  password: string | null,
): string {
  const payload = JSON.stringify(password);
  return `(function(){try{if(window.gnhMobile){window.gnhMobile._pendingWalletRestore=${payload};window.gnhMobile._sessionRestoreReady=true;}}catch(e){}})();true;`;
}

/** Test-only: drop RAM as if the RN process died; persist store is untouched. */
export function _dropRamSessionForTests(): void {
  session = null;
}
