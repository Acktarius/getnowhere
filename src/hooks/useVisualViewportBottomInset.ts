import { useEffect, useState } from "react";

/** Visible frame + keyboard overlap from `window.visualViewport`. */
export type VisualViewportKeyboardFrame = {
  /** Overlap under the visual viewport (on-screen keyboard), in px. */
  bottomInset: number;
  /** `visualViewport.offsetTop` — iOS often pans this when focusing inputs. */
  offsetTop: number;
  /** `visualViewport.height` — visible band above the keyboard. */
  height: number;
};

function readVisualViewportKeyboardFrame(): VisualViewportKeyboardFrame {
  const vv = window.visualViewport;
  if (!vv) {
    return {
      bottomInset: 0,
      offsetTop: 0,
      height: window.innerHeight,
    };
  }
  return {
    bottomInset: Math.max(0, window.innerHeight - vv.height - vv.offsetTop),
    offsetTop: Math.max(0, vv.offsetTop),
    height: Math.max(0, vv.height),
  };
}

const DISABLED_FRAME: VisualViewportKeyboardFrame = {
  bottomInset: 0,
  offsetTop: 0,
  height: 0,
};

/**
 * Tracks the visual viewport while the on-screen keyboard is up.
 * Mobile chat rooms float the composer and stick the thread to the bottom.
 * @see docs/architecture/web-vs-wrapper.md
 */
export function useVisualViewportBottomInset(
  enabled: boolean,
): VisualViewportKeyboardFrame {
  const [frame, setFrame] = useState<VisualViewportKeyboardFrame>(() =>
    enabled && typeof window !== "undefined"
      ? readVisualViewportKeyboardFrame()
      : DISABLED_FRAME,
  );

  useEffect(() => {
    if (!enabled) {
      setFrame(DISABLED_FRAME);
      return;
    }

    const update = () => {
      setFrame(readVisualViewportKeyboardFrame());
    };

    update();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    // Android WebView often resizes the layout viewport without vv events.
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [enabled]);

  return frame;
}
