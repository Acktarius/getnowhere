import { describe, expect, it } from "vitest";
import { bindPointerToggle } from "../../src/lib/pointer-toggle";

function makeExpandHandlers(initial = false) {
  let open = initial;
  const { onPointerDown, onClick } = bindPointerToggle(
    { current: false },
    () => {
      open = !open;
    },
  );
  return {
    getOpen: () => open,
    handlePointerDown: onPointerDown,
    handleClick: onClick,
  };
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
    handleClick();
    expect(getOpen()).toBe(true);
  });

  it("second pointerdown collapses", () => {
    const { getOpen, handlePointerDown, handleClick } =
      makeExpandHandlers(false);
    handlePointerDown({ button: 0 });
    handleClick();
    handlePointerDown({ button: 0 });
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
    handlePointerDown({ button: 2 });
    expect(getOpen()).toBe(false);
  });
});
