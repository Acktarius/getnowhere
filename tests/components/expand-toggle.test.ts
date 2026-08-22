import { describe, expect, it } from "vitest";

/**
 * Inline model of the pointerdown + click-guard pattern used in
 * RelationshipStateCard, PaymentIdField QR chevron, and ShareRow QR chevron.
 * Tests the toggle behaviour without a full React RTL mount.
 */
function makeExpandHandlers(initial = false) {
  let open = initial;
  const ptrHandled = { current: false };

  const setOpen = (updater: (v: boolean) => boolean) => {
    open = updater(open);
  };

  const handlePointerDown = (e: { button: number }) => {
    if (e.button !== 0) return;
    ptrHandled.current = true;
    setOpen((v) => !v);
  };

  const handleClick = () => {
    if (ptrHandled.current) {
      ptrHandled.current = false;
      return; // trailing synthesized click — skip
    }
    setOpen((v) => !v); // keyboard path
  };

  return { getOpen: () => open, handlePointerDown, handleClick };
}

describe("expand toggle handler", () => {
  it("pointerdown (primary) flips open to true", () => {
    const { getOpen, handlePointerDown } = makeExpandHandlers(false);
    handlePointerDown({ button: 0 });
    expect(getOpen()).toBe(true);
  });

  it("trailing synthesized click after pointerdown does not double-toggle", () => {
    const { getOpen, handlePointerDown, handleClick } =
      makeExpandHandlers(false);
    handlePointerDown({ button: 0 });
    handleClick(); // the browser's synthesized click
    expect(getOpen()).toBe(true); // still open
  });

  it("second pointerdown collapses", () => {
    const { getOpen, handlePointerDown, handleClick } =
      makeExpandHandlers(false);
    handlePointerDown({ button: 0 });
    handleClick();
    handlePointerDown({ button: 0 }); // second tap
    handleClick();
    expect(getOpen()).toBe(false);
  });

  it("keyboard click (no prior pointerdown) toggles open", () => {
    const { getOpen, handleClick } = makeExpandHandlers(false);
    handleClick();
    expect(getOpen()).toBe(true);
  });

  it("non-primary pointer button is ignored", () => {
    const { getOpen, handlePointerDown } = makeExpandHandlers(false);
    handlePointerDown({ button: 2 }); // right-click
    expect(getOpen()).toBe(false);
  });
});
