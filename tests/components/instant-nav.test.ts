import { describe, expect, it, vi } from "vitest";
import { bindInstantNav } from "../../src/lib/instant-nav";

vi.mock("@/lib/mobile/gnhMobileBridgeTypes", () => ({
  isMobileHost: () => true,
}));

describe("bindInstantNav", () => {
  it("pointerdown navigates immediately on mobile", () => {
    const guard = { current: false };
    let navigated = false;
    const { onPointerDown } = bindInstantNav(guard, () => {
      navigated = true;
    });
    onPointerDown({ button: 0 });
    expect(navigated).toBe(true);
    expect(guard.current).toBe(true);
  });

  it("trailing click is swallowed after pointerdown", () => {
    const guard = { current: false };
    const { onPointerDown, onClick } = bindInstantNav(guard, () => {});
    onPointerDown({ button: 0 });
    const preventDefault = vi.fn();
    onClick({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(guard.current).toBe(false);
  });

  it("keyboard click navigates without prior pointerdown guard", () => {
    const guard = { current: false };
    let navigated = false;
    const { onClick } = bindInstantNav(guard, () => {
      navigated = true;
    });
    const preventDefault = vi.fn();
    onClick({ preventDefault });
    expect(navigated).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
