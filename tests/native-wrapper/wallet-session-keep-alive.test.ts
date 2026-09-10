import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _dropRamSessionForTests,
  applyWalletSessionMessage,
  awaitWalletSessionPersist,
  clearWalletSession,
  copyWalletSessionIfValid,
  hasWalletSession,
  hydrateWalletSessionFromPersist,
  markWalletSessionBackgrounded,
  parseWalletSessionRecord,
  passwordIfSessionValid,
  setWalletSessionPersist,
} from "../../native-wrapper/src/walletSessionKeepAlive";

function keep(password = "secret-pw", autoLockTimeoutSec = 900): void {
  applyWalletSessionMessage(
    JSON.stringify({
      channel: "gnh-wallet-session",
      direction: "command",
      action: "keep",
      password,
      autoLockTimeoutSec,
    }),
  );
}

function memoryStore(initial: string | null = null) {
  let value = initial;
  return {
    get: async () => value,
    set: async (next: string) => {
      value = next;
    },
    remove: async () => {
      value = null;
    },
    peek: () => value,
  };
}

describe("walletSessionKeepAlive", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setWalletSessionPersist(null);
    clearWalletSession();
  });

  afterEach(() => {
    clearWalletSession();
    setWalletSessionPersist(null);
    vi.useRealTimers();
  });

  it("uses Date.now() - backgroundedAt, not a countdown timer", () => {
    const start = Date.now();
    vi.setSystemTime(start);
    const record = {
      password: "secret-pw",
      autoLockTimeoutSec: 900,
      backgroundedAtMs: start,
    };
    vi.setSystemTime(start + 180_000);
    expect(passwordIfSessionValid(record, Date.now())).toBe("secret-pw");
    vi.setSystemTime(start + 900_000);
    expect(passwordIfSessionValid(record, Date.now())).toBeNull();
  });

  it("restores after 3 minutes when auto-lock is 15 minutes", () => {
    keep();
    const start = Date.now();
    vi.setSystemTime(start);
    markWalletSessionBackgrounded(start);
    vi.setSystemTime(start + 180_000);
    expect(copyWalletSessionIfValid(180_000)).toBe("secret-pw");
    expect(hasWalletSession()).toBe(true);
  });

  it("does not restore after 16 minutes when auto-lock is 15 minutes", () => {
    keep();
    const start = Date.now();
    vi.setSystemTime(start);
    markWalletSessionBackgrounded(start);
    vi.setSystemTime(start + 960_000);
    expect(copyWalletSessionIfValid(960_000)).toBeNull();
    expect(hasWalletSession()).toBe(false);
  });

  it("survives RN process death via Keychain persist (3 min / 15 min)", async () => {
    const store = memoryStore();
    setWalletSessionPersist(store);
    keep();
    const start = Date.now();
    vi.setSystemTime(start);
    markWalletSessionBackgrounded(start);
    await awaitWalletSessionPersist();
    expect(store.peek()).toBeTruthy();

    _dropRamSessionForTests();
    expect(hasWalletSession()).toBe(false);

    vi.setSystemTime(start + 180_000);
    await expect(hydrateWalletSessionFromPersist(Date.now())).resolves.toBe(
      "secret-pw",
    );
    expect(hasWalletSession()).toBe(true);
  });

  it("does not restore from Keychain after 16 minutes", async () => {
    const store = memoryStore();
    setWalletSessionPersist(store);
    keep();
    const start = Date.now();
    vi.setSystemTime(start);
    markWalletSessionBackgrounded(start);
    await awaitWalletSessionPersist();
    _dropRamSessionForTests();
    vi.setSystemTime(start + 960_000);
    await expect(
      hydrateWalletSessionFromPersist(Date.now()),
    ).resolves.toBeNull();
    expect(hasWalletSession()).toBe(false);
    expect(store.peek()).toBeNull();
  });

  it("clear drops the session so remount cannot reopen", () => {
    keep();
    applyWalletSessionMessage(
      JSON.stringify({
        channel: "gnh-wallet-session",
        direction: "command",
        action: "clear",
      }),
    );
    expect(copyWalletSessionIfValid(1_000)).toBeNull();
  });

  it("rejects a persisted blob with no password", () => {
    expect(parseWalletSessionRecord('{"autoLockTimeoutSec":900}')).toBeNull();
  });
});
