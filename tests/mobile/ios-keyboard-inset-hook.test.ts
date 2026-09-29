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

  it("tracks gnh-ios-keyboard and ignores a disabled host", () => {
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
  });
});
