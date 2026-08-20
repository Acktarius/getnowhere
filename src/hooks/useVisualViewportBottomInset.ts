import { useEffect, useState } from "react";

/** Overlap between layout viewport and visual viewport (on-screen keyboard). */
function readVisualViewportBottomInset(): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
}

/**
 * Tracks bottom inset when the on-screen keyboard shrinks the visual viewport.
 * Used to float fixed composers above the keyboard on mobile WebView.
 */
export function useVisualViewportBottomInset(enabled: boolean): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setInset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      setInset(readVisualViewportBottomInset());
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [enabled]);

  return inset;
}
