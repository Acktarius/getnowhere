import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "@/components/CopyButton";
import { NonSelectableText } from "@/components/NonSelectableText";
import { SensitiveValue } from "@/components/SensitiveValue";
import { copySensitive } from "@/lib/clipboard/sensitiveClipboard";

vi.mock("@/lib/clipboard/sensitiveClipboard", () => ({
  copySensitive: vi.fn().mockResolvedValue(undefined),
}));

const RAW = "gnh-sv-ccw7m-qk4n9-unique";

function assertNonSelectable(el: HTMLElement): void {
  expect(el.style.userSelect).toBe("none");
  expect(el.style.webkitUserSelect).toBe("none");
}

describe("NonSelectableText", () => {
  afterEach(() => {
    cleanup();
  });

  it("sets userSelect and WebkitUserSelect to none", () => {
    render(<NonSelectableText>{RAW}</NonSelectableText>);
    assertNonSelectable(screen.getByText(RAW));
  });
});

describe("CopyButton", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(copySensitive).mockClear();
  });

  it("calls copySensitive with the raw value only", () => {
    render(
      <div>
        <span>Payment ID</span>
        <CopyButton value={RAW} />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));

    expect(copySensitive).toHaveBeenCalledTimes(1);
    expect(copySensitive).toHaveBeenCalledWith(RAW);
    expect(vi.mocked(copySensitive).mock.calls[0]?.[0]).not.toMatch(
      /Payment ID|label/i,
    );
  });
});

describe("SensitiveValue", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(copySensitive).mockClear();
  });

  it("displays the value as non-selectable", () => {
    render(<SensitiveValue value={RAW} />);
    assertNonSelectable(screen.getByText(RAW));
  });

  it("Copy writes the raw value only, not a nearby label", () => {
    render(
      <div>
        <span>Payment ID</span>
        <SensitiveValue value={RAW} />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));

    expect(copySensitive).toHaveBeenCalledTimes(1);
    expect(copySensitive).toHaveBeenCalledWith(RAW);
    expect(vi.mocked(copySensitive).mock.calls[0]?.[0]).not.toMatch(
      /Payment ID|label/i,
    );
  });
});
