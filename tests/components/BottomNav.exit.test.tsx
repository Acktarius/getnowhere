import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runWalletSessionExit = vi.fn(async () => undefined);

vi.mock("@/services/storage/walletSessionExit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/storage/walletSessionExit")>();
  return {
    ...actual,
    runWalletSessionExit: (...args: unknown[]) => runWalletSessionExit(...args),
  };
});

import { BottomNav } from "@/components/BottomNav";

function renderNav() {
  return render(
    <MemoryRouter initialEntries={["/chats"]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe("BottomNav Exit", () => {
  beforeEach(() => {
    runWalletSessionExit.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("orders nav Chats → Contacts → Wallet → Settings → Exit", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const labels = within(nav)
      .getAllByRole("link")
      .map((el) => el.textContent?.trim());
    // Exit is a button, not a link
    const exit = within(nav).getByRole("button", { name: /Exit/i });
    expect(labels).toEqual(["Chats", "Contacts", "Wallet", "Settings"]);
    expect(exit).toBeTruthy();
    const items = Array.from(nav.querySelectorAll(".bottom-nav__item"));
    expect(items.map((el) => el.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "Chats",
      "Contacts",
      "Wallet",
      "Settings",
      "Exit",
    ]);
  });

  it("opens Confirm disconnect and cancel is a no-op", async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole("button", { name: /Exit/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Confirm disconnect")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(screen.queryByText("Confirm disconnect")).toBeNull();
    expect(runWalletSessionExit).not.toHaveBeenCalled();
  });

  it("confirm runs wallet session exit", async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole("button", { name: /Exit/i }));
    await user.click(screen.getByRole("button", { name: /^Confirm$/i }));
    expect(runWalletSessionExit).toHaveBeenCalledTimes(1);
  });
});
