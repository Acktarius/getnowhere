/**
 * Unit tests for handle TTL / lazy expiry (SEC-2026-028).
 * better-sqlite3 is a native module and is not built in this environment, so
 * the DB layer is mocked — these tests pin the expiry predicate and the
 * lazy-delete contract, not SQLite itself.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const runMock = vi.fn();
const prepareMock = vi.fn(() => ({ run: runMock }));

vi.mock("better-sqlite3", () => ({
  default: class MockDb {
    pragma(): void {}
    exec(): void {}
    prepare = prepareMock;
    close(): void {}
  },
}));

import {
  closeDb,
  deleteHandleIfExpired,
  HANDLE_TTL_MS,
  type HandleRow,
  isHandleExpired,
  openDb,
} from "../src/db.js";

function makeRow(updatedAt: number): HandleRow {
  return {
    pokeHandle: "abcdefghijklmn",
    token: "tok",
    platform: "apns",
    env: "production",
    updatedAt,
  };
}

describe("handle TTL (SEC-2026-028)", () => {
  beforeEach(() => {
    runMock.mockClear();
    prepareMock.mockClear();
    openDb(":memory:");
  });

  it("a freshly registered handle is not expired", () => {
    const now = Date.now();
    expect(isHandleExpired(makeRow(now), now)).toBe(false);
  });

  it("a handle at exactly the TTL boundary is expired", () => {
    const updatedAt = Date.now() - HANDLE_TTL_MS;
    expect(isHandleExpired(makeRow(updatedAt), updatedAt + HANDLE_TTL_MS)).toBe(
      true,
    );
    // One ms before the boundary is still valid.
    expect(
      isHandleExpired(makeRow(updatedAt), updatedAt + HANDLE_TTL_MS - 1),
    ).toBe(false);
  });

  it("HANDLE_TTL_MS defaults to 30 days", () => {
    expect(HANDLE_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("deleteHandleIfExpired issues a DELETE scoped to both handle and expiry cutoff", () => {
    const now = Date.now();
    deleteHandleIfExpired("abcdefghijklmn", now);

    expect(prepareMock).toHaveBeenCalledWith(
      "DELETE FROM handles WHERE poke_handle = ? AND updated_at < ?",
    );
    expect(runMock).toHaveBeenCalledWith("abcdefghijklmn", now - HANDLE_TTL_MS);
  });

  it("the expiry predicate is in the DELETE itself (concurrent-refresh safety)", () => {
    // The DELETE must carry its own `updated_at < cutoff` predicate so a row
    // re-registered after the caller's `now` is not removed based on a stale read.
    const staleNow = 1_000_000;
    deleteHandleIfExpired("abcdefghijklmn", staleNow);
    const [, cutoff] = runMock.mock.calls[0] as [string, number];
    expect(cutoff).toBe(staleNow - HANDLE_TTL_MS);
  });

  it("closeDb is safe to call after openDb", () => {
    expect(() => closeDb()).not.toThrow();
  });
});
