import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useIosKeyboardInset } from "@/hooks/useIosKeyboardInset";

describe("useIosKeyboardInset", () => {
  afterEach(() => {
    delete (window as Window & { __gnhIosKeyboardHeight?: number })
      .__gnhIosKeyboardHeight;
  });

  it("stays null until the shell reports a frame", () => {
    const { result } = renderHook(() => useIosKeyboardInset(true));
    expect(result.current).toBeNull();
  });

  it("tracks gnh-ios-keyboard while a field is focused", () => {
    const field = document.createElement("textarea");
    document.body.appendChild(field);
    field.focus();
    const { result, rerender } = renderHook(
      ({ enabled }) => useIosKeyboardInset(enabled),
      { initialProps: { enabled: true } },
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("gnh-ios-keyboard", { detail: 320 }),
      );
    });
    expect(result.current).toBe(320);

    act(() => {
      window.dispatchEvent(new CustomEvent("gnh-ios-keyboard", { detail: 0 }));
    });
    expect(result.current).toBe(0);

    rerender({ enabled: false });
    expect(result.current).toBeNull();
    field.remove();
  });

  it("drops to 0 on dismiss and ignores a leftover show frame", () => {
    const field = document.createElement("textarea");
    document.body.appendChild(field);
    field.focus();
    const { result } = renderHook(() => useIosKeyboardInset(true));
    act(() => {
      window.dispatchEvent(
        new CustomEvent("gnh-ios-keyboard", { detail: 320 }),
      );
    });
    expect(result.current).toBe(320);

    act(() => {
      field.blur();
      window.dispatchEvent(new CustomEvent("gnh-ios-keyboard", { detail: 0 }));
      window.dispatchEvent(
        new CustomEvent("gnh-ios-keyboard", { detail: 320 }),
      );
    });
    expect(result.current).toBe(0);
    field.remove();
  });
});
