import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { copySensitive } from "@/lib/clipboard/sensitiveClipboard";

vi.mock("@/lib/clipboard/sensitiveClipboard", () => ({
  copySensitive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/qr/WalletQrCode", () => ({
  WalletQrCode: () => null,
}));

vi.mock("@/services/conceal/ConcealWalletAdapter", () => ({
  buildCcxPaymentUri: ({ address }: { address: string }) => `ccx:${address}`,
}));

import { ReceiveSheet } from "@/components/ReceiveSheet";

const ADDRESS = "ccx-addr-ccw7m-qk4n9-unique-raw";
const PID = "pid-ccw7m-qk4n9-unique-raw-hex";

describe("ReceiveSheet copy", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(copySensitive).mockClear();
  });

  it("Copy address calls copySensitive with the raw address", () => {
    render(<ReceiveSheet address={ADDRESS} />);

    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    expect(copySensitive).toHaveBeenCalledTimes(1);
    expect(copySensitive).toHaveBeenCalledWith(ADDRESS);
  });

  it("Copy payment ID calls copySensitive with the raw payment ID", () => {
    render(<ReceiveSheet address={ADDRESS} paymentId={PID} />);

    fireEvent.click(screen.getByRole("button", { name: /^payment id$/i }));
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    expect(copySensitive).toHaveBeenCalledTimes(1);
    expect(copySensitive).toHaveBeenCalledWith(PID);
  });

  it("does not offer integrated address generation", () => {
    render(<ReceiveSheet address={ADDRESS} />);

    expect(
      screen.queryByRole("button", { name: /generate integrated address/i }),
    ).toBeNull();
    expect(screen.queryByText(/gold mark/i)).toBeNull();
  });
});
