import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WalletBalanceCard } from "@/components/WalletBalanceCard";

const wallet = {
  balanceTotal: 12.5,
  balanceAvailable: 10,
  balancePending: 2.5,
  syncStatus: "synced" as const,
  locked: false,
};

describe("WalletBalanceCard hideByDefault", () => {
  it("starts unblurred when hideByDefault is off", () => {
    const { container } = render(
      <WalletBalanceCard wallet={wallet} hideByDefault={false} />,
    );
    expect(container.querySelector(".privacy-blur")).toBeNull();
  });

  it("starts blurred when hideByDefault is on", () => {
    const { container } = render(
      <WalletBalanceCard wallet={wallet} hideByDefault />,
    );
    expect(container.querySelector(".privacy-blur")).not.toBeNull();
  });

  it("applies hideByDefault when the setting changes on a kept-alive card", () => {
    const { container, rerender } = render(
      <WalletBalanceCard wallet={wallet} hideByDefault={false} />,
    );
    expect(container.querySelector(".privacy-blur")).toBeNull();
    rerender(<WalletBalanceCard wallet={wallet} hideByDefault />);
    expect(container.querySelector(".privacy-blur")).not.toBeNull();
    rerender(<WalletBalanceCard wallet={wallet} hideByDefault={false} />);
    expect(container.querySelector(".privacy-blur")).toBeNull();
  });
});
