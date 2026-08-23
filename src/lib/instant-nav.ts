/** Mobile WebView: navigate on pointerdown, swallow the trailing click. */

import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import type { PointerToggleGuard } from "@/lib/pointer-toggle";

export function bindInstantNav(
  guard: PointerToggleGuard,
  navigate: () => void,
) {
  return {
    onPointerDown(e: { button: number }) {
      if (!isMobileHost() || e.button !== 0) return;
      guard.current = true;
      navigate();
    },
    onClick(e: { preventDefault: () => void }) {
      if (!isMobileHost() || !guard.current) return;
      guard.current = false;
      e.preventDefault();
    },
  };
}
