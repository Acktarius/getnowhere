import { useEffect, useState } from "react";

const EVENT = "gnh-ios-keyboard";

type IosKeyboardWindow = Window & { __gnhIosKeyboardHeight?: number };

function publishIosKeyboardHeight(height: number): void {
  const next = Math.max(0, Math.round(height));
  (window as IosKeyboardWindow).__gnhIosKeyboardHeight = next;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
}

/** Ask the iOS shell to dismiss the keyboard and drop the composer immediately. */
export function dismissIosKeyboard(): void {
  publishIosKeyboardHeight(0);
  window.ReactNativeWebView?.postMessage(
    JSON.stringify({ channel: "gnh-keyboard", action: "dismiss" }),
  );
}

function readInjectedHeight(): number | null {
  if (typeof window === "undefined") return null;
  const value = (window as IosKeyboardWindow).__gnhIosKeyboardHeight;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, value);
}

/**
 * Keyboard overlap injected by the iOS shell (`keyboardWillChangeFrame`).
 * `null` until the shell reports a frame — callers keep the visual-viewport fallback.
 * @see docs/architecture/web-vs-wrapper.md
 */
export function useIosKeyboardInset(enabled: boolean): number | null {
  const [height, setHeight] = useState<number | null>(() =>
    enabled ? readInjectedHeight() : null,
  );

  useEffect(() => {
    if (!enabled) {
      setHeight(null);
      return;
    }
    const apply = (value: unknown) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return;
      const next = Math.max(0, value);
      // A late show-frame after blur left the composer floating. Ignore it.
      const field = document.activeElement;
      const typing =
        field instanceof HTMLTextAreaElement ||
        field instanceof HTMLInputElement;
      if (next > 0 && !typing) return;
      setHeight(next);
    };
    apply(readInjectedHeight());
    const onFrame = (event: Event) => {
      apply((event as CustomEvent<number>).detail);
    };
    window.addEventListener(EVENT, onFrame);
    return () => window.removeEventListener(EVENT, onFrame);
  }, [enabled]);

  return height;
}
