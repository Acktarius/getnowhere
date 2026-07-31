import { beforeEach, describe, expect, it, vi } from "vitest";
import { walletSessionExit } from "@/services/storage/walletSessionExit";

describe("walletSessionExit", () => {
  const persistContacts = vi.fn(async () => undefined);
  const softLeaveAll = vi.fn(async () => undefined);
  const lockWallet = vi.fn(async () => undefined);
  const clearSession = vi.fn();
  const navigate = vi.fn();

  beforeEach(() => {
    persistContacts.mockClear();
    softLeaveAll.mockClear();
    lockWallet.mockClear();
    clearSession.mockClear();
    navigate.mockClear();
  });

  it("persists contacts, soft-leaves topics, locks wallet, clears session, navigates to /welcome", async () => {
    await walletSessionExit({
      persistContacts,
      softLeaveAll,
      lockWallet,
      clearSession,
      navigate,
    });

    expect(persistContacts).toHaveBeenCalledTimes(1);
    expect(softLeaveAll).toHaveBeenCalledTimes(1);
    expect(lockWallet).toHaveBeenCalledTimes(1);
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/welcome");

    // Order: persist before soft-leave before lock before clear before navigate
    const order = [
      persistContacts.mock.invocationCallOrder[0],
      softLeaveAll.mock.invocationCallOrder[0],
      lockWallet.mock.invocationCallOrder[0],
      clearSession.mock.invocationCallOrder[0],
      navigate.mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
