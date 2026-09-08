import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { copySensitive } from "@/lib/clipboard/sensitiveClipboard";
import { shortAddress } from "@/utils/format";

vi.mock("@/lib/clipboard/sensitiveClipboard", () => ({
  copySensitive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services", () => ({
  walletService: { generatePaymentId: () => "00".repeat(32) },
}));

vi.mock("@/components/qr/PaymentIdQrScanButton", () => ({
  PaymentIdQrScanButton: () => null,
}));

vi.mock("@/components/qr/WalletQrCode", () => ({
  WalletQrCode: () => null,
}));

import { PaymentIdField } from "@/components/PaymentIdField";

const RAW = "pid-ccw7m-qk4n9-unique-raw-payment-id-hex";

describe("PaymentIdField copy", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(copySensitive).mockClear();
  });

  it("Copy calls copySensitive with the raw value only", () => {
    render(<PaymentIdField label="Payment ID" value={RAW} direction="from" />);

    fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));

    expect(copySensitive).toHaveBeenCalledTimes(1);
    expect(copySensitive).toHaveBeenCalledWith(RAW);
    expect(vi.mocked(copySensitive).mock.calls[0]?.[0]).not.toMatch(
      /Payment ID|label/i,
    );
  });

  it("displays the value as non-selectable", () => {
    render(<PaymentIdField label="Payment ID" value={RAW} direction="from" />);
    const el = screen.getByText(shortAddress(RAW, 10, 10));
    expect(el.style.userSelect).toBe("none");
    expect(el.style.webkitUserSelect).toBe("none");
  });
});
