/** Shared first-finger expand: flip on pointerdown, ignore the trailing click. */

export type PointerToggleGuard = { current: boolean };

export function bindPointerToggle(
  guard: PointerToggleGuard,
  toggle: () => void,
) {
  return {
    onPointerDown(e: { button: number }) {
      if (e.button !== 0) return;
      guard.current = true;
      toggle();
    },
    onClick() {
      if (guard.current) {
        guard.current = false;
        return;
      }
      toggle();
    },
  };
}
