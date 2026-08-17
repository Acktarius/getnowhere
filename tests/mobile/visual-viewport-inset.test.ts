import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVisualViewportBottomInset } from "@/hooks/useVisualViewportBottomInset";

describe("useVisualViewportBottomInset", () => {
  let listeners: Record<string, Set<() => void>>;

  beforeEach(() => {
    listeners = { resize: new Set(), scroll: new Set() };
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        height: 800,
        offsetTop: 0,
        addEventListener: (type: string, fn: () => void) => {
          listeners[type]?.add(fn);
        },
        removeEventListener: (type: string, fn: () => void) => {
          listeners[type]?.delete(fn);
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns zero when disabled", () => {
    const { result } = renderHook(() => useVisualViewportBottomInset(false));
    expect(result.current).toBe(0);
  });

  it("tracks keyboard overlap from visual viewport", () => {
    const { result } = renderHook(() => useVisualViewportBottomInset(true));
    expect(result.current).toBe(0);

    act(() => {
      Object.defineProperty(window.visualViewport, "height", { value: 500 });
      Object.defineProperty(window.visualViewport, "offsetTop", { value: 0 });
      for (const fn of listeners.resize) fn();
    });

    expect(result.current).toBe(300);
  });
});
