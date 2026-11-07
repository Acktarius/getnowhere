import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  walletSessionExit,
  withBudget,
} from "@/services/storage/walletSessionExit";

describe("walletSessionExit", () => {
  const flushWallet = vi.fn(async () => undefined);
  const softLeaveAll = vi.fn(async () => undefined);
  const lockWallet = vi.fn(async () => undefined);
  const clearSession = vi.fn();
  const navigate = vi.fn();

  beforeEach(() => {
    flushWallet.mockClear();
    softLeaveAll.mockClear();
    lockWallet.mockClear();
    clearSession.mockClear();
    navigate.mockClear();
  });

  it("flushes wallet, soft-leaves, locks, clears session, navigates to /welcome", async () => {
    await walletSessionExit({
      flushWallet,
      softLeaveAll,
      lockWallet,
      clearSession,
      navigate,
    });

    expect(flushWallet).toHaveBeenCalledTimes(1);
    expect(softLeaveAll).toHaveBeenCalledTimes(1);
    expect(lockWallet).toHaveBeenCalledTimes(1);
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/welcome");

    const order = [
      flushWallet.mock.invocationCallOrder[0],
      softLeaveAll.mock.invocationCallOrder[0],
      lockWallet.mock.invocationCallOrder[0],
      clearSession.mock.invocationCallOrder[0],
      navigate.mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("continues Exit when flushWallet exceeds budget", async () => {
    vi.useFakeTimers();
    flushWallet.mockImplementation(
      () => new Promise<void>(() => undefined /* never settles */),
    );

    const done = walletSessionExit({
      flushWallet,
      softLeaveAll,
      lockWallet,
      clearSession,
      navigate,
      flushBudgetMs: 50,
      softLeaveBudgetMs: 50,
    });

    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(50);
    await done;

    expect(lockWallet).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/welcome");
  });
});

describe("withBudget", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves when the work finishes first", async () => {
    await expect(withBudget(Promise.resolve(), 1_000)).resolves.toBeUndefined();
  });

  it("resolves when the timer wins over a hung promise", async () => {
    vi.useFakeTimers();
    const hung = new Promise<void>(() => undefined);
    const raced = withBudget(hung, 25);
    await vi.advanceTimersByTimeAsync(25);
    await expect(raced).resolves.toBeUndefined();
  });
});
